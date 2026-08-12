# Talos on Base Sepolia — the zero-mock runbook

The local demo (`./run.sh`) is fully real EVM but uses anvil + MockUSDC + the settler-fallback
actuator. This runbook removes those last three mocks: **real chain (Base Sepolia), real Circle
USDC, and settlement fired through a real KeeperHub workflow.**

Everything that can be prepared without your accounts is already done:

- 4 agent wallets generated → `keeper/.wallets.json` (gitignored)
- `keeper/.env.testnet` scaffolded with keys, your KeeperHub API key, chain + USDC config
- Base Sepolia USDC verified from Circle docs: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

Two steps below need **you** (they hit credential/CAPTCHA rails I won't cross): faucet funding
and creating the KeeperHub workflow. Everything after runs with one command.

---

## Wallet addresses to fund

| Role | Address | Needs |
|---|---|---|
| deployer | `0x329b73C15c8280AF171A1Ccb1C036C6F098EEF5c` | Base Sepolia ETH (gas) |
| buyer | `0x0409542bF628a8e951c70ab25334a641C6569638` | Base Sepolia ETH + **USDC** |
| seller | `0x60E34Ea8741e183B62Ab7C84d77F7Dc72a1b8f22` | Base Sepolia ETH (x402 relay gas) |
| settler | `0xFd06FD2d2E3cAFd4C66a20f0B1B124d8bfebE06d` | ETH — **only if** using the fallback actuator (skip if using real KeeperHub) |

---

## Step 1 — Fund the wallets (you: faucets)

- **ETH** (deployer, buyer, seller ~0.02 each): any Base Sepolia faucet
  - https://portal.cdp.coinbase.com/products/faucet  (Base Sepolia)
  - or https://www.alchemy.com/faucets/base-sepolia
- **USDC** (buyer only, 20 is plenty — deals are 1 USDC on testnet): https://faucet.circle.com
  → select **Base Sepolia** → paste the **buyer** address.

Verify funding:
```bash
cast balance 0x0409542bF628a8e951c70ab25334a641C6569638 --rpc-url https://sepolia.base.org
cast call 0x036CbD53842c5426634e7929541eC2318f3dCF7e "balanceOf(address)(uint256)" \
  0x0409542bF628a8e951c70ab25334a641C6569638 --rpc-url https://sepolia.base.org
```

## Step 2 — Create the KeeperHub workflow (you: UI; kills mock #3)

Your API key can *call* workflows but not *create* them (creation is UI/OAuth only). Log into
**app.keeperhub.com** and build two workflows on **Base Sepolia** pointing at the deployed
escrow (deploy first if you want the address — Step 3 — then come back, or build with a
placeholder and edit the address).

**Workflow A — `talos-settle` (webhook → settle):** the eval layer moves the decision onchain, so
the workflow is a single write; the *contract* branches on the attested score vs the eval threshold.
```
Trigger:   Webhook           body params: { dealId: string, attId: string }
Action:    Web3 write  <escrow>.settle(bytes32 dealId, bytes32 attId)   on Base Sepolia
```
(The keeper registers evals + posts the graded attestation onchain before firing this webhook.)
- Copy the **Web3 Action signer address** (the Turnkey wallet) → this is `KEEPERHUB_SIGNER`.
- Copy the workflow **call URL** → `https://app.keeperhub.com/api/mcp/workflows/<slug>/call`.

**Workflow B — `talos-refund-deadline` (autonomous, PRD §3a centerpiece):**
```
Trigger:   Block Interval    on Base Sepolia
Read:      Web3 read   <escrow>.isExpired(bytes32 dealId) → bool
Condition: isExpired == true
Action:    Web3 write  <escrow>.refund(bytes32 dealId)
```
This branch decides entirely from onchain state — no keeper input.

Then fill `keeper/.env.testnet`:
```
KEEPERHUB_WEBHOOK_URL=https://app.keeperhub.com/api/mcp/workflows/<slug>/call
KEEPERHUB_SIGNER=0x<turnkey-address-from-workflow-A>
```

> **Skipping KeeperHub for now?** Leave `KEEPERHUB_WEBHOOK_URL` unset. The run uses the
> settler-fallback actuator — still real Base Sepolia txs + audit trail — just not fired
> *through* KeeperHub. Fund the `settler` wallet with ETH in that case.

## Step 3 — Deploy + run (one command)

```bash
./run.sh --testnet
```

This sources `keeper/.env.testnet`, deploys `TalosEscrow` against **real Circle USDC** on Base
Sepolia, sets `escrow.settler` to your `KEEPERHUB_SIGNER` (if set), and runs the full lifecycle.
With `KEEPERHUB_WEBHOOK_URL` set, every release/refund fires **through the KeeperHub workflow**;
the audit trail records `actuator: keeperhub-workflow`.

## Step 4 — Verify (all real, all linkable)

- `cd keeper && DEAL_USDC=1 npx tsx src/cli.ts audit` — trigger → verdict → tx → outcome
- Every `lock` / `release` / `refund` on **https://sepolia.basescan.org**
- Every x402 `transferWithAuthorization` leg on basescan (mainnet legs index on x402scan)
- The KeeperHub run log for each settlement (its own audit trail)

## What's real after this

| Mock | Status after runbook |
|---|---|
| #1 chain | **real** — Base Sepolia |
| #2 token | **real** — Circle USDC (`0x036C…F7e`), EIP-3009 |
| #3 actuation | **real** — fired through the KeeperHub workflow (Step 2) |
| #4 x402 | **real** — already onchain locally + testnet |
| #5 agents | still one process (cosmetic; not a correctness mock) |
