// Evaluator SDK tests: each evaluator scores correctly AND is reproducible (same input ->
// same score + same evidenceHash). `tsx --test` via `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { reproduction, compute } from "./evaluators/reproduction.js";
import { fieldMatch, computeFields } from "./evaluators/fieldMatch.js";
import { signature } from "./evaluators/signature.js";
import { evaluatorByEvalId, evalIdFor } from "./evaluators/registry.js";

// --- reproduction (binary) ---

test("reproduction: honest delivery scores 10000", () => {
  const input = { transform: "sortSum" as const, inputs: [5, 2, 9, 1, 7] };
  const v = reproduction.evaluate(input, compute(input)) as { score: number };
  assert.equal(v.score, 10_000);
});

test("reproduction: tampered delivery scores 0", () => {
  const input = { transform: "sortSum" as const, inputs: [5, 2, 9, 1, 7] };
  const honest = compute(input);
  const tampered = { result: honest.result.map((n, i) => (i === 0 ? n + 1 : n)), checksum: honest.checksum };
  const v = reproduction.evaluate(input, tampered) as { score: number };
  assert.equal(v.score, 0);
});

test("reproduction: verdict is reproducible (same score + evidenceHash)", () => {
  const input = { transform: "sha256Roll" as const, inputs: [3, 1, 4, 1, 5] };
  const d = compute(input);
  const a = reproduction.evaluate(input, d) as { score: number; evidenceHash: string };
  const b = reproduction.evaluate(input, d) as { score: number; evidenceHash: string };
  assert.equal(a.score, b.score);
  assert.equal(a.evidenceHash, b.evidenceHash);
});

// --- fieldMatch (graded) ---

const fInput = { transform: "perFieldSquare" as const, inputs: Array.from({ length: 100 }, (_, i) => i + 1) };

test("fieldMatch: perfect delivery scores 10000", () => {
  const v = fieldMatch.evaluate(fInput, computeFields(fInput)) as { score: number };
  assert.equal(v.score, 10_000);
});

test("fieldMatch: 97/100 correct scores 9700 (graded pass over 9500)", () => {
  const honest = computeFields(fInput);
  const result = honest.result.map((n, i) => (i < 3 ? n + 1 : n)); // corrupt 3 of 100
  const v = fieldMatch.evaluate(fInput, { result }) as { score: number };
  assert.equal(v.score, 9700);
  assert.ok(v.score >= fieldMatch.threshold);
});

test("fieldMatch: 90/100 correct scores 9000 (graded fail under 9500)", () => {
  const honest = computeFields(fInput);
  const result = honest.result.map((n, i) => (i < 10 ? n + 1 : n)); // corrupt 10 of 100
  const v = fieldMatch.evaluate(fInput, { result }) as { score: number };
  assert.equal(v.score, 9000);
  assert.ok(v.score < fieldMatch.threshold);
});

// --- signature (binary, async) ---

const ORACLE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

test("signature: valid oracle signature scores 10000", async () => {
  const account = privateKeyToAccount(ORACLE_KEY);
  const message = "talos:delivery:abc";
  const sig = await account.signMessage({ message });
  const v = (await signature.evaluate({ signer: account.address, message }, { signature: sig })) as { score: number };
  assert.equal(v.score, 10_000);
});

test("signature: wrong signer scores 0", async () => {
  const account = privateKeyToAccount(ORACLE_KEY);
  const message = "talos:delivery:abc";
  const sig = await account.signMessage({ message });
  const other = "0x000000000000000000000000000000000000dEaD" as const;
  const v = (await signature.evaluate({ signer: other, message }, { signature: sig })) as { score: number };
  assert.equal(v.score, 0);
});

// --- registry wiring ---

test("registry resolves evalId back to its evaluator", () => {
  const id = evalIdFor(fieldMatch);
  assert.equal(evaluatorByEvalId(id)?.id, "fieldMatch");
});
