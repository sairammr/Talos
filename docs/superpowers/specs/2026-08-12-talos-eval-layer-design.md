# Talos — The Eval Layer for the Agent Economy (design)

**Date:** 2026-08-12
**Status:** Approved design, pre-plan
**Supersedes positioning of:** `conditional-settlement-keeper-prd.md` (v3). The custody +
KeeperHub + x402 machinery is retained; the *product* is repositioned from "conditional
settlement keeper" to "eval layer," with settlement demoted to one consumer of a verdict.

---

## 1. Summary

Talos is a registry of **reproducible evals** that emit **onchain-attested, graded verdicts**
about agent work. An agent's deliverable is evaluated by a registered evaluator; the verdict
(a score + independently-checkable evidence) is posted onchain as an attestation. Any consumer
— an escrow, a marketplace, a reputation reader — acts on the attestation. Settlement is the
first consumer, not the product.

**Trust claim (the moat):** a verdict cites `evalId + version` → anyone resolves the registered
`evaluatorCodeHash`, re-runs the evaluator on the same `inputHash`, and must reproduce the
score. Reproducibility is a first-class *onchain* property. v1 registers only `Reproducible`
evals; a `trustTier` field leaves room for `Attested` and `Judged` (LLM/rubric) tiers later,
clearly labeled lower-trust.

**Direction:** broader product (not deadline-bound), but onchain attestation is the spine.
KeeperHub runs the eval workflow and actuates settlement; the `Reproducible` tier is the wedge.

## 2. Goals & non-goals

**Goals**
- An `EvalRegistry` and `AttestationRegistry` onchain; evals registered, verdicts attested.
- An off-chain evaluator SDK with a clean `Evaluator` interface and ≥3 reproducible evaluators,
  one of them **graded** (`fieldMatch`).
- `TalosEscrow` refactored into a *consumer*: a deal names an `evalId`; `settle` reads an
  attestation and releases iff `score ≥ threshold`, else refunds.
- KeeperHub workflow that reads the onchain attestation score and decides the settlement branch.
- Reputation view from `Attested` events. Everything runs on local anvil (zero creds) and on
  Base Sepolia via `--testnet`.

**Non-goals (explicit; schema leaves room)**
- No `Judged`/LLM tier, no rubric/multi-criterion verdicts in v1.
- No evaluator staking/slashing (future economic-security layer).
- No `testExec` sandboxed evaluator in v1 (designed, not shipped).
- No EAS mirror (documented future adapter).
- Not a marketplace; eval authorship is curated in v1.

## 3. Core objects

### Eval (onchain definition — `EvalRegistry`)
```
Eval {
  id: bytes32                 // keccak(name, version)
  name: string
  version: uint16
  evaluatorCodeHash: bytes32  // hash of the evaluator implementation (reproducibility anchor)
  trustTier: enum { Reproducible, Attested, Judged }   // v1 registers only Reproducible
  threshold: uint16           // basis points (0..10000) a score must reach to pass
  schemaHash: bytes32         // hash of the input/delivery schema
  author: address
}
```
Immutable once registered. A new version is a new entry (new `id`).

### Evaluator (off-chain code)
```ts
interface Evaluator {
  id: string                  // "reproduction" | "fieldMatch" | "signature"
  codeHash: Hex               // hash of THIS implementation; must equal the registered eval's
  trustTier: "reproducible"
  evaluate(input: unknown, delivery: unknown): Verdict
}
```
A local registry maps `evalId → Evaluator`. `codeHash` is computed from the evaluator module's
canonical source/bytecode and pinned at eval-registration time.

### Verdict (off-chain result)
```
Verdict {
  evalId: bytes32
  version: uint16
  deliverableHash: bytes32    // hash of the delivery evaluated
  inputHash: bytes32          // hash of the input/spec (pins WHAT was evaluated)
  score: uint16               // basis points 0..10000
  passed: boolean             // score >= eval.threshold
  evidence: object            // recomputed hashes / per-field results — independently checkable
  evidenceHash: bytes32
  evaluator: address
  evaluatorSig: Hex           // evaluator signs the attestation payload
}
```

