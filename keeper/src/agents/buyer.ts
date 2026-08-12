// Buyer agent — funds the escrow. approve(escrow) then lock(dealId,...).
// The locked USDC IS the payment (PRD §6a): no separate x402 double-pay.
import { keccak256, stringToHex, type Hash } from "viem";
import { wallet, publicClient, addresses, escrowAbi, usdcAbi, accounts, waitReceipt, fmtUsdc } from "../chain.js";
import { config } from "../config.js";
import { store } from "../store.js";
import type { JobSpec } from "../job.js";
import { log } from "../logger.js";

export function dealIdOf(nonce: string): Hash {
  return keccak256(stringToHex(`talos-deal:${nonce}`));
}

// Ensure buyer has USDC + allowance. Mints from MockUSDC faucet when on a local chain.
export async function fundBuyer(amount: bigint) {
  const { usdc, escrow } = addresses();
  const buyer = wallet(config.buyerKey);

  if (config.chainId === 31337) {
    const tx = await buyer.writeContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "mint",
      args: [accounts.buyer.address, amount * 2n],
    });
    await waitReceipt(tx);
  }
  const allowance = (await publicClient.readContract({
    address: usdc,
    abi: usdcAbi,
    functionName: "allowance",
    args: [accounts.buyer.address, escrow],
  })) as bigint;
  if (allowance < amount) {
    const tx = await buyer.writeContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "approve",
      args: [escrow, 2n ** 256n - 1n],
    });
    await waitReceipt(tx);
  }
}

export async function lockDeal(opts: {
  nonce: string;
  amount: bigint;
  deadlineSecs: number;
  spec: JobSpec;
}): Promise<{ dealId: Hash; lockTx: Hash }> {
  const { escrow } = addresses();
  const buyer = wallet(config.buyerKey);
  const dealId = dealIdOf(opts.nonce);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + opts.deadlineSecs);

  const lockTx = await buyer.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "lock",
    args: [dealId, accounts.seller.address, opts.amount, deadline],
  });
  const receipt = await waitReceipt(lockTx);
  log.buyer(
    `lock ${dealId.slice(0, 10)}… ${fmtUsdc(opts.amount)} held  \x1b[2mtx ${lockTx.slice(0, 12)}… gas ${receipt.gasUsed}\x1b[0m`
  );

  store.upsert({
    dealId,
    buyer: accounts.buyer.address,
    seller: accounts.seller.address,
    amount: opts.amount.toString(),
    deadline: Number(deadline),
    spec: opts.spec,
    status: "held",
    lockTx,
    createdAt: Date.now(),
  });
  return { dealId, lockTx };
}
