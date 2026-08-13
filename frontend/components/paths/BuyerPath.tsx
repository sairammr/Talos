"use client";

import { type Hex } from "viem";
import { ADDR } from "@/lib/talos";
import { Panel, Eyebrow, CodeBlock } from "../ui";
import { EvalPicker } from "../EvalPicker";
import { TestDeal } from "../TestDeal";

export function BuyerPath({
  active,
  setActive,
}: {
  active: { id: Hex; name: string; thresholdBp: number } | null;
  setActive: (a: { id: Hex; name: string; thresholdBp: number }) => void;
}) {
  const id = active?.id ?? "0xYOUR_EVAL_ID";
  const snippet = `import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";

const EVAL_ID = "${id}";
const ESCROW  = "${ADDR.escrow}";
const USDC    = "${ADDR.usdc}";

// Your buyer agent escrows the job value instead of paying directly.
const wallet = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum) });
const [buyer] = await wallet.getAddresses();
const amount  = parseUnits("1", 6);                 // 1 USDC
const deadline = BigInt(Math.floor(Date.now()/1e3) + 3600);

await wallet.writeContract({ account: buyer, address: USDC, abi: erc20Abi,
  functionName: "approve", args: [ESCROW, amount] });

await wallet.writeContract({ account: buyer, address: ESCROW, abi: escrowAbi,
  functionName: "lock", args: [dealId, seller, amount, deadline, EVAL_ID] });
// Funds are held. They can ONLY release to the seller if the attested
// score ≥ threshold of EVAL_ID — otherwise they refund to you. No trust in the seller.`;

  return (
    <div className="space-y-6">
      <Panel glow>
        <Eyebrow>Buyer agent · pay only for correct work</Eyebrow>
        <h3 className="font-head text-xl font-semibold mb-1">Escrow the job against an eval</h3>
        <p className="text-sm text-dim mb-4 max-w-prose">
          Your agent that <b className="text-text">pays for work</b> calls{" "}
          <span className="font-mono text-cyan">lock</span> instead of transferring funds. The
          escrow releases to the seller only when an onchain-attested score clears the eval&apos;s
          threshold; otherwise it refunds you. This is the core &ldquo;add Talos to your
          agent&rdquo; path.
        </p>
        <Eyebrow>1 · choose the eval that gates release</Eyebrow>
        <EvalPicker activeId={active?.id ?? null} onPick={(i, n, t) => setActive({ id: i, name: n, thresholdBp: t })} />
        <p className="mt-3 text-[12px] text-faint">
          Need a different correctness rule? Switch to the <b className="text-dim">Eval author</b>{" "}
          tab to register one, then come back.
        </p>
      </Panel>

      <TestDeal evalId={active?.id ?? null} evalName={active?.name ?? null} />

      <Panel>
        <Eyebrow>2 · the same flow in your codebase</Eyebrow>
        <CodeBlock filename="buyer-agent/lock.ts" code={snippet} />
      </Panel>
    </div>
  );
}
