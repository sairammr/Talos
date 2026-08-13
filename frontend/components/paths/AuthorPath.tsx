"use client";

import { type Hex } from "viem";
import { Panel, Eyebrow, CodeBlock } from "../ui";
import { RegisterEval } from "../RegisterEval";
import { EvalPicker } from "../EvalPicker";

export function AuthorPath({
  active,
  setActive,
}: {
  active: { id: Hex; name: string; thresholdBp: number } | null;
  setActive: (a: { id: Hex; name: string; thresholdBp: number }) => void;
}) {
  const evaluator = `import { type Evaluator, type Verdict, codeHashOf, hashOf, bp } from "talos/evaluators";

// An eval is a PURE function of the input — reproducible, so anyone can re-run it
// and must get the same score. That is what makes the verdict trustless.
export const myEval: Evaluator = {
  id: "myEval", name: "myEval", version: 1,
  trustTier: "reproducible",
  threshold: 9500,                       // 95% pass bar (basis points)
  codeHash: codeHashOf("myEval", 1),     // pinned identity of THIS implementation
  evaluate(input, delivery): Verdict {
    const expected = derive(input);              // re-derive the correct answer
    const score = bp(fractionMatching(expected, delivery)); // 0..10000
    const evidence = { expected, got: delivery };
    return {
      score,
      inputHash: hashOf(input),
      deliverableHash: hashOf(delivery),
      evidence, evidenceHash: hashOf(evidence),
      reason: \`\${score}bp\`,
    };
  },
};`;

  return (
    <div className="space-y-6">
      <RegisterEval onRegistered={(i, n, t) => setActive({ id: i, name: n, thresholdBp: t })} />

      <Panel className="!p-5">
        <EvalPicker activeId={active?.id ?? null} onPick={(i, n, t) => setActive({ id: i, name: n, thresholdBp: t })} />
      </Panel>

      <Panel>
        <Eyebrow>the evaluator behind the id you just registered</Eyebrow>
        <p className="text-sm text-dim mb-4 max-w-prose">
          The onchain entry pins a <span className="font-mono text-cyan">codeHash</span>; this is the
          code it points to. Publish it so consumers can reproduce every score.
        </p>
        <CodeBlock filename="evaluators/myEval.ts" code={evaluator} />
      </Panel>
    </div>
  );
}
