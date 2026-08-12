// The critic / verifier — an INDEPENDENT process with no shared state with buyer,
// seller, or keeper. Its verdict is the release gate (PRD §6a, §7).
//
// Independence here is NOT a claim about a second LLM's judgment (a solo dev can't
// make that real — every agent is you). It's a claim about REPRODUCIBILITY: the
// verifier re-runs the agreed deterministic transform on the agreed input and
// byte-compares. Anyone can run this exact check and get the same answer.
import { reproduceAndCompare, type JobSpec, type Delivery } from "./job.js";

export interface Verdict {
  approved: boolean;
  reason: string;
  evidence: {
    transform: string;
    inputHash: `0x${string}`;
    expectedChecksum: `0x${string}`;
    deliveredChecksum: `0x${string}`;
  };
}

// checkCondition(deal, delivery) → {approved, reason, evidence} — the adapter interface.
// Ship only this x402-delivery adapter; the interface is the pluggability story.
export function checkCondition(spec: JobSpec, delivery: Delivery): Verdict {
  const { approved, expected, got, inputHash } = reproduceAndCompare(spec, delivery);
  return {
    approved,
    reason: approved
      ? "delivery reproduced byte-for-byte from the referenced input"
      : `checksum mismatch: expected ${expected}, delivered ${got}`,
    evidence: {
      transform: spec.transform,
      inputHash,
      expectedChecksum: expected,
      deliveredChecksum: got,
    },
  };
}
