// End-to-end demo of the eval layer. Every leg is a real onchain lifecycle:
//   register evals → lock(evalId) → x402 delivery → evaluate → attest → settle(dealId, attId)
// The escrow decides release vs refund from the ONCHAIN attested score vs the eval threshold.
//
//   1. reproduction, full-correct   → score 10000            → release
//   2. fieldMatch, 97% correct      → score 9700  >= 9500    → release (graded pass)
//   3. fieldMatch, 90% correct      → score 9000  <  9500    → refund  (graded fail — money shot)
//   4. reproduction, tampered       → score 0                → refund  (fraud)
//   5. expiry, no delivery          → autonomous block-interval refund
//   + reputation read from onchain Attested events
import { startSeller, ORACLE_ADDRESS } from "./agents/seller.js";
import { fundBuyer, lockDeal } from "./agents/buyer.js";
import { requestDelivery } from "./adapters/x402Delivery.js";
import { ensureEvalsRegistered, evaluateAndAttest } from "./attest.js";
import { submitSettle, tick } from "./watcher.js";
import { store, audit } from "./store.js";
import { accounts, addresses, usdcBalance, fmtUsdc, readDeal, readAttestations } from "./chain.js";
import { config } from "./config.js";
import { reproduction, fieldMatch, evalIdFor } from "./evaluators/registry.js";
import type { Evaluator } from "./evaluators/types.js";
import { log, color } from "./logger.js";

const AMOUNT = BigInt(Math.round(Number(process.env.DEAL_USDC ?? 10) * 1e6));

// Per-run nonce salt so re-runs against the same escrow don't collide (DealExists). Deterministic
// dealIds are still one-per-deal; the salt just makes each demo run a fresh set.
const RUN = process.env.RUN_TAG ?? Date.now().toString(36).slice(-6);
const n = (base: string) => `${RUN}-${base}`;

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

const reproInput = (seed: number) => ({ transform: "sortSum" as const, inputs: [seed * 7, seed * 3 + 1, seed, seed * 11 - 2, 42] });
const fieldInput = () => ({ transform: "perFieldSquare" as const, inputs: Array.from({ length: 100 }, (_, i) => i + 1) });

