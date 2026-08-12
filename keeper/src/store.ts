// Keeper state + audit trail. JSON file store (PRD: "JSON/SQLite state store").
// The audit trail mirrors what KeeperHub logs (trigger → verdict → tx hash → gas → outcome),
// so a decision is independently checkable even without the KeeperHub UI.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { config } from "./config.js";

export type LocalStatus = "held" | "releasing" | "released" | "refunding" | "refunded";

export interface DealRecord {
  dealId: `0x${string}`;
  buyer: `0x${string}`;
  seller: `0x${string}`;
  amount: string; // stringified bigint
  deadline: number; // unix seconds
  evalName: string; // which eval gates this deal
  evalId: `0x${string}`;
  input: unknown; // the agreed eval input (reproducibility reference)
  status: LocalStatus;
  score?: number; // basis points, once graded
  attId?: `0x${string}`;
  deliverableHash?: `0x${string}`;
  lockTx?: `0x${string}`;
  settleTx?: `0x${string}`;
  createdAt: number;
}

interface State {
  deals: Record<string, DealRecord>;
}

function read(): State {
  if (!existsSync(config.stateFile)) return { deals: {} };
  return JSON.parse(readFileSync(config.stateFile, "utf8"));
}

function write(s: State) {
  writeFileSync(config.stateFile, JSON.stringify(s, null, 2));
}

export const store = {
  upsert(rec: DealRecord) {
    const s = read();
    s.deals[rec.dealId] = rec;
    write(s);
  },
  get(dealId: string): DealRecord | undefined {
    return read().deals[dealId];
  },
  all(): DealRecord[] {
    return Object.values(read().deals).sort((a, b) => a.createdAt - b.createdAt);
  },
  setStatus(dealId: string, status: LocalStatus, settleTx?: `0x${string}`) {
    const s = read();
    const d = s.deals[dealId];
    if (!d) return;
    d.status = status;
    if (settleTx) d.settleTx = settleTx;
    write(s);
  },
  patch(dealId: string, fields: Partial<DealRecord>) {
    const s = read();
    const d = s.deals[dealId];
    if (!d) return;
    Object.assign(d, fields);
    write(s);
  },
  reset() {
    write({ deals: {} });
  },
};

export interface AuditRow {
  ts: string;
  dealId: `0x${string}`;
  trigger: "webhook-verdict" | "block-interval-deadline";
  verdict: "approved" | "rejected" | "expired";
  action: "release" | "refund";
  actuator: "keeperhub-workflow" | "settler-fallback";
  evalName?: string; // which eval graded the delivery
  score?: number; // basis points
  attId?: `0x${string}`; // the onchain attestation the settle read
  txHash?: `0x${string}`;
  gasUsed?: string;
  evidence?: Record<string, unknown>;
  outcome: "settled" | "failed" | "skipped";
  reason?: string;
}

export const audit = {
  append(row: Omit<AuditRow, "ts">) {
    const full: AuditRow = { ts: new Date().toISOString(), ...row };
    appendFileSync(config.auditFile, JSON.stringify(full) + "\n");
    return full;
  },
  all(): AuditRow[] {
    if (!existsSync(config.auditFile)) return [];
    return readFileSync(config.auditFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  },
  reset() {
    writeFileSync(config.auditFile, "");
  },
};
