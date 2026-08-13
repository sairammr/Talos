"use client";

import { type Hex } from "viem";
import { ADDR } from "@/lib/talos";
import { Panel, Eyebrow, CodeBlock, AddrLink } from "../ui";

const WORKFLOW_ID = "9z8xaukywmqwsyfb0kzqo"; // deployed talos-settle (HANDOFF)

export function KeeperPath({ evalId }: { evalId: Hex | null }) {
  const id = evalId ?? "0xYOUR_EVAL_ID";

  const grade = `import { myEval } from "./evaluators/myEval";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";

const ATTEST = "${ADDR.attestationRegistry}";
const EVAL_ID = "${id}";

// 1) Grade the delivery — score derived, never judged.
const v = myEval.evaluate(input, delivery);

// 2) Post the verdict onchain.
const keeper = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum) });
const [acct] = await keeper.getAddresses();
const attId = await keeper.writeContract({ account: acct, address: ATTEST, abi: attestationAbi,
  functionName: "attest",
  args: [EVAL_ID, v.version ?? 1, v.deliverableHash, v.inputHash, v.score, v.evidenceHash] });`;

  const settle = `# 3) Actuate settlement through KeeperHub — the CONTRACT decides, not the keeper.
curl -X POST https://app.keeperhub.com/api/workflows/${WORKFLOW_ID}/webhook \\
  -H "Authorization: Bearer wfb_YOUR_USER_WEBHOOK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"dealId":"0x…","attId":"'"$attId"'"}'

# escrow.settle(dealId, attId):
#   score ≥ threshold(evalId)  → release to seller
#   score <  threshold(evalId)  → refund to buyer
# Gas is sponsored by the KeeperHub Turnkey signer.`;

  return (
    <div className="space-y-6">
      <Panel glow>
        <Eyebrow>Keeper · grade → attest → settle</Eyebrow>
        <h3 className="font-head text-xl font-semibold mb-1">Turn a delivery into a settlement</h3>
        <p className="text-sm text-dim mb-4 max-w-prose">
          The keeper runs the registered evaluator, posts the score to{" "}
          <span className="font-mono text-cyan">AttestationRegistry</span>, then fires a KeeperHub
          webhook. Settlement is a <b className="text-text">pure consequence of the onchain score
          vs the onchain threshold</b> — the keeper never decides who gets paid.
        </p>
        <CodeBlock filename="keeper/grade-and-attest.ts" code={grade} />
      </Panel>

      <Panel>
        <Eyebrow>actuate — deployed workflow talos-settle</Eyebrow>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-bg2/60 px-3.5 py-3 text-sm">
          <span className="text-dim">
            workflow <span className="font-mono text-cyan">{WORKFLOW_ID}</span>
          </span>
          <span className="text-dim">
            escrow <AddrLink addr={ADDR.escrow} />
          </span>
        </div>
        <CodeBlock filename="keeper/settle.sh" code={settle} />
        <p className="mt-3 text-[12px] text-faint">
          Auth uses a <span className="font-mono">wfb_</span> user webhook key (not the{" "}
          <span className="font-mono">kh_</span> org key). Or run your own settler EOA calling{" "}
          <span className="font-mono text-dim">escrow.settle(dealId, attId)</span> directly.
        </p>
      </Panel>
    </div>
  );
}
