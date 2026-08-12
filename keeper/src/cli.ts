// Thin views over the eval layer. `pnpm audit` · `pnpm deals` · `npx tsx src/cli.ts reputation`.
import { audit, store } from "./store.js";
import { readAttestations } from "./chain.js";
import { color } from "./logger.js";

const cmd = process.argv[2] ?? "audit";

if (cmd === "audit") {
  const rows = audit.all();
  if (rows.length === 0) {
    console.log("no audit rows yet — run `pnpm demo`");
    process.exit(0);
  }
  console.log(`\n${color.bold}Talos audit trail${color.reset}  (${rows.length} rows)\n`);
  console.log(
    `${color.dim}time      deal          eval          score  action   actuator            tx              outcome${color.reset}`
  );
  for (const r of rows) {
    const av = r.action === "release" ? color.green : color.yellow;
    const score = r.score !== undefined ? `${(r.score / 100).toFixed(0)}%` : "—";
    console.log(
      `${r.ts.slice(11, 19)}  ${r.dealId.slice(0, 12)}  ${(r.evalName ?? "—").padEnd(12)} ${score.padEnd(6)} ` +
        `${av}${r.action.padEnd(8)}${color.reset} ${r.actuator.padEnd(19)} ${(r.txHash?.slice(0, 14) ?? "—").padEnd(15)} ${r.outcome}`
    );
    if (r.attId) {
      console.log(`${color.dim}          ↳ onchain attestation ${r.attId.slice(0, 18)}… (score is independently reproducible)${color.reset}`);
    }
  }
  console.log();
} else if (cmd === "deals") {
  const deals = store.all();
  console.log(`\n${color.bold}Deals${color.reset}  (${deals.length})\n`);
  for (const d of deals) {
    const c = d.status === "released" ? color.green : d.status === "refunded" ? color.yellow : color.dim;
    const score = d.score !== undefined ? `${(d.score / 100).toFixed(0)}%` : "—";
    console.log(
      `  ${d.dealId.slice(0, 14)}  ${c}${d.status.padEnd(9)}${color.reset} ` +
        `${(Number(d.amount) / 1e6).toFixed(2)} USDC  eval=${d.evalName.padEnd(12)} score=${score.padEnd(5)} ` +
        `lock=${d.lockTx?.slice(0, 12) ?? "—"}  settle=${d.settleTx?.slice(0, 12) ?? "—"}`
    );
  }
  console.log();
} else if (cmd === "reputation") {
  // Per-seller reputation joined from onchain Attested events + local deal->seller mapping.
  const atts = await readAttestations();
  const dealByDeliverable = new Map<string, { seller: string; passed: boolean }>();
  for (const d of store.all()) {
    if (d.deliverableHash) dealByDeliverable.set(d.deliverableHash.toLowerCase(), { seller: d.seller, passed: d.status === "released" });
  }
  const bySeller = new Map<string, { n: number; sum: number; pass: number }>();
  for (const a of atts) {
    const d = dealByDeliverable.get(a.deliverableHash.toLowerCase());
    const seller = d?.seller ?? a.evaluator;
    const agg = bySeller.get(seller) ?? { n: 0, sum: 0, pass: 0 };
    agg.n++;
    agg.sum += a.score;
    if (d?.passed) agg.pass++;
    bySeller.set(seller, agg);
  }
  console.log(`\n${color.bold}Reputation${color.reset}  (from ${atts.length} onchain Attested events)\n`);
  if (bySeller.size === 0) console.log("  no attestations yet — run `pnpm demo`");
  for (const [seller, agg] of bySeller) {
    console.log(`  ${seller}  ${agg.n} attestations · mean ${(agg.sum / agg.n / 100).toFixed(1)}% · ${agg.pass}/${agg.n} passed`);
  }
  console.log();
} else {
  console.log("usage: cli.ts [audit|deals|reputation]");
}
