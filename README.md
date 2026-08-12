# Talos — Conditional Settlement Keeper

> The bronze automaton that circled Crete, enforcing the law with no human hand. Talos is the
> same idea for the agent economy: a machine guardian that weighs delivery and settles funds on
> its own — releasing when work is *proven* correct, refunding itself when a deal expires.

**The trust layer for the agent economy.** Agents pay each other over x402 — but the money only
releases when the work is *provably* correct. An onchain escrow (`TalosEscrow`) holds the funds,
a **deterministic verifier** reproduces the delivery to prove it, and a **KeeperHub** workflow
fires the release-or-refund transaction. No human presses "pay." No human presses "refund."

Built for the KeeperHub **"Agents Onchain"** hackathon (DoraHacks).

---

## The one-liner that survives a hostile judge

> *"What stops the seller from fooling the verifier?"*

Nothing, if verification is an LLM plausibility check — an adversarial seller games it. So Talos
settles **only the decidable class of jobs**: a delivery is `approved` **iff the verifier can
independently reproduce it and byte-compare**. Correctness becomes a *pure function of the
input* — anyone, including the buyer, can re-run the check and get the same verdict. That turns
"trust layer" from a vibe into a **reproducibility guarantee**. (PRD §6a.)

## Three pieces, clean separation of concerns

| Piece | What it does | Where |
|---|---|---|
| **Custody** | `TalosEscrow` holds USDC per deal. Only two terminal transitions: `release` → seller, `refund` → buyer. Single-settlement guard, permissionless deadline refund. | `contracts/src/TalosEscrow.sol` |
| **Decision** | Independent **critic** re-runs the agreed transform and byte-compares. Verdict is the release gate. | `keeper/src/verifier.ts`, `keeper/src/job.ts` |
| **Execution** | **KeeperHub** actuates `release`/`refund` via a workflow Web3 Action (smart gas, backoff, private routing, audit trail). | `keeper/src/keeperhub.ts`, `docs/keeperhub-workflow.md` |

**KeeperHub thinks vs acts, honestly:** the release verdict is computed off-chain (reproducibility
can't be), so KeeperHub *actuates a proven verdict*. The **deadline refund is genuinely
autonomous** — decided entirely inside KeeperHub from onchain state (`isExpired(dealId)`), no
keeper input. That autonomous branch is the honest centerpiece of "KeeperHub acts."

## Run it (zero credentials)

Requires [Foundry](https://getfoundry.sh) (`anvil`, `forge`) and Node ≥ 20 + `pnpm`.

```bash
cd keeper && pnpm install && cd ..
./run.sh
```

`run.sh` spins a local `anvil` chain, deploys `TalosEscrow` + a `MockUSDC` faucet, and runs the
full lifecycle — **every leg a real onchain tx**:

- 3 happy-path deals: `lock` → x402 delivery → critic reproduces → **release** → seller paid
- 1 fraud deal: tampered delivery → critic **rejects** → **refund** to buyer
- 1 expiry deal: no delivery → **autonomous** block-interval refund from onchain state

```
━━ Balances ━━
  buyer  Δ -30.00 USDC
  seller Δ 30.00 USDC   (3 releases = 30 USDC)
━━ Audit trail ━━
  5 settlement rows · 3 released · 2 refunded
```

Then inspect the trail (trigger → verdict → tx hash → gas → outcome, with the reproduced
evidence hash on each row):

```bash
cd keeper && pnpm audit    # or: pnpm deals
```

## Tests

```bash
cd contracts && forge test        # 22 tests: escrow guards, single-settlement, fuzz + EIP-3009 x402
cd keeper    && pnpm test         # 5 tests: reproducibility predicate catches fraud, deterministically
```

## Architecture

```
┌──────────────┐  x402 request/pay   ┌──────────────┐
│ Buyer agent  │────────────────────▶│ Seller agent │  (x402 HTTP delivery endpoint)
└──────┬───────┘  deliver + proof    └──────┬───────┘
       │ lock(USDC)                         │ output + checksum
       ▼                                    ▼
┌──────────────────────┐          ┌────────────────────────┐
│ TalosEscrow (Sepolia)│          │  Settlement Keeper      │
│  lock/release/refund │◀─ reads ─│  watcher · idempotency  │
│  + terminal guard    │          │  · verifier (critic)    │
└──────────┬───────────┘          └──────┬──────────┬───────┘
           │ release/refund tx           │ verify   │ actuate
           │                             ▼          ▼
           │                     ┌──────────────┐ ┌────────────────────────┐
           └─────────────────────│ Critic       │ │ KeeperHub workflow      │
             Web3 Action calls   │ (reproduce + │ │ Trigger→Condition→      │
             release()/refund()  │  byte-cmp)   │ │ Web3 Action release/    │
                                 └──────────────┘ │ refund · gas · routing  │
                                                  │ · audit trail           │
                                                  └────────────┬────────────┘
                                                               ▼  onchain USDC settlement
```

## Deploy to Base Sepolia

Copy `.env.example` → `keeper/.env`, set `RPC_URL`, `CHAIN_ID=84532`, `USDC_ADDRESS`, and distinct
funded keys, then:

```bash
RPC_URL=https://sepolia.base.org CHAIN_ID=84532 USDC_ADDRESS=0x<usdc> \
  SETTLER_ADDR=0x<keeperhub-signer> ./run.sh
```

Wire the two KeeperHub workflows per **`docs/keeperhub-workflow.md`**, set `KEEPERHUB_WEBHOOK_URL`,
and settlement legs actuate through KeeperHub instead of the settler-fallback path.

## Reliability guarantees (PRD §7)

- **Reproducible release gate** — no `release` without the deterministic predicate passing.
- **Contract single-settlement** — `release`/`refund` require `status == Held`, set terminal status atomically. Even a buggy keeper cannot double-pay.
- **Idempotent keeper** — guards on a local flag *and* re-reads onchain status before actuating.
- **Timeout safety net** — permissionless refund after the deadline; funds are never stuck.
- **Retry/backoff** — settlement tx retries with backoff (KeeperHub smart-gas on the hosted path).
- **Observability** — every decision + verdict + tx hash + gas + outcome in the audit trail.

## Layout

```
contracts/        Foundry: TalosEscrow, MockUSDC, tests, deploy script
keeper/src/
  job.ts          deterministic transforms (the decidable job class)
  verifier.ts     critic — the reproducibility release gate
  adapters/       x402 delivery adapter (EIP-3009 auth, settled onchain — real USDC moves)
  agents/         buyer (lock), seller (x402 delivery, honest/fraud modes)
  keeperhub.ts    actuation: workflow webhook  ·  settler-fallback
  watcher.ts      idempotent settlement loop
  demo.ts         the end-to-end run
  cli.ts          audit view
docs/keeperhub-workflow.md   the two workflow graphs + Hour-1 blocker
run.sh            one-command demo
```

## Scope

**Shipped (MVP + target):** escrow contract on-chain, x402 delivery adapter, independent
deterministic critic, idempotent watcher, KeeperHub actuation (webhook + fallback), autonomous
deadline refund, looped multi-deal flow, live fraud→refund, audit trail. **Out of scope:**
multi-party/milestone splits, arbitration beyond critic+timeout, extra condition adapters (the
`checkCondition` interface is built for pluggability; only the x402 adapter ships).
