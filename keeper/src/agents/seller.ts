// Seller agent — a STANDALONE x402 HTTP service that delivers work for payment. It is a
// separate process from the buyer/keeper (run `pnpm seller`); the buyer reaches it over HTTP.
//
// The delivery shape depends on the deal's eval. Per-deal modes let the demo drive graded
// outcomes:
//   honest        → correct delivery (eval passes → release)
//   fraud         → tampered reproduction output (eval scores 0 → refund)
//   degrade:<k>   → fieldMatch delivery with k wrong fields (graded pass or fail by threshold)
//   badsig        → signature delivery signed by the wrong key (eval scores 0 → refund)
import { createServer } from "node:http";
import { verifyTypedData, keccak256, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { compute, checksumOf, type ReproInput } from "../evaluators/reproduction.js";
import { computeFields, type FieldInput } from "../evaluators/fieldMatch.js";
import type { SignatureInput } from "../evaluators/signature.js";
import {
  transferAuthTypedData,
  X402_FEE,
  type PaymentRequirements,
  type X402Authorization,
} from "../adapters/x402Delivery.js";
import { accounts, addresses, wallet, usdcAbi, waitReceipt, fmtUsdc } from "../chain.js";
import { log } from "../logger.js";

// The named oracle for the `signature` eval. The seller signs honest deliveries with this key;
// the eval's input carries ORACLE_ADDRESS as the required signer. (Anvil account #9.)
export const ORACLE_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as const;
export const ORACLE_ADDRESS = privateKeyToAccount(ORACLE_KEY).address;
const WRONG_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as const;

function splitSig(sig: Hex): { r: Hex; s: Hex; v: number } {
  const raw = sig.slice(2);
  return { r: `0x${raw.slice(0, 64)}`, s: `0x${raw.slice(64, 128)}`, v: parseInt(raw.slice(128, 130), 16) };
}

interface Mode {
  mode: "honest" | "fraud" | "degrade" | "badsig";
  param?: number;
}
const modes = new Map<string, Mode>();

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}

async function makeDelivery(evalName: string, input: unknown, m: Mode): Promise<unknown> {
  switch (evalName) {
    case "reproduction": {
      const honest = compute(input as ReproInput);
      if (m.mode !== "fraud") return honest;
      const badResult = honest.result.map((n, i) => (i === 0 ? n + 1 : n));
      return { result: badResult, checksum: checksumOf((input as ReproInput).transform, badResult) };
    }
    case "fieldMatch": {
      const honest = computeFields(input as FieldInput);
      if (m.mode !== "degrade") return honest;
      const k = m.param ?? 0;
      return { result: honest.result.map((n, i) => (i < k ? n + 1 : n)) };
    }
    case "signature": {
      const message = (input as SignatureInput).message;
      const key = m.mode === "badsig" ? WRONG_KEY : ORACLE_KEY;
      const signature = await privateKeyToAccount(key).signMessage({ message });
      return { signature };
    }
    default:
      throw new Error(`seller: unknown eval ${evalName}`);
  }
}

export function startSeller(): Promise<() => void> {
  const { usdc } = addresses();
  const seller = accounts.seller.address;

  const server = createServer(async (req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && req.url === "/health") {
      return json(200, { ok: true, agent: "seller", address: seller });
    }

    if (req.method === "POST" && req.url === "/mode") {
      const { dealId, mode, param } = JSON.parse(await readBody(req));
      modes.set(dealId, { mode, param });
      return json(200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/deliver") {
      const { dealId, evalName, input } = JSON.parse(await readBody(req)) as {
        dealId: string;
        evalName: string;
        input: unknown;
      };
      const payHeader = req.headers["x-payment"] as string | undefined;

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: config.chainId === 84532 ? "base-sepolia" : "anvil-local",
        asset: usdc,
        payTo: seller,
        maxAmountRequired: X402_FEE.toString(),
        resource: dealId,
        nonce: keccak256(stringToHex(`x402:${dealId}`)),
        validBefore: Math.floor(Date.now() / 1000) + 300,
      };

      if (!payHeader) {
        res.setHeader("www-authenticate", "x402");
        return json(402, requirements);
      }

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
      const valid = await verifyTypedData({ address: auth.from, ...typed, signature: auth.signature });
      if (!valid || auth.to.toLowerCase() !== seller.toLowerCase()) {
        return json(402, { error: "invalid x402 payment authorization" });
      }

      // Settle the x402 payment onchain (seller relays the buyer's EIP-3009 authorization —
      // real USDC moves buyer→seller, buyer gasless). On Base Sepolia this indexes on x402scan.
      const { r, s, v } = splitSig(auth.signature);
      const sellerWallet = wallet(config.sellerKey);
      let x402Tx: `0x${string}` | undefined;
      try {
        x402Tx = await sellerWallet.writeContract({
          address: usdc,
          abi: usdcAbi,
          functionName: "transferWithAuthorization",
          args: [auth.from, auth.to, BigInt(auth.value), BigInt(auth.validAfter), BigInt(auth.validBefore), auth.nonce, v, r, s],
        });
        await waitReceipt(x402Tx);
      } catch (e) {
        return json(402, { error: `x402 settlement failed: ${String(e)}` });
      }

      const m = modes.get(dealId) ?? { mode: "honest" as const };
      const delivery = await makeDelivery(evalName, input, m);
      const tag =
        m.mode === "honest"
          ? "[honest]"
          : m.mode === "degrade"
            ? `\x1b[33m[degraded: ${m.param} bad fields]\x1b[0m`
            : `\x1b[31m[${m.mode}]\x1b[0m`;
      log.seller(
        `x402 paid delivery for ${dealId.slice(0, 10)}… (${evalName}) fee ${fmtUsdc(X402_FEE)} settled ` +
          `\x1b[2mtx ${x402Tx.slice(0, 12)}…\x1b[0m ${tag}`
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

// `pnpm seller` runs it standalone (its own process — the two-agent split).
if (import.meta.url === `file://${process.argv[1]}`) {
  startSeller().then(() => log.seller("seller agent running; ctrl-c to stop"));
}
