// Seller agent — an x402 HTTP server that delivers a compute job for payment.
// Modes per dealId:
//   honest  → computes the correct output (critic will approve → release)
//   fraud   → returns a wrong output (critic re-run mismatches → refund)
// The fraud mode is what makes the failure demo real (PRD §7, §8).
import { createServer } from "node:http";
import { verifyTypedData, keccak256, stringToHex, type Address, type Hex } from "viem";
import { config } from "../config.js";
import { compute, checksumOf, type JobSpec, type Delivery } from "../job.js";
import {
  transferAuthTypedData,
  X402_FEE,
  type PaymentRequirements,
  type X402Authorization,
} from "../adapters/x402Delivery.js";
import { accounts, addresses, wallet, usdcAbi, waitReceipt, fmtUsdc } from "../chain.js";
import { log } from "../logger.js";

// Split a 65-byte hex signature into r/s/v for the onchain EIP-3009 call.
function splitSig(sig: Hex): { r: Hex; s: Hex; v: number } {
  const raw = sig.slice(2);
  return {
    r: `0x${raw.slice(0, 64)}`,
    s: `0x${raw.slice(64, 128)}`,
    v: parseInt(raw.slice(128, 130), 16),
  };
}

// Deals the seller has been told to cheat on (set by the demo via /mode).
const fraudulent = new Set<string>();

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}

function makeDelivery(spec: JobSpec, dealId: string): Delivery {
  const honest = compute(spec);
  if (!fraudulent.has(dealId)) return honest;
  // Fraud: tamper the result but keep a plausible-looking (wrong) checksum.
  const badResult = honest.result.map((n, i) => (i === 0 ? n + 1 : n));
  return { result: badResult, checksum: checksumOf(spec.transform, badResult) };
}

export function startSeller(): Promise<() => void> {
  const { usdc } = addresses();
  const seller = accounts.seller.address;

  const server = createServer(async (req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "POST" && req.url === "/mode") {
      const { dealId, mode } = JSON.parse(await readBody(req));
      if (mode === "fraud") fraudulent.add(dealId);
      else fraudulent.delete(dealId);
      return json(200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/deliver") {
      const { dealId, spec } = JSON.parse(await readBody(req)) as { dealId: string; spec: JobSpec };
      const payHeader = req.headers["x-payment"] as string | undefined;

      // Amount is a function of the job (kept simple: fixed per-deal in the demo).
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: config.chainId === 84532 ? "base-sepolia" : "anvil-local",
        asset: usdc,
        payTo: seller,
        // Small delivery-access fee, SEPARATE from the escrowed job value (no double-pay,
        // PRD §6a). This is the real x402 leg that lands onchain / indexes on x402scan.
        maxAmountRequired: X402_FEE.toString(),
        resource: dealId,
        nonce: keccak256(stringToHex(`x402:${dealId}`)),
        validBefore: Math.floor(Date.now() / 1000) + 300,
      };

      if (!payHeader) {
        // x402: no payment → 402 with requirements.
        res.setHeader("www-authenticate", "x402");
        return json(402, requirements);
      }

      // Verify the EIP-3009 authorization signature (the x402 payment proof).
      let auth: X402Authorization;
      try {
        auth = JSON.parse(Buffer.from(payHeader, "base64").toString("utf8"));
      } catch {
        return json(400, { error: "bad x-payment header" });
      }
      const typed = transferAuthTypedData({
        from: auth.from,
        to: auth.to as Address,
        value: BigInt(auth.value),
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
        chainId: auth.chainId,
        verifyingContract: auth.verifyingContract as Address,
      });
      const valid = await verifyTypedData({
        address: auth.from,
        ...typed,
        signature: auth.signature,
      });
      if (!valid || auth.to.toLowerCase() !== seller.toLowerCase()) {
        return json(402, { error: "invalid x402 payment authorization" });
      }

      // SETTLE the x402 payment onchain — the seller acts as the facilitator/relayer and
      // lands the buyer's signed EIP-3009 authorization. Real USDC moves buyer→seller; the
      // buyer never needed ETH (gasless, exactly like a real x402 facilitator). On Base
      // Sepolia this tx indexes on x402scan.
      const { r, s, v } = splitSig(auth.signature);
      const sellerWallet = wallet(config.sellerKey);
      let x402Tx: `0x${string}` | undefined;
      try {
        x402Tx = await sellerWallet.writeContract({
          address: usdc,
          abi: usdcAbi,
          functionName: "transferWithAuthorization",
          args: [
            auth.from,
            auth.to,
            BigInt(auth.value),
            BigInt(auth.validAfter),
            BigInt(auth.validBefore),
            auth.nonce,
            v,
            r,
            s,
          ],
        });
        await waitReceipt(x402Tx);
      } catch (e) {
        return json(402, { error: `x402 settlement failed: ${String(e)}` });
      }

      const delivery = makeDelivery(spec, dealId);
      const cheating = fraudulent.has(dealId);
      log.seller(
        `x402 paid delivery for ${dealId.slice(0, 10)}… fee ${fmtUsdc(X402_FEE)} settled ` +
          `\x1b[2mtx ${x402Tx.slice(0, 12)}…\x1b[0m ${cheating ? "\x1b[31m[FRAUD: tampered output]\x1b[0m" : "[honest]"}`
      );
      return json(200, { delivery, x402Tx });
    }

    json(404, { error: "not found" });
  });

  return new Promise((resolve) => {
    server.listen(config.sellerPort, () => {
      log.seller(`x402 delivery endpoint on ${config.sellerUrl}`);
      resolve(() => server.close());
    });
  });
}

// Allow `pnpm seller` to run it standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  startSeller();
}
