// Local evaluator registry: maps evalId -> Evaluator, and carries the metadata the keeper uses
// to register each eval onchain (name, version, codeHash, trustTier, threshold). The onchain
// EvalRegistry mirrors this; a verdict's evalId resolves back to exactly one evaluator here.
import { type Hex } from "viem";
import { type Evaluator, evalIdOf } from "./types.js";
import { reproduction } from "./reproduction.js";
import { fieldMatch } from "./fieldMatch.js";
import { signature } from "./signature.js";

export const EVALUATORS: Evaluator[] = [reproduction, fieldMatch, signature];

const byId = new Map<Hex, Evaluator>();
const byName = new Map<string, Evaluator>();
for (const e of EVALUATORS) {
  byId.set(evalIdOf(e.name, e.version), e);
  byName.set(e.id, e);
}

export function evalIdFor(e: Evaluator): Hex {
  return evalIdOf(e.name, e.version);
}

export function evaluatorByEvalId(id: Hex): Evaluator | undefined {
  return byId.get(id);
}

export function evaluatorByName(id: string): Evaluator | undefined {
  return byName.get(id);
}

export { reproduction, fieldMatch, signature };
export * from "./types.js";
