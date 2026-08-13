# Talos — DoraHacks BUIDL Submission (copy-paste ready)

> Portal was 502 at draft time. When `dorahacks.io/hackathon/agents-onchain` is back, paste each
> field below into the BUIDL form. Logo: `~/Downloads/ChatGPT Image Aug 13, 2026, 01_15_34 PM.png`
> (blue "talos" wordmark). Cover/demo media: `docs/media/talos-run-demo.gif`,
> `docs/media/talos-dashboard-demo.gif`, `docs/media/dashboard-hero.jpg`.

---

## Name
Talos

## Tagline (one-liner)
The eval layer for the agent economy — reproducible evals that emit onchain-attested, graded
verdicts about agent work, with escrow settlement decided by the contract from the onchain score.

## Tracks / bounties
- Main: KeeperHub "Agents Onchain"
- UX bounty ($1000): `pnpm onboard` self-healing checklist + `web/dashboard.html` console

## Tech stack
Solidity (Foundry) · Base Sepolia · Circle USDC (EIP-3009 / x402) · TypeScript keeper (tsx) ·
KeeperHub workflows (webhook + block-interval, gas-sponsored Turnkey signer) · zero-dep HTML console

---

## Description (BUIDL body)

**Talos is a registry of reproducible evals that emit onchain-attested, graded verdicts about
agent work.** An agent's deliverable is graded by a registered evaluator; the verdict — a **score
plus independently-checkable evidence** — is posted onchain as an **attestation**. Any consumer
(an escrow, a marketplace, a reputation reader) acts on that attestation. **Settlement is the
first consumer, not the product.**

### The problem it survives
*"What stops the seller from fooling the evaluator?"* If grading is an LLM plausibility check, an
adversarial seller games it. So Talos grades only the **decidable class**: an eval is registered
only when its verdict is **reproducible**. A verdict cites `evalId + version`; anyone resolves the
registered `evaluatorCodeHash`, re-runs the evaluator on the same `inputHash`, and **must reproduce
the score**. Correctness becomes a *pure function of the input* — reproducibility becomes an
onchain property, not a vibe.

**Graded, not just pass/fail.** A `fieldMatch` eval scores a delivery by the fraction of fields
that reproduce. A 97%-correct delivery clears a 95% bar and releases; a 90%-correct one fails and
refunds — **decided by the contract from the onchain score vs the onchain threshold**. That
graded-fail (90% < 95% → refund) is the money shot.

### Three onchain objects, clean separation
- **EvalRegistry** — catalogue of reproducible evals: name/version, `evaluatorCodeHash`,
  `threshold` (bp), trust tier.
- **AttestationRegistry** — onchain graded verdicts:
  `attest(evalId, deliverableHash, inputHash, score, evidenceHash)`. Reputation reads off
  `Attested` events.
- **TalosEscrow** (a *consumer*) — a deal names an `evalId`; `settle(dealId, attId)` reads the
  attestation and, from the onchain score vs the onchain threshold, releases to the seller or
  refunds the buyer. **The contract picks the branch, not the keeper.**

### Proven live on Base Sepolia (chainId 84532)
Real chain, real Circle USDC, settlement fired through a real KeeperHub workflow calling
`settle(dealId, attId)` with gas sponsored. Every tx verified onchain (`receiptStatus: success`):

| Deal | Eval | Score | Contract decided | settle tx |
|---|---|---|---|---|
| repro-ok | reproduction | 10000 | release | `0xb968c330…c3c1cb6` |
| field-pass | fieldMatch | 9700 ≥ 9500 | release (graded pass) | `0x95f01ea4…d18141f` |
| field-fail | fieldMatch | 9000 < 9500 | refund (graded fail) | `0xd1d526d0…32f8ba5a` |
| repro-fraud | reproduction | 0 | refund (fraud) | `0xc9e288fc…7060b20d` |
| expire | reproduction | — | autonomous deadline refund | `0x19071baf…44a13ec2` (Workflow B, block-interval) |

Tests: 40 Foundry + 9 keeper, all green.

---

## How KeeperHub is used (execution writeup — weighted heaviest)

Two KeeperHub workflows drive all actuation. **Neither embeds business logic — the contract
decides; KeeperHub actuates.**

**Workflow A — `talos-settle` (`9z8xaukywmqwsyfb0kzqo`, enabled).**
Webhook `{dealId, attId}` → Web3 write `settle(bytes32 dealId, bytes32 attId)` on
`TalosEscrow 0xC6b6…0719`. The keeper grades a delivery, posts the score to AttestationRegistry,
then POSTs the webhook (auth: `wfb_` user webhook key). The escrow reads the attestation and
releases iff `score ≥ threshold`, else refunds. Gas sponsored via KeeperHub Turnkey signer
`0x7d08B1E5…33BF4`. All four settle txs above fired through this workflow.

**Workflow B — `talos-refund-deadline` (`e6g38hlw0ykql3u6leont`).**
Block-interval trigger → Web3 read `isExpired(dealId)` → Condition `== true` → Web3 write
`refund(dealId)`. **Genuinely autonomous — no keeper input.** A deal was locked and expired; the
block trigger caught it and refunded on its own:
`0x19071baf79ee42d2bf7479768a5033b3ec5379f7e78c172a71165e0844a13ec2`
(`triggerSource: block`, `receiptStatus: success`). Later ticks correctly no-op'd.

Workflows were built via the KeeperHub MCP (REST CRUD with the `kh_` org key also works).

---

## UX bounty pitch
- `pnpm onboard` — self-healing checklist: deploy → register evals → wire KeeperHub → first settle,
  with actionable fixes at each failed step.
- `web/dashboard.html` — zero-dependency console making eval → attest → settle legible: score-vs-
  threshold meters, the 90% < 95% graded-refund money shot, every settle linking to basescan.

---

## Links
- GitHub: https://github.com/sairammr/Talos
- Contract (explorer): https://sepolia.basescan.org/address/0xC6b6Baa7A80ec471e81F0680BC599A3041410719
- Demo video: <TODO — see Video below>
- Website/console: `web/dashboard.html` (local) <TODO: host if required>

## Deployed contracts — Base Sepolia
| Contract | Address |
|---|---|
| EvalRegistry | `0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47` |
| AttestationRegistry | `0x8C672E44452F4e6522Fe47c63c3bD29e818335e8` |
| TalosEscrow (consumer) | `0xC6b6Baa7A80ec471e81F0680BC599A3041410719` |
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| KeeperHub settler | `0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4` |

---

## Open items before final submit
- [ ] Demo video — GIFs may suffice; optional voiceover screen-recording of `./run.sh --testnet`.
- [ ] Host console if the form requires a live URL.
- [ ] Optional: verify contracts on basescan for readable source.
- [ ] Optional: re-enable Workflow B for a live autonomous leg during judging.
