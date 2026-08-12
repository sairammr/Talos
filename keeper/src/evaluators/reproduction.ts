// `reproduction` — binary reproducible eval. Re-run the agreed deterministic transform on the
// referenced input and byte-compare the output hash. Score is 10000 (reproduced) or 0 (not).
// Correctness is a pure function of the input, so anyone re-runs and gets the same verdict.
import { keccak256, stringToHex, type Hex } from "viem";
import { type Evaluator, type Verdict, codeHashOf, evalIdOf, hashOf } from "./types.js";

export type Transform = "sortSum" | "sha256Roll";

export interface ReproInput {
  transform: Transform;
  inputs: number[];
}
export interface ReproDelivery {
  result: number[];
  checksum: Hex;
}

function canonicalNums(nums: number[]): string {
  return JSON.stringify(nums);
}

function apply(input: ReproInput): number[] {
  switch (input.transform) {
    case "sortSum": {
      const sorted = [...input.inputs].sort((a, b) => a - b);
      return [...sorted, sorted.reduce((a, b) => a + b, 0)];
    }
    case "sha256Roll": {
      let acc = 0;
      const out: number[] = [];
      for (const x of input.inputs) {
        acc = Number(BigInt(keccak256(stringToHex(`${acc}:${x}`))) % 1000000n);
        out.push(acc);
      }
      return out;
    }
  }
}

export function checksumOf(transform: Transform, result: number[]): Hex {
  return keccak256(stringToHex(`${transform}|${canonicalNums(result)}`));
}

// Honest seller helper (used by the seller agent).
export function compute(input: ReproInput): ReproDelivery {
  const result = apply(input);
  return { result, checksum: checksumOf(input.transform, result) };
}

const NAME = "reproduction";
const VERSION = 1;

export const reproduction: Evaluator = {
  id: "reproduction",
  name: NAME,
  version: VERSION,
  trustTier: "reproducible",
  threshold: 10_000, // binary: must reproduce exactly
  codeHash: codeHashOf("reproduction", VERSION),
  evaluate(rawInput: unknown, rawDelivery: unknown): Verdict {
    const input = rawInput as ReproInput;
    const delivery = rawDelivery as ReproDelivery;
    const expectedResult = apply(input);
    const expected = checksumOf(input.transform, expectedResult);
    const deliveredChecksum = checksumOf(input.transform, delivery.result);
    const reproduced = delivery.checksum === expected && deliveredChecksum === expected;
    const inputHash = keccak256(stringToHex(`${input.transform}|${canonicalNums(input.inputs)}`));
    const evidence = {
      transform: input.transform,
      expectedChecksum: expected,
      deliveredChecksum,
      claimedChecksum: delivery.checksum,
    };
    return {
      score: reproduced ? 10_000 : 0,
      inputHash,
      deliverableHash: hashOf(delivery),
      evidence,
      evidenceHash: hashOf(evidence),
      reason: reproduced
        ? "delivery reproduced byte-for-byte from the referenced input"
        : `checksum mismatch: expected ${expected}, delivered ${deliveredChecksum}`,
    };
  },
};

export const reproductionEvalId = evalIdOf(NAME, VERSION);
