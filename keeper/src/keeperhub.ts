// KeeperHub actuation layer — the "last mile" of the eval layer.
//
// The DECISION is onchain: the keeper posts a graded verdict to AttestationRegistry, then
// KeeperHub calls escrow.settle(dealId, attId) and the *contract* branches on the attested
// score vs the eval's threshold. KeeperHub actuates a proven verdict; it does not pick the
// branch. The deadline refund is a separate, genuinely autonomous KeeperHub block-interval
// workflow (read isExpired → write refund); the keeper's fallback below stands in for it locally.
//
// Two actuation modes:
//   1. workflow  — POST {dealId, attId} to the KeeperHub webhook; the workflow's Web3 Action
//                  signs settle(dealId, attId). (Set KEEPERHUB_WEBHOOK_URL.)
//   2. fallback  — the settler wallet submits settle()/refund() directly (labeled honestly).
import { type Hash, type Hex } from "viem";
import { config } from "./config.js";
import { wallet, addresses, escrowAbi, waitReceipt } from "./chain.js";
import { audit, type AuditRow } from "./store.js";
import { log } from "./logger.js";

type Trigger = "webhook-verdict" | "block-interval-deadline";

export interface VerdictSettleRequest {
  dealId: Hash;
  attId: Hex;
  score: number;
  passed: boolean;
  evalName: string;
  evidence?: Record<string, unknown>;
}

const actuator: AuditRow["actuator"] = config.keeperhubWebhookUrl ? "keeperhub-workflow" : "settler-fallback";
export function actuatorName() {
  return actuator;
}

// Settle a deal from an onchain-attested verdict. The contract decides release vs refund; we
// record the predicted action (from the score) for the audit trail.
export async function settleVerdict(req: VerdictSettleRequest): Promise<AuditRow> {
  const action: "release" | "refund" = req.passed ? "release" : "refund";
  const verdict = req.passed ? "approved" : "rejected";

  if (config.keeperhubWebhookUrl) {
    return actuateViaWorkflow({
      dealId: req.dealId,
      attId: req.attId,
      trigger: "webhook-verdict",
      verdict,
      action,
      score: req.score,
      evalName: req.evalName,
      evidence: req.evidence,
    });
  }
  return actuateViaFallback({
    fn: "settle",
    args: [req.dealId, req.attId],
    dealId: req.dealId,
    attId: req.attId,
    trigger: "webhook-verdict",
    verdict,
    action,
    score: req.score,
    evalName: req.evalName,
    evidence: req.evidence,
  });
}

// Autonomous deadline refund. On testnet this is a KeeperHub block-interval workflow deciding
// from onchain isExpired(); locally the keeper's settler submits refund() as the stand-in.
export async function refundDeadline(dealId: Hash, evidence?: Record<string, unknown>): Promise<AuditRow> {
  return actuateViaFallback({
    fn: "refund",
    args: [dealId],
    dealId,
    trigger: "block-interval-deadline",
    verdict: "expired",
    action: "refund",
    evidence,
  });
}

interface WorkflowActuation {
  dealId: Hash;
  attId: Hex;
  trigger: Trigger;
  verdict: AuditRow["verdict"];
  action: "release" | "refund";
  score?: number;
  evalName?: string;
  evidence?: Record<string, unknown>;
}

async function actuateViaWorkflow(a: WorkflowActuation): Promise<AuditRow> {
  log.hub(`→ KeeperHub workflow webhook: settle(${a.dealId.slice(0, 10)}…, att ${a.attId.slice(0, 10)}…) score=${a.score}`);
  const res = await fetch(config.keeperhubWebhookUrl!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.keeperhubApiKey ? { authorization: `Bearer ${config.keeperhubApiKey}` } : {}),
    },
    body: JSON.stringify({ dealId: a.dealId, attId: a.attId }),
  });
  const body = (await res.json().catch(() => ({}))) as { txHash?: Hex; gasUsed?: string };
  const outcome: AuditRow["outcome"] = res.ok ? "settled" : "failed";
  const row = audit.append({
    dealId: a.dealId,
    trigger: a.trigger,
    verdict: a.verdict,
    action: a.action,
    actuator: "keeperhub-workflow",
    evalName: a.evalName,
    score: a.score,
    attId: a.attId,
    txHash: body.txHash,
    gasUsed: body.gasUsed,
    evidence: a.evidence,
    outcome,
    reason: res.ok ? undefined : `webhook ${res.status}`,
  });
  if (!res.ok) throw new Error(`KeeperHub workflow webhook failed: ${res.status}`);
  log.hub(`workflow actuated settle ${body.txHash ? `tx ${body.txHash.slice(0, 12)}…` : "(async)"}`);
  return row;
}

interface FallbackActuation {
  fn: "settle" | "refund";
  args: readonly unknown[];
  dealId: Hash;
  attId?: Hex;
  trigger: Trigger;
  verdict: AuditRow["verdict"];
  action: "release" | "refund";
  score?: number;
  evalName?: string;
  evidence?: Record<string, unknown>;
}

async function actuateViaFallback(a: FallbackActuation): Promise<AuditRow> {
  const { escrow } = addresses();
  const settler = wallet(config.settlerKey);
  log.hub(`→ settler-fallback: ${a.fn}(${a.dealId.slice(0, 10)}…) ${a.attId ? `att ${a.attId.slice(0, 10)}…` : ""}`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tx = await settler.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: a.fn,
        args: a.args as never,
      });
      const receipt = await waitReceipt(tx);
      const row = audit.append({
        dealId: a.dealId,
        trigger: a.trigger,
        verdict: a.verdict,
        action: a.action,
        actuator: "settler-fallback",
        evalName: a.evalName,
        score: a.score,
        attId: a.attId,
        txHash: tx,
        gasUsed: receipt.gasUsed.toString(),
        evidence: a.evidence,
        outcome: "settled",
      });
      log.hub(`actuated ${a.fn} tx ${tx.slice(0, 12)}… gas ${receipt.gasUsed} \x1b[2m(attempt ${attempt})\x1b[0m`);
      return row;
    } catch (e) {
      lastErr = e;
      log.hub(`\x1b[33mattempt ${attempt} failed, backing off\x1b[0m`);
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  audit.append({
    dealId: a.dealId,
    trigger: a.trigger,
    verdict: a.verdict,
    action: a.action,
    actuator: "settler-fallback",
    evalName: a.evalName,
    score: a.score,
    attId: a.attId,
    evidence: a.evidence,
    outcome: "failed",
    reason: String(lastErr),
  });
  throw lastErr;
}
