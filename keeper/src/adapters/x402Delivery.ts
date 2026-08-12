// x402 delivery adapter (PRD §4 in-scope adapter). Faithful minimal x402 handshake:
//
//   POST /deliver  (no payment)      → 402 Payment Required + PaymentRequirements
//   POST /deliver  (X-PAYMENT hdr)   → 200 + { delivery }
//
// The X-PAYMENT header carries an EIP-3009 `TransferWithAuthorization` signed by the
// buyer — the exact authorization primitive x402 rides on. The escrow already holds
// the funds, so this leg AUTHENTICATES the paid delivery request (no double-pay,
// PRD §6a); on Base mainnet the same signed authorization is what a facilitator
// would settle on x402scan.
import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { JobSpec, Delivery } from "../job.js";

// x402 delivery-access fee: 0.10 USDC (6 dp). Deliberately small and SEPARATE from the
// escrowed job value so there is no double-pay (PRD §6a) — this is the real, explorer-
// linkable x402 leg, not the settlement rail.
export const X402_FEE = 100_000n;

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  asset: Address; // USDC
  payTo: Address; // seller
  maxAmountRequired: string; // deal amount
  resource: string; // dealId
  nonce: `0x${string}`;
  validBefore: number;
}

export interface X402Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
  chainId: number;
  verifyingContract: Address;
}

// EIP-712 typed data for EIP-3009 TransferWithAuthorization (USDC domain).
export function transferAuthTypedData(auth: {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
  chainId: number;
  verifyingContract: Address;
}) {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: auth.chainId,
      verifyingContract: auth.verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
  };
}

// Buyer-side: request delivery over x402, paying with a signed authorization.
export async function requestDelivery(opts: {
  sellerUrl: string;
  dealId: `0x${string}`;
  spec: JobSpec;
  buyerKey: `0x${string}`;
  usdc: Address;
  chainId: number;
}): Promise<{ delivery: Delivery; x402: X402Authorization; x402Tx?: `0x${string}` }> {
  const account = privateKeyToAccount(opts.buyerKey);

  // 1) Unpaid probe → expect 402 with requirements.
  const probe = await fetch(`${opts.sellerUrl}/deliver`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId: opts.dealId, spec: opts.spec }),
  });
  if (probe.status !== 402) {
    throw new Error(`x402: expected 402 on unpaid probe, got ${probe.status}`);
  }
  const req = (await probe.json()) as PaymentRequirements;

  // 2) Sign the EIP-3009 authorization for the required amount.
  const now = Math.floor(Date.now() / 1000);
  const typed = transferAuthTypedData({
    from: account.address,
    to: req.payTo,
    value: BigInt(req.maxAmountRequired),
    validAfter: 0,
    validBefore: req.validBefore,
    nonce: req.nonce,
    chainId: opts.chainId,
    verifyingContract: opts.usdc,
  });
  const signature = await account.signTypedData(typed);

  const auth: X402Authorization = {
    from: account.address,
    to: req.payTo,
    value: req.maxAmountRequired,
    validAfter: 0,
    validBefore: req.validBefore,
    nonce: req.nonce,
    signature,
    chainId: opts.chainId,
    verifyingContract: opts.usdc,
  };

  // 3) Re-request with the X-PAYMENT header.
  const paid = await fetch(`${opts.sellerUrl}/deliver`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment": Buffer.from(JSON.stringify(auth)).toString("base64"),
    },
    body: JSON.stringify({ dealId: opts.dealId, spec: opts.spec }),
  });
  if (paid.status !== 200) {
    throw new Error(`x402: paid request failed ${paid.status}: ${await paid.text()}`);
  }
  const body = (await paid.json()) as { delivery: Delivery; x402Tx?: `0x${string}` };
  return { delivery: body.delivery, x402: auth, x402Tx: body.x402Tx };
}
