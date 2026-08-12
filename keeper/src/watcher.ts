// Settlement keeper watcher loop. Idempotent at TWO layers:
//   - local status flag (releasing/refunding) prevents re-entry inside the loop
//   - re-reads the on-chain deal status immediately before actuating (no stale trigger)
// The contract's terminal-status guard is the final backstop — even a buggy keeper cannot
// double-settle.
//
// The verdict path is now eval → attest → settle: the keeper posts a graded attestation onchain
// (producing an attId), then submits a settle intent here; the watcher actuates
// escrow.settle(dealId, attId) and the contract decides release vs refund from the attested
// score. The deadline path is a permissionless refund (autonomous KeeperHub workflow on testnet).
import { type Hash } from "viem";
import { readDeal, isExpired } from "./chain.js";
import { store } from "./store.js";
import { settleVerdict, refundDeadline, type VerdictSettleRequest } from "./keeperhub.js";
import { log } from "./logger.js";

// Settle intents the keeper has computed + attested (attId is already onchain).
const pendingSettles = new Map<string, VerdictSettleRequest>();

export function submitSettle(req: VerdictSettleRequest) {
  pendingSettles.set(req.dealId, req);
}

// Settle exactly once, re-reading chain state first (idempotency guard).
async function settleGuarded(dealId: Hash, kind: "verdict" | "deadline"): Promise<void> {
  const rec = store.get(dealId);
  if (!rec) return;
  if (rec.status === "releasing" || rec.status === "refunding") return; // in-flight
  if (rec.status === "released" || rec.status === "refunded") return; // done

  const onchain = await readDeal(dealId);
  if (onchain.status !== "Held") {
    // Reconcile: chain already terminal. Never fire a stale trigger.
    store.setStatus(dealId, onchain.status === "Released" ? "released" : "refunded");
    return;
  }

  if (kind === "verdict") {
    const req = pendingSettles.get(dealId);
    if (!req) return;
    pendingSettles.delete(dealId);
    store.setStatus(dealId, req.passed ? "releasing" : "refunding");
    try {
      const row = await settleVerdict(req);
      store.setStatus(dealId, req.passed ? "released" : "refunded", row.txHash);
    } catch (e) {
      store.setStatus(dealId, "held"); // revert so a later tick retries
      log.keeper(`\x1b[31msettle failed for ${dealId.slice(0, 10)}…, will retry: ${String(e)}\x1b[0m`);
    }
  } else {
    store.setStatus(dealId, "refunding");
    try {
      const row = await refundDeadline(dealId, { note: "decided from onchain escrow.isExpired(dealId)" });
      store.setStatus(dealId, "refunded", row.txHash);
    } catch (e) {
      store.setStatus(dealId, "held");
      log.keeper(`\x1b[31mdeadline refund failed for ${dealId.slice(0, 10)}…, will retry: ${String(e)}\x1b[0m`);
    }
  }
}

// One pass over all held deals. Returns number of settlements fired.
export async function tick(): Promise<number> {
  let fired = 0;
  for (const rec of store.all()) {
    if (rec.status !== "held") continue;
    const dealId = rec.dealId;

    // 1) Settle on an attested verdict (webhook trigger → settle(dealId, attId)).
    if (pendingSettles.has(dealId)) {
      const req = pendingSettles.get(dealId)!;
      log.keeper(
        `verdict ${req.passed ? "PASS" : "FAIL"} (${(req.score / 100).toFixed(0)}%) for ${dealId.slice(0, 10)}… → settle(att ${req.attId.slice(0, 10)}…)`
      );
      await settleGuarded(dealId, "verdict");
      fired++;
      continue;
    }

    // 2) Autonomous deadline refund (block-interval trigger, ZERO keeper verdict).
    if (await isExpired(dealId)) {
      log.keeper(`${dealId.slice(0, 10)}… past deadline → autonomous block-interval refund (no verdict needed)`);
      await settleGuarded(dealId, "deadline");
      fired++;
    }
  }
  return fired;
}

// Continuous loop mode (used outside the scripted demo).
export async function runLoop(pollMs: number, until?: () => boolean) {
  log.keeper(`watcher loop started (poll ${pollMs}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    if (until && until()) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
