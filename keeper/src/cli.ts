// Thin audit view CLI (PRD §4 "thin audit view"). `pnpm audit` / `pnpm deals`.
import { audit, store } from "./store.js";
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
    `${color.dim}time      deal          trigger                verdict   action   actuator            tx              outcome${color.reset}`
  );
  for (const r of rows) {
    const av = r.action === "release" ? color.green : color.yellow;
    console.log(
      `${r.ts.slice(11, 19)}  ${r.dealId.slice(0, 12)}  ${r.trigger.padEnd(22)} ` +
        `${r.verdict.padEnd(9)} ${av}${r.action.padEnd(8)}${color.reset} ${r.actuator.padEnd(19)} ` +
        `${(r.txHash?.slice(0, 14) ?? "—").padEnd(15)} ${r.outcome}`
    );
    if (r.evidence?.expectedChecksum) {
      console.log(
        `${color.dim}          ↳ reproduced: input ${(r.evidence.inputHash as string)?.slice(0, 14)}… → ${(r.evidence.expectedChecksum as string)?.slice(0, 14)}… (independently checkable)${color.reset}`
      );
    }
  }
  console.log();
} else if (cmd === "deals") {
  const deals = store.all();
  console.log(`\n${color.bold}Deals${color.reset}  (${deals.length})\n`);
  for (const d of deals) {
    const c = d.status === "released" ? color.green : d.status === "refunded" ? color.yellow : color.dim;
    console.log(
      `  ${d.dealId.slice(0, 14)}  ${c}${d.status.padEnd(9)}${color.reset} ` +
        `${(Number(d.amount) / 1e6).toFixed(2)} USDC  transform=${d.spec.transform}  ` +
        `lock=${d.lockTx?.slice(0, 12) ?? "—"}  settle=${d.settleTx?.slice(0, 12) ?? "—"}`
    );
  }
  console.log();
} else {
  console.log("usage: cli.ts [audit|deals]");
}
