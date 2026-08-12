// The attest path: register evals onchain, run an evaluator, post its verdict to the
// AttestationRegistry, and hand back the attId the escrow settles on.
//
// Identity: the keeper uses its settler EOA (a funded local key) as BOTH the eval author and
// the evaluator that signs attestations. `attest` is permissionless — the escrow trusts an
// attestation only for its named evalId and applies the onchain threshold.
import { type Hex } from "viem";
import { config } from "./config.js";
import { registerEval, evalExists, attest } from "./chain.js";
import { EVALUATORS, evalIdFor } from "./evaluators/registry.js";
import type { Evaluator, Verdict } from "./evaluators/types.js";
import { log } from "./logger.js";

const KEEPER_KEY = config.settlerKey; // funded EOA: eval author + evaluator identity
const ZERO32 = ("0x" + "0".repeat(64)) as Hex;

// Register every SDK evaluator onchain (idempotent — skips ones already registered).
export async function ensureEvalsRegistered(): Promise<void> {
  for (const e of EVALUATORS) {
    const id = evalIdFor(e);
    if (await evalExists(id)) continue;
    await registerEval(KEEPER_KEY, e.name, e.version, e.codeHash, e.threshold, ZERO32);
    log.info(`registered eval ${e.name}@${e.version} (threshold ${(e.threshold / 100).toFixed(0)}%) → ${id.slice(0, 10)}…`);
  }
}

export interface AttestResult {
  verdict: Verdict;
  attId: Hex;
  txHash: Hex;
  passed: boolean;
}

// Grade a delivery and attest the verdict onchain. Returns the attId + whether it passed
// (score >= the evaluator's threshold) — the escrow re-checks this from onchain state.
export async function evaluateAndAttest(
  evaluator: Evaluator,
  input: unknown,
  delivery: unknown
): Promise<AttestResult> {
  const verdict = await evaluator.evaluate(input, delivery);
  const { attId, txHash } = await attest(KEEPER_KEY, {
    evalId: evalIdFor(evaluator),
    version: evaluator.version,
    deliverableHash: verdict.deliverableHash,
    inputHash: verdict.inputHash,
    score: verdict.score,
    evidenceHash: verdict.evidenceHash,
  });
  return { verdict, attId, txHash, passed: verdict.score >= evaluator.threshold };
}
