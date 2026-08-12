// The Evaluator SDK — the off-chain half of the eval layer.
//
// An evaluator grades a delivery and emits a Verdict (a score in basis points + evidence).
// "Reproducible" means: anyone who resolves the eval's `codeHash`, re-runs THIS evaluator on
// the same input, gets the same score and the same `evidenceHash`. The score is derived, never
// judged. The keeper posts the Verdict to AttestationRegistry; the escrow settles from the
// onchain score vs the onchain threshold.
import { keccak256, stringToHex, encodeAbiParameters, type Hex } from "viem";

export interface Verdict {
  score: number; // basis points 0..10000
  inputHash: Hex; // pins WHAT was evaluated (the input/spec)
  deliverableHash: Hex; // hash of the delivery graded
  evidence: Record<string, unknown>; // independently-checkable recompute detail
  evidenceHash: Hex; // hash of `evidence` (canonical)
  reason: string; // human-readable one-liner for logs
}

export interface Evaluator {
  id: string; // "reproduction" | "fieldMatch" | "signature"
  name: string; // eval name registered onchain
  version: number; // eval version registered onchain
  trustTier: "reproducible";
  threshold: number; // default pass bar (basis points) registered onchain
  codeHash: Hex; // reproducibility anchor: pinned identity of THIS implementation
  evaluate(input: unknown, delivery: unknown): Verdict | Promise<Verdict>;
}

// Canonical JSON (sorted keys) so evidence hashes are stable across machines/languages.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function hashOf(v: unknown): Hex {
  return keccak256(stringToHex(canonical(v)));
}

// eval id MUST match Solidity: keccak256(abi.encode(string name, uint16 version)).
export function evalIdOf(name: string, version: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint16" }], [name, version]));
}

// codeHash: pinned identity of an evaluator implementation (spec §10). Both the keeper's
// registration tx and the evaluator declare the same value, so a verdict's eval resolves to it.
export function codeHashOf(id: string, version: number): Hex {
  return keccak256(stringToHex(`talos:evaluator:${id}:${version}`));
}

// Clamp + round a raw ratio (0..1) to integer basis points.
export function bp(ratio: number): number {
  return Math.max(0, Math.min(10_000, Math.round(ratio * 10_000)));
}
