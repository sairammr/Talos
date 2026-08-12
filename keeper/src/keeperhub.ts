// KeeperHub actuation layer — the "last mile" (PRD §2, §3a).
//
// KeeperHub is the EXECUTION surface, not the decision-maker on the release path:
// the reproducibility verdict is computed off-chain (unavoidable), and KeeperHub
// *actuates* a proven verdict via a workflow Web3 Action. The refund-on-deadline
// path is genuinely autonomous — decided entirely inside KeeperHub from onchain
// state (Block-Interval trigger → Web3 read isExpired() → Web3 write refund()).
//
// Two actuation modes, selected by config:
//   1. workflow  — POST {dealId, verdict} to the KeeperHub workflow webhook. The
//                  workflow's Condition node branches and its Web3 Action signs the
//                  release()/refund() tx with the settler key. (Set KEEPERHUB_WEBHOOK_URL.)
//   2. fallback  — the settler wallet submits the release/refund tx directly, still
//                  writing the full audit row. This is the PRD risk-table fallback
//                  ("keeper signs but submits through KeeperHub") for when the hosted
//                  workflow isn't wired yet. Labeled honestly in the audit trail.
import { type Hash } from "viem";
import { config } from "./config.js";
import { wallet, addresses, escrowAbi, waitReceipt } from "./chain.js";
import { audit, type AuditRow } from "./store.js";
import { log } from "./logger.js";

type Trigger = "webhook-verdict" | "block-interval-deadline";
type Verdict = "approved" | "rejected" | "expired";

export interface SettleRequest {
  dealId: Hash;
  trigger: Trigger;
  verdict: Verdict;
  evidence?: Record<string, unknown>;
}

const actuator: AuditRow["actuator"] = config.keeperhubWebhookUrl
  ? "keeperhub-workflow"
  : "settler-fallback";

// Fire the settlement. Returns the audit row (with tx hash) or throws.
export async function settle(req: SettleRequest): Promise<AuditRow> {
  const action: "release" | "refund" = req.verdict === "approved" ? "release" : "refund";

  if (config.keeperhubWebhookUrl) {
    return settleViaWorkflow(req, action);
  }
  return settleViaFallback(req, action);
}

async function settleViaWorkflow(req: SettleRequest, action: "release" | "refund"): Promise<AuditRow> {
  log.hub(`→ KeeperHub workflow webhook: ${action}(${req.dealId.slice(0, 10)}…) verdict=${req.verdict}`);
  const res = await fetch(config.keeperhubWebhookUrl!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.keeperhubApiKey ? { authorization: `Bearer ${config.keeperhubApiKey}` } : {}),
    },
    body: JSON.stringify({ dealId: req.dealId, verdict: req.verdict, action }),
  });
  const body = (await res.json().catch(() => ({}))) as { txHash?: Hash; gasUsed?: string };
  const outcome: AuditRow["outcome"] = res.ok ? "settled" : "failed";
  const row = audit.append({
    dealId: req.dealId,
    trigger: req.trigger,
    verdict: req.verdict,
    action,
    actuator: "keeperhub-workflow",
    txHash: body.txHash,
    gasUsed: body.gasUsed,
    evidence: req.evidence,
    outcome,
    reason: res.ok ? undefined : `webhook ${res.status}`,
  });
  if (!res.ok) throw new Error(`KeeperHub workflow webhook failed: ${res.status}`);
  log.hub(`workflow actuated ${action} tx ${body.txHash?.slice(0, 12)}…`);
  return row;
}

// Fallback: settler submits directly. Retry with backoff to stand in for the
// smart-gas + exponential-backoff KeeperHub gives on the hosted path.
async function settleViaFallback(req: SettleRequest, action: "release" | "refund"): Promise<AuditRow> {
  const { escrow } = addresses();
  const settler = wallet(config.settlerKey);
  log.hub(
    `→ settler-fallback (submit-through-keeper): ${action}(${req.dealId.slice(0, 10)}…) verdict=${req.verdict}`
  );

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tx = await settler.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: action,
        args: [req.dealId],
      });
      const receipt = await waitReceipt(tx);
      const row = audit.append({
        dealId: req.dealId,
        trigger: req.trigger,
        verdict: req.verdict,
        action,
        actuator: "settler-fallback",
        txHash: tx,
        gasUsed: receipt.gasUsed.toString(),
        evidence: req.evidence,
        outcome: "settled",
      });
      log.hub(
        `actuated ${action} tx ${tx.slice(0, 12)}… gas ${receipt.gasUsed} \x1b[2m(attempt ${attempt})\x1b[0m`
      );
      return row;
    } catch (e) {
      lastErr = e;
      log.hub(`\x1b[33mattempt ${attempt} failed, backing off\x1b[0m`);
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  audit.append({
    dealId: req.dealId,
    trigger: req.trigger,
    verdict: req.verdict,
    action,
    actuator: "settler-fallback",
    outcome: "failed",
    reason: String(lastErr),
  });
  throw lastErr;
}

export function actuatorName() {
  return actuator;
}
