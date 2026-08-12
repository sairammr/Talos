// End-to-end demo (PRD §8). Runs the whole lifecycle against a live chain:
//   - N happy-path deals: lock → x402 delivery → critic reproduces → release
//   - 1 fraud deal:       lock → tampered delivery → critic rejects → refund
//   - 1 expiry deal:      lock → no delivery → autonomous block-interval refund
// Every leg is a real onchain tx. Prints an audit summary + balances at the end.
import { startSeller } from "./agents/seller.js";
import { fundBuyer, lockDeal, dealIdOf } from "./agents/buyer.js";
import { requestDelivery } from "./adapters/x402Delivery.js";
import { checkCondition } from "./verifier.js";
import { submitVerdict, tick } from "./watcher.js";
import { store, audit } from "./store.js";
import { accounts, addresses, usdcBalance, fmtUsdc, readDeal } from "./chain.js";
import { config } from "./config.js";
import type { JobSpec } from "./job.js";
import { log, color } from "./logger.js";

// Per-deal escrow value. Default 10 USDC locally; set DEAL_USDC (whole USDC) smaller on
// testnet so one faucet pull covers the whole run.
const AMOUNT = BigInt(Math.round(Number(process.env.DEAL_USDC ?? 10) * 1e6));

// Advance local-anvil time deterministically; on a real testnet, blocks mine on their own.
async function advanceTime(secs: number) {
  if (config.chainId !== 31337) {
    await new Promise((r) => setTimeout(r, (secs + 1) * 1000));
    return;
  }
  await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_increaseTime", params: [secs] }),
  });
  await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "evm_mine", params: [] }),
  });
}

function spec(seed: number): JobSpec {
  return { transform: "sortSum", inputs: [seed * 7, seed * 3 + 1, seed, seed * 11 - 2, 42] };
}

// Run one deal through lock → x402 → critic → settle. `fraud` flips the seller.
async function runDeal(nonce: string, fraud: boolean) {
  const s = spec(Number(nonce.replace(/\D/g, "")) || 1);
  const { dealId } = await lockDeal({ nonce, amount: AMOUNT, deadlineSecs: 600, spec: s });

  if (fraud) {
    await fetch(`${config.sellerUrl}/mode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId, mode: "fraud" }),
    });
  }

  // Seller delivers over x402 (buyer pays with a signed EIP-3009 authorization that the
  // seller settles onchain — a real USDC transfer, buyer gasless).
  const { usdc } = addresses();
  const { delivery, x402Tx } = await requestDelivery({
    sellerUrl: config.sellerUrl,
    dealId,
    spec: s,
    buyerKey: config.buyerKey,
    usdc,
    chainId: config.chainId,
  });
  if (x402Tx && config.chainId === 84532) {
    log.info(`x402 payment onchain → https://x402scan.com  (tx ${x402Tx})`);
  }

  // Independent critic re-runs the transform and byte-compares.
  const verdict = checkCondition(s, delivery);
  if (verdict.approved) log.critic(`${dealId.slice(0, 10)}… ${color.green}APPROVED${color.reset} — ${verdict.reason}`);
  else log.critic(`${dealId.slice(0, 10)}… ${color.red}REJECTED${color.reset} — ${verdict.reason}`);

  submitVerdict(dealId, verdict);
  await tick(); // keeper actuates via KeeperHub
}

async function main() {
  store.reset();
  audit.reset();

  log.banner("Talos — Conditional Settlement Keeper");
  const { escrow, usdc } = addresses();
  log.info(`chain ${config.chainId} · escrow ${escrow} · usdc ${usdc}`);
  log.info(`settler (KeeperHub signer) ${accounts.settler.address}`);

  const stopSeller = await startSeller();
  await fundBuyer(AMOUNT * 6n);

  const buyer0 = await usdcBalance(accounts.buyer.address);
  const seller0 = await usdcBalance(accounts.seller.address);

  // --- Happy path loop (stream of real txs) ---
  log.banner("Happy path — 3 verified deals settle to the seller");
  for (const i of [1, 2, 3]) {
    await runDeal(`happy-${i}`, false);
  }

  // --- Fraud case (critic rejection → refund) ---
  log.banner("Fraud case — tampered delivery, critic rejects, funds refunded");
  await runDeal(`fraud-9`, true);

  // --- Autonomous deadline refund (block-interval, zero keeper verdict) ---
  log.banner("Autonomous refund — deal expires, KeeperHub refunds from onchain state");
  const s = spec(5);
  // Local anvil can mine instantly, so a 2s deadline is safe. On a real testnet the lock tx
  // takes a few seconds to mine, so the deadline must clear that latency yet still expire
  // within the demo — otherwise lock() reverts BadDeadline.
  const expireSecs = config.chainId === 31337 ? 2 : 30;
  await lockDeal({ nonce: "expire-5", amount: AMOUNT, deadlineSecs: expireSecs, spec: s });
  log.info("no delivery arrives; advancing past the deadline…");
  await advanceTime(expireSecs + 3);
  await tick(); // watcher sees isExpired() → autonomous refund

  // --- Summary ---
  log.banner("Settlement summary");
  for (const rec of store.all()) {
    const d = await readDeal(rec.dealId);
    const tag =
      rec.status === "released" ? `${color.green}RELEASED${color.reset}` : `${color.yellow}REFUNDED${color.reset}`;
    console.log(
      `  ${rec.dealId.slice(0, 12)}…  ${tag}  ${fmtUsdc(BigInt(rec.amount))}  ` +
        `onchain=${d.status}  ${color.dim}settle tx ${rec.settleTx?.slice(0, 14) ?? "—"}…${color.reset}`
    );
  }

  const buyer1 = await usdcBalance(accounts.buyer.address);
  const seller1 = await usdcBalance(accounts.seller.address);
  log.banner("Balances");
  console.log(`  buyer  Δ ${fmtUsdc(buyer1 - buyer0)}`);
  console.log(
    `  seller Δ ${fmtUsdc(seller1 - seller0)}   ${color.dim}(3 escrow releases = ${fmtUsdc(AMOUNT * 3n)} + 4 x402 delivery fees = 0.40 USDC)${color.reset}`
  );

  const rows = audit.all();
  const released = rows.filter((r) => r.action === "release" && r.outcome === "settled").length;
  const refunded = rows.filter((r) => r.action === "refund" && r.outcome === "settled").length;
  log.banner("Audit trail");
  console.log(
    `  ${rows.length} settlement rows · ${color.green}${released} released${color.reset} · ${color.yellow}${refunded} refunded${color.reset}`
  );
  console.log(`  ${color.dim}full trail: keeper/.audit.jsonl  ·  view: pnpm audit${color.reset}\n`);

  stopSeller();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
