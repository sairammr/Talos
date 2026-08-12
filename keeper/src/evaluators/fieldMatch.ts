// `fieldMatch` — GRADED reproducible eval. Re-derive an expected record set from the input and
// score the delivery by the fraction of fields that reproduce (97/100 correct -> 9700 bp). This
// is what makes "graded + threshold" trustless: the score is derived field-by-field, not judged.
// A 97%-correct delivery passes a 9500 bar; a 90%-correct one fails and refunds.
import { keccak256, stringToHex, type Hex } from "viem";
import { type Evaluator, type Verdict, codeHashOf, evalIdOf, hashOf, bp } from "./types.js";

export type FieldTransform = "perFieldSquare";

export interface FieldInput {
  transform: FieldTransform;
  inputs: number[];
}
export interface FieldDelivery {
  result: number[];
}

function expectedFields(input: FieldInput): number[] {
  switch (input.transform) {
    case "perFieldSquare":
      return input.inputs.map((x) => x * x);
  }
}

// Honest seller helper.
export function computeFields(input: FieldInput): FieldDelivery {
  return { result: expectedFields(input) };
}

const NAME = "fieldMatch";
const VERSION = 1;

export const fieldMatch: Evaluator = {
  id: "fieldMatch",
  name: NAME,
  version: VERSION,
  trustTier: "reproducible",
  threshold: 9500, // graded: 95% of fields must reproduce
  codeHash: codeHashOf("fieldMatch", VERSION),
  evaluate(rawInput: unknown, rawDelivery: unknown): Verdict {
    const input = rawInput as FieldInput;
    const delivery = rawDelivery as FieldDelivery;
    const expected = expectedFields(input);
    const total = expected.length;
    const mismatchIndices: number[] = [];
    let matched = 0;
    for (let i = 0; i < total; i++) {
      if (delivery.result[i] === expected[i]) matched++;
      else mismatchIndices.push(i);
    }
    const score = total === 0 ? 0 : bp(matched / total);
    const inputHash = keccak256(stringToHex(`${input.transform}|${JSON.stringify(input.inputs)}`));
    const evidence = { transform: input.transform, total, matched, mismatchIndices };
    return {
      score,
      inputHash,
      deliverableHash: hashOf(delivery),
      evidence,
      evidenceHash: hashOf(evidence),
      reason: `${matched}/${total} fields reproduced (${(score / 100).toFixed(2)}%)`,
    };
  },
};

export const fieldMatchEvalId = evalIdOf(NAME, VERSION);