// Set the seller's delivery mode for a deal, then run one full lifecycle leg.
async function runDeal(opts: {
  nonce: string;
  evaluator: Evaluator;
  input: unknown;
  mode: { mode: "honest" | "fraud" | "degrade" | "badsig"; param?: number };
}) {
  const { dealId } = await lockDeal({
    nonce: opts.nonce,
    amount: AMOUNT,
    deadlineSecs: 600,
    evalId: evalIdFor(opts.evaluator),
    evalName: opts.evaluator.name,
    input: opts.input,
  });

  await fetch(`${config.sellerUrl}/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, mode: opts.mode.mode, param: opts.mode.param }),
  });

  const { usdc } = addresses();
  const { delivery, x402Tx } = await requestDelivery({
    sellerUrl: config.sellerUrl,
    dealId,
    evalName: opts.evaluator.name,
    input: opts.input,
    buyerKey: config.buyerKey,
    usdc,
    chainId: config.chainId,
  });
  if (x402Tx && config.chainId === 84532) log.info(`x402 payment onchain → https://x402scan.com  (tx ${x402Tx})`);

  // Evaluate (graded) + attest the verdict onchain.
  const { verdict, attId, passed } = await evaluateAndAttest(opts.evaluator, opts.input, delivery);
  const grade = passed ? color.green : color.red;
  log.critic(
    `${dealId.slice(0, 10)}… ${opts.evaluator.name} → ${grade}${(verdict.score / 100).toFixed(0)}%${color.reset} ` +
      `(${verdict.reason})  ${grade}${passed ? "PASS" : "FAIL"}${color.reset}  attested ${attId.slice(0, 10)}…`
  );
  store.patch(dealId, { score: verdict.score, attId, deliverableHash: verdict.deliverableHash });

  submitSettle({ dealId, attId, score: verdict.score, passed, evalName: opts.evaluator.name, evidence: verdict.evidence });
  await tick(); // keeper actuates settle(dealId, attId) via KeeperHub; contract decides
}

async function main() {
  store.reset();
  audit.reset();

  log.banner("Talos — the eval layer for the agent economy");
  const { escrow, usdc, evalRegistry, attestationRegistry } = addresses();
  log.info(`chain ${config.chainId} · escrow ${escrow} · usdc ${usdc}`);
  log.info(`evalRegistry ${evalRegistry} · attestationRegistry ${attestationRegistry}`);
  log.info(`settler (KeeperHub signer) ${accounts.settler.address}`);

  // Seller runs as its own process (run.sh starts it). Fall back to in-process if unreachable
  // so `pnpm demo` works standalone.
  let stopSeller: (() => void) | null = null;
  const reachable = await fetch(`${config.sellerUrl}/health`).then((r) => r.ok).catch(() => false);
  if (reachable) log.info(`seller agent reachable at ${config.sellerUrl} (separate process)`);
  else {
    log.info(`seller not reachable — starting in-process`);
    stopSeller = await startSeller();
  }

  log.banner("Register evals onchain");
  await ensureEvalsRegistered();

  await fundBuyer(AMOUNT * 6n);
  const buyer0 = await usdcBalance(accounts.buyer.address);
  const seller0 = await usdcBalance(accounts.seller.address);

  log.banner("reproduction — full-correct delivery reproduces → release");
  await runDeal({ nonce: n("repro-ok-1"), evaluator: reproduction, input: reproInput(1), mode: { mode: "honest" } });

  log.banner("fieldMatch — 97% correct clears the 95% bar → release (graded pass)");
  await runDeal({ nonce: n("field-pass-2"), evaluator: fieldMatch, input: fieldInput(), mode: { mode: "degrade", param: 3 } });

  log.banner("fieldMatch — 90% correct misses the 95% bar → refund (the eval-layer money shot)");
  await runDeal({ nonce: n("field-fail-3"), evaluator: fieldMatch, input: fieldInput(), mode: { mode: "degrade", param: 10 } });

  log.banner("reproduction — tampered delivery scores 0 → refund (fraud)");
  await runDeal({ nonce: n("repro-fraud-4"), evaluator: reproduction, input: reproInput(4), mode: { mode: "fraud" } });

  log.banner("Autonomous refund — deal expires, KeeperHub refunds from onchain state");
  const expireSecs = config.chainId === 31337 ? 2 : 30;
  await lockDeal({
    nonce: n("expire-5"),
    amount: AMOUNT,
    deadlineSecs: expireSecs,
    evalId: evalIdFor(reproduction),
    evalName: reproduction.name,
    input: reproInput(5),
  });
  log.info("no delivery arrives; advancing past the deadline…");
  await advanceTime(expireSecs + 3);
  await tick(); // watcher sees isExpired() → autonomous refund

  // On testnet, KeeperHub lands the verdict settlements asynchronously; reconcile local status
  // from onchain (poll until no deal is still Held or a timeout).
  if (config.chainId === 84532 && config.keeperhubWebhookUrl) {
    log.info("waiting for KeeperHub to land async settlements…");
    for (let i = 0; i < 20; i++) {
      let anyHeld = false;
      for (const rec of store.all()) {
        const d = await readDeal(rec.dealId);
        if (d.status === "Released") store.setStatus(rec.dealId, "released");
        else if (d.status === "Refunded") store.setStatus(rec.dealId, "refunded");
        else if (d.status === "Held") anyHeld = true;
      }
      if (!anyHeld) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // --- Summary ---
  log.banner("Settlement summary");
  for (const rec of store.all()) {
    const d = await readDeal(rec.dealId);
    const tag = rec.status === "released" ? `${color.green}RELEASED${color.reset}` : `${color.yellow}REFUNDED${color.reset}`;
    const score = rec.score !== undefined ? `${(rec.score / 100).toFixed(0)}%` : "—";
    console.log(
      `  ${rec.dealId.slice(0, 12)}…  ${tag}  ${fmtUsdc(BigInt(rec.amount))}  eval=${rec.evalName.padEnd(12)} ` +
        `score=${score.padEnd(5)} onchain=${d.status}  ${color.dim}settle ${rec.settleTx?.slice(0, 12) ?? "—"}…${color.reset}`
    );
  }

  const buyer1 = await usdcBalance(accounts.buyer.address);
  const seller1 = await usdcBalance(accounts.seller.address);
  log.banner("Balances");
  console.log(`  buyer  Δ ${fmtUsdc(buyer1 - buyer0)}`);
  console.log(
    `  seller Δ ${fmtUsdc(seller1 - seller0)}   ${color.dim}(2 releases = ${fmtUsdc(AMOUNT * 2n)} + 5 x402 delivery fees = 0.50 USDC)${color.reset}`
  );

  // --- Reputation from onchain Attested events ---
  log.banner("Reputation (from onchain Attested events)");
  const atts = await readAttestations();
  const bySeller = new Map<string, { n: number; sum: number; pass: number }>();
  const dealByDeliverable = new Map<string, { seller: string; passed: boolean }>();
  for (const rec of store.all()) {
    if (rec.deliverableHash) dealByDeliverable.set(rec.deliverableHash.toLowerCase(), { seller: rec.seller, passed: rec.status === "released" });
  }
  for (const a of atts) {
    const d = dealByDeliverable.get(a.deliverableHash.toLowerCase());
    const seller = d?.seller ?? a.evaluator;
    const agg = bySeller.get(seller) ?? { n: 0, sum: 0, pass: 0 };
    agg.n++;
    agg.sum += a.score;
    if (d?.passed) agg.pass++;
    bySeller.set(seller, agg);
  }
  for (const [seller, agg] of bySeller) {
    console.log(
      `  ${seller.slice(0, 12)}…  ${agg.n} attestations · mean score ${(agg.sum / agg.n / 100).toFixed(1)}% · ${agg.pass}/${agg.n} passed`
    );
  }

  const rows = audit.all();
  const released = rows.filter((r) => r.action === "release" && r.outcome === "settled").length;
  const refunded = rows.filter((r) => r.action === "refund" && r.outcome === "settled").length;
  log.banner("Audit trail");
  console.log(`  ${rows.length} settlement rows · ${color.green}${released} released${color.reset} · ${color.yellow}${refunded} refunded${color.reset}`);
  console.log(`  ${color.dim}full trail: keeper/.audit.jsonl  ·  view: pnpm audit${color.reset}\n`);

  if (stopSeller) stopSeller();
  process.exit(0);
}

// Silence unused-import warning for ORACLE_ADDRESS (used by the signature eval path/tests).
void ORACLE_ADDRESS;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