### Attestation (onchain record — `AttestationRegistry`)
```
attest(evalId, version, deliverableHash, inputHash, score, evidenceHash)
  → attId
  → stored: { attId, evalId, version, deliverableHash, inputHash, score, evidenceHash,
              evaluator, timestamp }
  → emits Attested(attId, evaluator, evalId, deliverableHash, score)
```

## 4. Evaluators (v1, all `reproducible`)

| id | Score | Reproducible because | v1 |
|---|---|---|---|
| `reproduction` | binary 10000/0 — re-run the agreed transform, byte-compare output hash | output is a pure function of input | ships |
| `fieldMatch` | **graded** — fraction of records/fields that reproduce (97/100 → 9700) | each field re-derived independently | ships |
| `signature` | binary — payload signed by a named oracle pubkey (ECDSA verify) | signature verification is deterministic | ships |
| `testExec` | graded — passed/total against a pinned test image | pinned image hash | designed, NOT v1 (sandbox) |

`fieldMatch` is what makes "graded + threshold" real with a trustless eval: a 97%-correct
delivery with threshold 9500 passes; 90% fails → refund. The score is derived, not judged.

## 5. Contracts

### `EvalRegistry`
- `registerEval(name, version, evaluatorCodeHash, trustTier, threshold, schemaHash) → evalId`
  — author-gated in v1 (owner allowlist of authors). Reverts on duplicate `id`.
- `getEval(evalId) → Eval`.
- Invariants: entries immutable; `threshold ≤ 10000`; `trustTier == Reproducible` enforced in v1
  (registering other tiers reverts until those tiers ship).

### `AttestationRegistry`
- `attest(evalId, version, deliverableHash, inputHash, score, evidenceHash) → attId`
  — records `evaluator = msg.sender`, `timestamp`, emits `Attested`. `score ≤ 10000`, `evalId`
  must exist in `EvalRegistry`.
- `getAttestation(attId) → Attestation`.
- Reputation is read off `Attested` events (indexed by `evaluator` and `evalId`); no extra state.

### `TalosEscrow` (refactored consumer)
- `lock(bytes32 dealId, address seller, uint256 amount, uint64 deadline, bytes32 evalId)`
  — deal now names which eval must pass. `evalId` must exist in `EvalRegistry`.
- `settle(bytes32 dealId, bytes32 attId) external onlySettler`
  — reads the attestation from `AttestationRegistry`; requires `att.evalId == deal.evalId` and
  `att.deliverableHash` bound to the deal; if `att.score ≥ eval.threshold` → **release** to
  seller, else → **refund** to buyer. Terminal-status guard + single-settlement unchanged.
- `refund(bytes32 dealId)` — permissionless after deadline (autonomous safety net), unchanged.
- `isExpired(bytes32 dealId)` — unchanged (block-interval workflow predicate).

**Why stronger than the current build:** the release condition is now onchain-checkable
(attestation exists + `score ≥ threshold` from onchain registries), not a keeper's bare bool.

## 6. Off-chain components (reuse-heavy)

| Current | Becomes |
|---|---|
| `keeper/src/job.ts` | `keeper/src/evaluators/reproduction.ts` (+ `fieldMatch.ts`, `signature.ts`) behind `Evaluator` |
| `keeper/src/verifier.ts` `checkCondition` | `evaluate()` → graded `Verdict` |
| `keeper/src/evaluators/registry.ts` | NEW — maps `evalId → Evaluator`, computes `codeHash` |
| `keeper/src/attest.ts` | NEW — sign Verdict, post `attest()` onchain, return `attId` |
| `keeper/src/keeperhub.ts` | posts attestation, then `settle`; workflow reads score |
| `keeper/src/watcher.ts` | unchanged control flow; verdict path now goes eval → attest → settle |
| `keeper/src/cli.ts` | + `reputation` view from `Attested` events |
| x402 adapter, MockUSDC, EIP-3009, run.sh, TESTNET.md | unchanged |

