// `talos onboard` — zero-to-settling onboarding, as a self-healing checklist.
//
// Onboarding a KeeperHub agent has real friction (toolchain, funding, deploy, eval registration,
// wiring the workflow, first settlement). This walks every prerequisite, prints a live ✓/✗ with
// the EXACT next action when something's missing, and points at the dashboard when it's green.
//
//   npx tsx src/onboard.ts            # check the current environment
//   RPC_URL=… CHAIN_ID=84532 …        # same checks against Base Sepolia
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { config } from "./config.js";
import { publicClient, addresses, evalExists } from "./chain.js";
import { audit } from "./store.js";
import { EVALUATORS, evalIdFor } from "./evaluators/registry.js";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", bronze: "\x1b[38;5;179m",
};
type State = "ok" | "fix" | "skip";
interface Step { title: string; state: State; detail: string; fix?: string; }

async function run() {
  const steps: Step[] = [];
  const push = (title: string, state: State, detail: string, fix?: string) => steps.push({ title, state, detail, fix });

  // 1. Toolchain
  const node = process.versions.node;
  push("Node ≥ 20", Number(node.split(".")[0]) >= 20 ? "ok" : "fix", `node ${node}`, "install Node 20+ (nvm install 20)");
  try {
    const forge = execSync("forge --version", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n")[0];
    push("Foundry (forge/anvil)", "ok", forge);
  } catch {
    push("Foundry (forge/anvil)", "fix", "not found", "curl -L https://foundry.paradigm.xyz | bash && foundryup");
  }

  // 2. RPC + chain
  let chainOk = false;
  try {
    const id = await publicClient.getChainId();
    chainOk = id === config.chainId;
    push("RPC reachable", chainOk ? "ok" : "fix", `${config.rpcUrl} · chain ${id}`,
      chainOk ? undefined : `chain ${id} != configured ${config.chainId} — set CHAIN_ID`);
  } catch {
    push("RPC reachable", "fix", config.rpcUrl,
      config.chainId === 31337 ? "start a local chain: anvil (or ./run.sh)" : "check RPC_URL");
  }

  // 3. Deployment
  let deployed = false;
  let addrs: ReturnType<typeof addresses> | null = null;
  try {
    addrs = addresses();
    const code = chainOk ? await publicClient.getBytecode({ address: addrs.escrow }) : undefined;
    deployed = !!code && code !== "0x";
    push("Contracts deployed", deployed ? "ok" : "fix",
      deployed ? `escrow ${addrs.escrow}` : "no bytecode at escrow address",
      deployed ? undefined : "deploy the stack: ./run.sh   (or ./run.sh --testnet)");
  } catch {
    push("Contracts deployed", "fix", "no deployment found",
      "run ./run.sh — deploys EvalRegistry + AttestationRegistry + TalosEscrow, writes keeper/.deploy.json");
  }

  // 4. Evals registered onchain
  if (deployed) {
    let missing: string[] = [];
    for (const e of EVALUATORS) {
      try { if (!(await evalExists(evalIdFor(e)))) missing.push(e.name); } catch { missing.push(e.name); }
    }
    push("Evals registered onchain", missing.length === 0 ? "ok" : "fix",
      missing.length === 0 ? `${EVALUATORS.length} evals live` : `missing: ${missing.join(", ")}`,
      missing.length === 0 ? undefined : "the keeper registers evals on first run — run ./run.sh");
  } else push("Evals registered onchain", "skip", "waiting on deployment");

  // 5. KeeperHub actuation wiring
  if (config.keeperhubWebhookUrl) {
    const isWfb = (config.keeperhubApiKey ?? "").startsWith("wfb_");
    push("KeeperHub workflow wired", isWfb ? "ok" : "fix",
      isWfb ? "webhook + wfb_ key set" : "webhook set but key is not a wfb_ webhook key",
      isWfb ? undefined : "webhooks need a USER webhook key (wfb_…) from KeeperHub → API Keys → User tab, not an org kh_ key");
  } else {
    push("KeeperHub workflow wired", "skip", "using settler-fallback actuator",
      "for the hosted path: build the talos-settle workflow (webhook {dealId,attId} → settle) and set KEEPERHUB_WEBHOOK_URL — see TESTNET.md");
  }

  // 6. First settlement
  const rows = audit.all();
  const settled = rows.filter((r) => r.outcome === "settled").length;
  push("First settlement landed", settled > 0 ? "ok" : "fix", settled > 0 ? `${settled} settlements in the audit trail` : "no settlements yet",
    settled > 0 ? undefined : "run the demo: ./run.sh (local) — locks, grades, attests, settles 5 deals");

  // ---- render ----
  const icon = (s: State) => s === "ok" ? `${C.green}✓${C.reset}` : s === "fix" ? `${C.red}✗${C.reset}` : `${C.dim}◦${C.reset}`;
  console.log(`\n${C.bronze}${C.bold}  TALOS · onboard${C.reset}  ${C.dim}zero to a live onchain settlement${C.reset}\n`);
  for (const s of steps) {
    console.log(`  ${icon(s.state)}  ${C.bold}${s.title}${C.reset}  ${C.dim}${s.detail}${C.reset}`);
    if (s.state === "fix" && s.fix) console.log(`       ${C.yellow}→ ${s.fix}${C.reset}`);
  }
  const fixes = steps.filter((s) => s.state === "fix").length;
  console.log();
  if (fixes === 0) {
    console.log(`  ${C.green}${C.bold}All green.${C.reset} Open the console: ${C.cyan}web/dashboard.html${C.reset}`);
    console.log(`  ${C.dim}audit: pnpm audit   ·   deals: pnpm deals   ·   reputation: npx tsx src/cli.ts reputation${C.reset}\n`);
  } else {
    console.log(`  ${C.yellow}${fixes} step${fixes > 1 ? "s" : ""} need attention${C.reset} — fix the → items above, then re-run ${C.cyan}npx tsx src/onboard.ts${C.reset}\n`);
  }
  process.exit(fixes === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
