# Talos — Handoff

State of the project for the next person (or the next session). Everything here is current as of
the latest `main`. **No secrets in this file** — private keys and API keys live in gitignored files
(see [Credentials](#credentials)).

---

## TL;DR

Talos is **the eval layer for the agent economy**: a registry of *reproducible* evals that emit
**onchain-attested, graded verdicts** about agent work. A deal names an `evalId`; a keeper grades
the delivery, posts the score to an `AttestationRegistry`, and KeeperHub calls
`settle(dealId, attId)` — the **escrow decides release vs refund from the onchain score vs the eval
threshold**. Settlement is the first consumer, not the product.

- **Repo:** `github.com/sairammr/Talos` · branch `main`
- **Status:** eval-layer pivot **complete + live on Base Sepolia**. Both KeeperHub workflows proven.
- **Tests:** 40 Foundry + 9 keeper — all green.
- **Built for:** KeeperHub "Agents Onchain" hackathon (DoraHacks).

---

## What's built (all done)

| Layer | What | Where |
|---|---|---|
| Contracts | `EvalRegistry`, `AttestationRegistry`, `TalosEscrow` (consumer, score-gated `settle`) | `contracts/src/` |
| Evaluator SDK | `reproduction` (100%), `fieldMatch` (95%, graded), `signature` (100%) + registry | `keeper/src/evaluators/` |
| Keeper | register evals → evaluate → attest → `settle(dealId,attId)`; idempotent watcher; autonomous deadline refund | `keeper/src/{attest,keeperhub,watcher}.ts` |
| Agents | buyer (locks w/ evalId), seller (standalone x402 process, per-eval delivery modes) | `keeper/src/agents/` |
| Demo | register → 5-leg lifecycle (graded pass/fail money shot, fraud, expiry) → reputation | `keeper/src/demo.ts` |
| Onboarding | `pnpm onboard` self-healing checklist + `web/dashboard.html` console | `keeper/src/onboard.ts`, `web/` |
| Docs/media | results (tx links), design spec, two demo GIFs | `docs/` |

---

## Onchain — Base Sepolia (chainId 84532)

| Contract | Address |
|---|---|
| EvalRegistry | `0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47` |
| AttestationRegistry | `0x8C672E44452F4e6522Fe47c63c3bD29e818335e8` |
| **TalosEscrow** (consumer) | `0xC6b6Baa7A80ec471e81F0680BC599A3041410719` |
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Escrow settler | `0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4` (KeeperHub Turnkey signer) |

Evals are already **registered onchain** on the EvalRegistry above (reproduction, fieldMatch,
signature). Explorer: https://sepolia.basescan.org/address/0xC6b6Baa7A80ec471e81F0680BC599A3041410719

---

## Wallets (funded on Base Sepolia)

| Role | Address | Needs |
|---|---|---|
| deployer | `0x329b73C15c8280AF171A1Ccb1C036C6F098EEF5c` | ETH (deploy) |
| buyer | `0x0409542bF628a8e951c70ab25334a641C6569638` | ETH + USDC (locks) |
| seller | `0x60E34Ea8741e183B62Ab7C84d77F7Dc72a1b8f22` | ETH (x402 relay) |
| settler / keeper | `0xFd06FD2d2E3cAFd4C66a20f0B1B124d8bfebE06d` | ETH (registers evals + attests) |
| KeeperHub signer | `0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4` | KeeperHub Turnkey; gas **sponsored** |

Balances at last check: buyer ~12.8 USDC / ~0.05 ETH; seller/settler ~0.01 ETH each. Faucets in
`TESTNET.md` if they run low. Private keys: `keeper/.wallets.json` + `keeper/.env.testnet` (gitignored).

---

## KeeperHub workflows

Built via KeeperHub (MCP originally; REST works too — see gotcha below).

| Workflow | ID | Flow | State |
|---|---|---|---|
| **talos-settle** (A) | `9z8xaukywmqwsyfb0kzqo` | Webhook `{dealId, attId}` → `settle(dealId, attId)` | **enabled** |
| **talos-refund-deadline** (B) | `e6g38hlw0ykql3u6leont` | Block-interval → `isExpired` → `refund(dealId)` | **disabled** after last run |

- Both point at escrow `0xC6b6…0719`. Workflow A decides nothing — the **contract** branches on the
  onchain score. Workflow B is genuinely autonomous (no keeper input).
- **Webhook URL:** `https://app.keeperhub.com/api/workflows/9z8xaukywmqwsyfb0kzqo/webhook`
- **Auth:** the keeper POSTs with a **`wfb_` user webhook key** (in `keeper/.env.testnet` as
  `KEEPERHUB_API_KEY`). **NOT** the `kh_` org key — see gotcha #1.

### To re-run Workflow B autonomously
It's wired to a specific expired `dealId` and disabled. To demo again: lock a fresh short-deadline
deal on `0xC6b6`, PATCH the workflow's `read-1`/`refund-1` `functionArgs` to the new `dealId`, set
`enabled:true`, wait for the block trigger, then disable. (Exactly what
`docs/keeperhub-testnet-results.md` describes; tx `0x19071baf…` is the last proof.)

---

## How to run

### Local (zero credentials)
```bash
cd keeper && pnpm install && cd ..
./run.sh                 # anvil + deploy + seller process + 5-leg demo, all onchain-local
cd keeper && pnpm test   # 9 keeper tests
cd contracts && forge test   # 40 contract tests
```

### Real Base Sepolia (existing deployment, KeeperHub settlement)
Runs the demo against `0xC6b6` with Workflow A settling — real tx hashes, gas sponsored:
```bash
set -a; . keeper/.env.testnet; set +a
export ESCROW_ADDRESS=0xC6b6Baa7A80ec471e81F0680BC599A3041410719 \
       USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
       EVAL_REGISTRY_ADDRESS=0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47 \
       ATTESTATION_REGISTRY_ADDRESS=0x8C672E44452F4e6522Fe47c63c3bD29e818335e8
cd keeper && npx tsx src/demo.ts
```
`./run.sh --testnet` also works but **redeploys** a fresh stack — you'd then have to re-point
Workflow A at the new escrow (PATCH `contractAddress`) or settlement fires on the old one.

### Onboarding + console
```bash
cd keeper && pnpm onboard        # self-healing checklist (deploy, evals, KeeperHub, first settle)
open web/dashboard.html          # the console (self-contained, zero deps)
```

---

## Gotchas / known issues

1. **`kh_` vs `wfb_` keys.** The per-workflow **webhook** requires a **`wfb_` user webhook key**
   (KeeperHub → API Keys → **User** tab, needs 2FA to mint). The **`kh_` org key** is for
   `/api/execute/*`, `/mcp`, and **REST workflow CRUD** — NOT the webhook. Mixing them → 401.
2. **KeeperHub MCP OAuth expires.** The `mcp__keeperhub__*` tools 401 after a while and there's no
   re-auth tool surfaced. Fallback: drive the REST API with the `kh_` key, e.g.
   `curl -X PATCH https://app.keeperhub.com/api/workflows/<id> -H "Authorization: Bearer kh_…" -d @body.json`
   (GET/PATCH confirmed working; `analytics/runs` lists executions).
3. **Public RPC flakiness.** `https://sepolia.base.org` throws intermittent 502s and drops rapid
   sequential txs. `lockDeal` is hardened (confirm Held onchain + retry). If a run half-fails,
   re-run — nonces are salted per run (`RUN_TAG`), so no `DealExists` collisions.
4. **`eth_getLogs` 10k-block cap** on the public RPC — `readAttestations` bounds the window.
5. **Async settlement.** KeeperHub `settle` is async; the demo posts the webhook and reconciles
   onchain before the summary. A leg showing `onchain=None` means its lock reverted (now guarded).

---

## Credentials

All gitignored, never committed:
- `keeper/.wallets.json` — the 4 agent private keys.
- `keeper/.env.testnet` — keys + `RPC_URL`, `USDC_ADDRESS`, `KEEPERHUB_WEBHOOK_URL`,
  `KEEPERHUB_API_KEY` (the `wfb_` key), `DEAL_USDC=1`.
- `keeper/.deploy.json` / `.deploy.testnet.json` — deployment addresses (regenerated).
- KeeperHub account: `sairam1203mr@gmail.com` (org "Sai Ram's Organization"). Minting keys /
  building workflows in the UI needs email + authenticator 2FA — **only the human can do this**.

---

## What's left (for submission)

- [ ] **DoraHacks BUIDL text** — description + KeeperHub-usage writeup (execution is weighted
      heaviest; lead with the onchain `settle` tx links in `docs/keeperhub-testnet-results.md`).
- [ ] **Demo video** — the two GIFs (`docs/media/talos-run-demo.gif` real testnet run,
      `talos-dashboard-demo.gif` console) + basescan links likely suffice; optional voiceover.
- [ ] **UX bounty ($1000)** — lead with `pnpm onboard` + the console.
- [ ] Optional: re-enable Workflow B for a live autonomous leg during judging (steps above).
- [ ] Optional: verify contracts on basescan for readable source.

---

## File map

```
contracts/src/        EvalRegistry · AttestationRegistry · TalosEscrow (consumer) · MockUSDC
contracts/test/       40 tests (registries, score-gated settle, graded pass/fail, fuzz, EIP-3009)
keeper/src/
  evaluators/         Evaluator SDK — reproduction, fieldMatch (graded), signature, registry, types
  attest.ts           register evals onchain · evaluate → attest → attId
  keeperhub.ts        actuation: settle(dealId,attId) via webhook · settler-fallback · deadline refund
  watcher.ts          idempotent settle-intent loop + autonomous deadline path
  agents/             buyer (lock w/ evalId) · seller (standalone x402 process)
  adapters/           x402 delivery (EIP-3009, settled onchain)
  demo.ts             end-to-end run   ·   cli.ts  audit/deals/reputation   ·   onboard.ts  checklist
web/dashboard.html    the console (self-contained)
docs/
  keeperhub-testnet-results.md   live tx links (Workflow A settles + Workflow B autonomous)
  keeperhub-workflow.md          workflow graphs
  media/                         talos-run-demo.gif · talos-dashboard-demo.gif · dashboard-hero.jpg
  superpowers/specs/…            the eval-layer design spec (source of truth for the pivot)
run.sh                one-command demo (local; --testnet for Base Sepolia)
TESTNET.md            Base Sepolia runbook (faucets, workflow build)
```