## 7. Flows

### Happy / graded
```
1. buyer  escrow.lock(dealId, seller, amount, deadline, evalId)              ★ tx
2. seller delivers output + input-ref over x402                             ★ x402 tx
3. keeper resolve evalId → Evaluator.evaluate(input, delivery) → Verdict{score}
4. keeper attestationRegistry.attest(evalId, deliverableHash, score, ...)    ★ tx
5. KeeperHub workflow: Web3 READ attestation.score
      → Condition score ≥ eval.threshold
      → Web3 WRITE escrow.settle(dealId, attId)                             ★ tx via KeeperHub
6. Attested event → reputation ; audit row
```

### Refund paths
- `score < threshold` → step 5 branch takes `settle` → refund.
- deadline passes with no passing attestation → autonomous **block-interval** workflow:
  Web3 read `isExpired(dealId)` → Condition true → Web3 write `refund(dealId)` (permissionless).

## 8. Demo (drives the pitch)

Register two evals: `reproduction` (threshold 10000) and `fieldMatch` (threshold 9500). Then:
1. full-correct delivery → attest 10000 → **release**.
2. 97%-correct delivery → attest 9700 ≥ 9500 → **release** (graded pass).
3. 90%-correct delivery → attest 9000 < 9500 → **refund** (graded fail — the eval-layer money shot).
4. fraud (tampered) → `reproduction` attests 0 → **refund**.
5. expiry → autonomous block-interval **refund**.
6. reputation read: per-seller pass count + mean score from `Attested` events.

Every verdict is onchain-attested; every settlement is a real tx (local anvil, or Base Sepolia).

## 9. Testing

- **Contracts:** `EvalRegistry` (register, dup revert, author gate, tier enforcement, threshold
  bound), `AttestationRegistry` (attest, unknown-eval revert, score bound, event), `TalosEscrow`
  (score-gated settle release vs refund, deliverable binding, single-settlement, permissionless
  deadline refund, fuzz conservation).
- **Keeper units:** each evaluator's score is correct and **reproducible** (same input → same
  score + evidenceHash); `fieldMatch` fractional scoring; attestation payload/signature round-trip.
- **E2E:** `run.sh` (local anvil) runs the §8 demo end-to-end; `run.sh --testnet` on Base Sepolia.

## 10. Assumptions & open items

- `evaluatorCodeHash` = hash of the evaluator module's canonical source, pinned at registration.
  If wrong: switch to a content-addressed bundle hash in Phase 1.
- `deliverableHash` binding: the deal commits to a `deliverableHash` at delivery time (keeper
  records it) so `settle` can require the attestation matches the delivered artifact. If a deal
  must allow re-delivery, add a delivery nonce — out of scope v1.
- Reputation via event queries is sufficient for v1; a dedicated onchain counter is a future
  optimization only if event indexing proves too slow for the demo.
- `attest` is permissionless (records `msg.sender` as evaluator); the escrow trusts an
  attestation only for its named `evalId` and applies the onchain threshold. Evaluator identity
  trust (allowlist/stake) is a future tier, not v1.

## 11. Migration order (for the plan)

1. Contracts: `EvalRegistry`, `AttestationRegistry`, `TalosEscrow` refactor + tests (Phase 1
   proves the score-gated settle onchain).
2. Evaluator SDK: interface + `reproduction`, `fieldMatch`, `signature` + registry + unit tests.
3. Keeper: `attest.ts`, watcher path eval→attest→settle, `keeperhub.ts` score-read workflow.
4. CLI reputation view; demo rewrite (§8); README/positioning update.
5. `--testnet` parity check.
