// The reproducibility predicate is the release gate (PRD §6a). These tests prove it
// catches fraud deterministically, with no chain and no LLM in the loop — anyone can
// re-run and get the same verdict. `node --test` via `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, checksumOf, type JobSpec } from "./job.js";
import { checkCondition } from "./verifier.js";

const spec: JobSpec = { transform: "sortSum", inputs: [5, 2, 9, 1, 7] };

test("honest delivery is approved", () => {
  const delivery = compute(spec);
  const v = checkCondition(spec, delivery);
  assert.equal(v.approved, true);
  assert.match(v.reason, /reproduced/);
});

test("tampered result is rejected", () => {
  const honest = compute(spec);
  const tampered = { result: honest.result.map((n, i) => (i === 0 ? n + 1 : n)), checksum: honest.checksum };
  const v = checkCondition(spec, tampered);
  assert.equal(v.approved, false);
});

test("lying checksum on honest result is rejected", () => {
  const honest = compute(spec);
  const lying = { result: honest.result, checksum: checksumOf("sortSum", [0, 0, 0]) };
  const v = checkCondition(spec, lying);
  assert.equal(v.approved, false);
});

test("verdict is a pure function of input — reproducible", () => {
  const a = checkCondition(spec, compute(spec));
  const b = checkCondition(spec, compute(spec));
  assert.deepEqual(a.evidence, b.evidence);
});

test("sha256Roll transform also reproduces", () => {
  const s2: JobSpec = { transform: "sha256Roll", inputs: [3, 1, 4, 1, 5, 9] };
  assert.equal(checkCondition(s2, compute(s2)).approved, true);
});
