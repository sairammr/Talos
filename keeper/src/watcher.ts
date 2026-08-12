// Settlement keeper watcher loop (PRD §6, §7). Idempotent at TWO layers:
//   - local status flag (releasing/refunding) prevents re-entry inside the loop
//   - re-reads the on-chain deal status immediately before actuating (no stale trigger)
// The contract's terminal-status guard is the final backstop — even a buggy keeper
// cannot double-settle.
import { type Hash } from "viem";
import { readDeal, isExpired } from "./chain.js";
import { store } from "./store.js";
import { settle } from "./keeperhub.js";
import type { Verdict } from "./verifier.js";
import { log } from "./logger.js";

// Verdicts the keeper has computed off-chain (critic approved/rejected a delivery).
// Modeling "keeper posts a webhook to the workflow on critic verdict".
const pendingVerdicts = new Map<string, Verdict>();

export function submitVerdict(dealId: Hash, verdict: Verdict) {
  pendingVerdicts.set(dealId, verdict);
}

// Settle exactly once, re-reading chain state first (idempotency guard).
async function settleGuarded(
  dealId: Hash,
  trigger: "webhook-verdict" | "block-interval-deadline",
  verdict: "approved" | "rejected" | "expired",
  evidence?: Record<string, unknown>
) {
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

  const action = verdict === "approved" ? "release" : "refund";
  store.setStatus(dealId, action === "release" ? "releasing" : "refunding");
  try {
    const row = await settle({ dealId, trigger, verdict, evidence });
    store.setStatus(dealId, action === "release" ? "released" : "refunded", row.txHash);
  } catch (e) {
    // Revert local status so a later tick retries.
    store.setStatus(dealId, "held");
    log.keeper(`\x1b[31msettle failed for ${dealId.slice(0, 10)}…, will retry: ${String(e)}\x1b[0m`);
  }
}

// One pass over all held deals. Returns number of settlements fired.
export async function tick(): Promise<number> {
  let fired = 0;
  for (const rec of store.all()) {
    if (rec.status !== "held") continue;
    const dealId = rec.dealId;

    // 1) Release/refund on critic verdict (webhook trigger).
    const v = pendingVerdicts.get(dealId);
    if (v) {
      pendingVerdicts.delete(dealId);
      if (v.approved) {
        log.keeper(`verdict APPROVED for ${dealId.slice(0, 10)}… → trigger release workflow`);
        await settleGuarded(dealId, "webhook-verdict", "approved", v.evidence);
      } else {
        log.keeper(`verdict REJECTED for ${dealId.slice(0, 10)}… → trigger refund workflow`);
        await settleGuarded(dealId, "webhook-verdict", "rejected", v.evidence);
      }
      fired++;
      continue;
    }

    // 2) Autonomous deadline refund (block-interval trigger, decided from onchain state
    //    with ZERO keeper input — the honest centerpiece of "KeeperHub acts", PRD §3a).
    if (await isExpired(dealId)) {
      log.keeper(
        `${dealId.slice(0, 10)}… past deadline → autonomous block-interval refund (no verdict needed)`
      );
      await settleGuarded(dealId, "block-interval-deadline", "expired", {
        note: "decided from onchain escrow.isExpired(dealId)",
      });
      fired++;
    }
  }
  return fired;
}

// Continuous loop mode (for `runLoop`), used outside the scripted demo.
export async function runLoop(pollMs: number, until?: () => boolean) {
  log.keeper(`watcher loop started (poll ${pollMs}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    if (until && until()) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
