# Talos — Demo Voiceover Script

Narration for the onboarding walkthrough. Two clips to narrate over:

- `docs/media/talos-pages-demo.gif` — the four-role tour (hero → Buyer → live Held → Seller → Eval author → Keeper).
- `docs/media/talos-ui-demo.gif` — the live lifecycle (register → approve → lock → Held), every step a real Base Sepolia tx signed by a Privy embedded wallet.

Times are cumulative and approximate — pace to your recording. Total ≈ 90s.

---

## 0 · Open — the hook  (0:00–0:10)

**On screen:** hero — *"Add Talos to your agent — verdicts that settle themselves."*

> "Agents are starting to pay each other. But who decides the work was actually done? Talos is the eval layer for the agent economy — money moves only when the work is *provably* correct."

---

## 1 · Buyer agent — pay for correctness  (0:10–0:24)

**On screen:** Buyer panel + the `buyer-agent/lock.ts` snippet with the evalId filled in.

> "If your agent pays for work, you don't transfer funds — you *lock* them in escrow, naming an eval that defines 'correct.' The escrow releases to the seller only when an on-chain-attested score clears the eval's threshold. Otherwise it refunds you. No trusting the counterparty."

---

## 2 · Live — it's real, on-chain  (0:24–0:34)

**On screen:** the "Deal locked · Held on-chain" state (or the `talos-ui-demo.gif` lifecycle).

> "And this is live on Base Sepolia. Connect a wallet, register an eval, approve, lock — every step a real transaction, signed silently by a Privy embedded wallet. The deal is now Held, waiting to settle."

---

## 3 · Seller agent — deliver, get paid  (0:34–0:48)

**On screen:** Seller panel — the x402 `deliver.txt` and the `getDeal` status reader showing **Held**.

> "The seller integrates almost nothing. Deliver your work over x402 — the escrow already holds the payment, so this leg just authenticates the request. You change nothing on-chain. When the eval passes, the funds are yours. Poll `getDeal`, or watch for the Released event."

---

## 4 · Eval author — define 'correct'  (0:48–1:04)

**On screen:** the register form (name, code hash, threshold) and the `evaluators/myEval.ts` snippet.

> "Where does trust come from? The eval. An eval is a *pure function of the input* — reproducible, so anyone can re-run it and must get the same score. That's what makes the verdict trustless, not a vibe. Register yours on-chain in one transaction; it pins a code hash so every score can be reproduced. Graded, not just pass-fail — a ninety-seven-percent delivery clears a ninety-five-percent bar; ninety percent refunds."

---

## 5 · Keeper — grade, attest, settle  (1:04–1:20)

**On screen:** the `keeper/grade-and-attest.ts` and the `keeper/settle.sh` KeeperHub webhook.

> "A keeper ties it together: run the evaluator, post the score to the Attestation Registry, then fire a KeeperHub webhook. But the keeper never decides who gets paid — the *contract* does, from the on-chain score versus the on-chain threshold. Release above the bar, refund below it. Gas sponsored, fully autonomous."

---

## 6 · Close  (1:20–1:30)

**On screen:** back to hero / role tabs.

> "Four roles, one primitive: reproducible evals that settle themselves. That's Talos — the eval layer for the agent economy. Built on KeeperHub, live on Base Sepolia."

---

## Tight version (≈35s, for a short cut)

1. **Hook:** "Agents pay each other now — but who checks the work? Talos is the eval layer: money moves only when work is provably correct."
2. **Buyer:** "Lock funds in escrow naming an eval. It releases only if the attested score clears the threshold — else it refunds."
3. **Author:** "An eval is a pure, reproducible function of the input, registered on-chain. Trustless by construction, and graded — not just pass-fail."
4. **Keeper:** "A keeper grades and attests; KeeperHub actuates. The contract decides release-or-refund from the on-chain score."
5. **Close:** "Live on Base Sepolia. Reproducible evals that settle themselves — that's Talos."

---

### Pronunciation / terms
- **Talos** — TAY-loss (the bronze automaton of Crete).
- **evalId**, **x402**, **EIP-3009**, **KeeperHub**, **Base Sepolia**, **attestation**.
