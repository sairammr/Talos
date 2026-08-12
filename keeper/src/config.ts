// Central config. Everything comes from env with sane local-anvil defaults so the
// whole flow runs with zero external credentials. Flip RPC_URL + keys for Base Sepolia.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// Minimal .env loader (avoids a dependency). keeper/.env overrides process.env defaults.
function loadEnv() {
  const path = resolve(__dirname, "..", ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

// Anvil default accounts (well-known, test-only keys). Buyer/seller/settler distinct.
export const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  buyer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  seller: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  settler: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

export const config = {
  root: ROOT,
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
  chainId: Number(process.env.CHAIN_ID ?? 31337),
  // Contract addresses are written by scripts/deploy into keeper/.deploy.json,
  // but env wins if set.
  escrowAddress: process.env.ESCROW_ADDRESS as `0x${string}` | undefined,
  usdcAddress: process.env.USDC_ADDRESS as `0x${string}` | undefined,

  // Keys. Default to anvil test accounts.
  buyerKey: (process.env.BUYER_KEY ?? ANVIL_KEYS.buyer) as `0x${string}`,
  sellerKey: (process.env.SELLER_KEY ?? ANVIL_KEYS.seller) as `0x${string}`,
  settlerKey: (process.env.SETTLER_KEY ?? ANVIL_KEYS.settler) as `0x${string}`,

  // x402 seller delivery endpoint.
  sellerPort: Number(process.env.SELLER_PORT ?? 4021),
  get sellerUrl() {
    return process.env.SELLER_URL ?? `http://127.0.0.1:${this.sellerPort}`;
  },

  // KeeperHub actuation. If KEEPERHUB_WEBHOOK_URL is set, settlement legs are POSTed
  // to the workflow; otherwise the settler wallet submits directly (labeled fallback).
  keeperhubWebhookUrl: process.env.KEEPERHUB_WEBHOOK_URL,
  keeperhubApiKey: process.env.KEEPERHUB_API_KEY,

  // Watcher cadence.
  pollMs: Number(process.env.POLL_MS ?? 1500),

  // State + audit files.
  stateFile: resolve(__dirname, "..", ".state.json"),
  auditFile: resolve(__dirname, "..", ".audit.jsonl"),
  deployFile: resolve(__dirname, "..", ".deploy.json"),
};

export interface Deployment {
  escrow: `0x${string}`;
  usdc: `0x${string}`;
  evalRegistry: `0x${string}`;
  attestationRegistry: `0x${string}`;
}

export function loadDeployment(): Deployment {
  const env = {
    escrow: process.env.ESCROW_ADDRESS,
    usdc: process.env.USDC_ADDRESS,
    evalRegistry: process.env.EVAL_REGISTRY_ADDRESS,
    attestationRegistry: process.env.ATTESTATION_REGISTRY_ADDRESS,
  };
  if (env.escrow && env.usdc && env.evalRegistry && env.attestationRegistry) {
    return env as Deployment;
  }
  if (!existsSync(config.deployFile)) {
    throw new Error(
      `No deployment found. Run the deploy step first (see run.sh) or set the *_ADDRESS env vars.`
    );
  }
  const d = JSON.parse(readFileSync(config.deployFile, "utf8"));
  return { escrow: d.escrow, usdc: d.usdc, evalRegistry: d.evalRegistry, attestationRegistry: d.attestationRegistry };
}
