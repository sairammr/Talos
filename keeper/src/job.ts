// The decidable job class (PRD §6a). Correctness is a PURE FUNCTION of the input,
// so anyone — buyer, keeper, a skeptical judge — can re-run and get the same verdict.
// This is what makes "verification" a reproducibility claim, not an LLM vibe-check.
import { keccak256, toHex, stringToHex } from "viem";

export type Transform = "sortSum" | "sha256Roll";

export interface JobSpec {
  // The agreed deterministic transform and its input. `inputs` IS the input reference:
  // small enough to carry in the deal, and its hash pins it (no "live data" wiggle room).
  transform: Transform;
  inputs: number[];
}

export interface Delivery {
  // What the seller returns over x402.
  result: number[]; // the computed output
  checksum: `0x${string}`; // seller's claimed output hash
}

// Canonical serialization so the hash is stable across machines/languages.
function canonical(nums: number[]): string {
  return JSON.stringify(nums);
}

// Pure transforms. No clock, no randomness, no I/O.
function apply(spec: JobSpec): number[] {
  switch (spec.transform) {
    case "sortSum": {
      const sorted = [...spec.inputs].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      return [...sorted, sum]; // sorted array followed by its sum
    }
    case "sha256Roll": {
      // Deterministic rolling fold: r_{i} = keccak(r_{i-1} ++ x_i) truncated to a number.
      let acc = 0;
      const out: number[] = [];
      for (const x of spec.inputs) {
        const h = keccak256(stringToHex(`${acc}:${x}`));
        acc = Number(BigInt(h) % 1000000n);
        out.push(acc);
      }
      return out;
    }
  }
}

// The output hash: keccak over transform-name ++ canonical(result). Byte-comparable.
export function checksumOf(transform: Transform, result: number[]): `0x${string}` {
  return keccak256(stringToHex(`${transform}|${canonical(result)}`));
}

// Honest seller: compute correctly.
export function compute(spec: JobSpec): Delivery {
  const result = apply(spec);
  return { result, checksum: checksumOf(spec.transform, result) };
}

// The reproducible predicate the escrow settles on.
// Returns the recomputed evidence so the audit row is independently checkable.
export function reproduceAndCompare(
  spec: JobSpec,
  delivery: Delivery
): { approved: boolean; expected: `0x${string}`; got: `0x${string}`; inputHash: `0x${string}` } {
  const expectedResult = apply(spec);
  const expected = checksumOf(spec.transform, expectedResult);
  const inputHash = keccak256(stringToHex(`${spec.transform}|${canonical(spec.inputs)}`));
  // Byte-compare BOTH the claimed checksum and the recomputed one against the delivered result.
  const deliveredChecksum = checksumOf(spec.transform, delivery.result);
  const approved =
    delivery.checksum === expected && // seller's claim matches truth
    deliveredChecksum === expected; // and the delivered result actually hashes to it
  return { approved, expected, got: delivery.checksum, inputHash };
}

export { toHex };
