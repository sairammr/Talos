"use client";

import { ADDR } from "@/lib/talos";
import { Panel, Eyebrow, CodeBlock } from "../ui";
import { DealStatus } from "../DealStatus";

export function SellerPath() {
  const deliver = `// Seller agent: serve deliveries over x402. The escrow already holds the job
// value, so this leg just AUTHENTICATES the paid request (EIP-3009) — no double-pay.
//
//   POST /deliver                      → 402 Payment Required + PaymentRequirements
//   POST /deliver  (X-PAYMENT header)  → 200 + { delivery }
//
// You change NOTHING onchain. Produce the deliverable the eval will check; when the
// keeper attests score ≥ threshold, escrow.settle releases the funds to you.`;

  const watch = `import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const ESCROW = "${ADDR.escrow}";
const client = createPublicClient({ chain: baseSepolia, transport: http() });

// Poll (or subscribe to Released) to know when you've been paid:
const [buyer, seller, amount, deadline, evalId, status] =
  await client.readContract({ address: ESCROW, abi: escrowAbi,
    functionName: "getDeal", args: [dealId] });
// status: 0 None · 1 Held · 2 Released(→ you) · 3 Refunded(→ buyer)`;

  return (
    <div className="space-y-6">
      <Panel glow>
        <Eyebrow>Seller agent · deliver, get paid on pass</Eyebrow>
        <h3 className="font-head text-xl font-semibold mb-1">
          Your agent does the work — the eval does the trust
        </h3>
        <p className="text-sm text-dim mb-4 max-w-prose">
          A seller integrates <b className="text-text">almost nothing</b>: deliver over x402 (or any
          channel) and produce output the registered eval can reproduce. Correctness is judged by
          code, not by the buyer&apos;s goodwill — so payment is guaranteed when the score clears the
          bar.
        </p>
        <CodeBlock filename="seller-agent/deliver.txt" code={deliver} />
      </Panel>

      <Panel>
        <Eyebrow>watch your deal settle</Eyebrow>
        <CodeBlock filename="seller-agent/watch.ts" code={watch} />
        <div className="mt-4">
          <DealStatus />
        </div>
      </Panel>
    </div>
  );
}
