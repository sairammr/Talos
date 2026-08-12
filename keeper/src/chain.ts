// viem clients + escrow / registry helpers. One chain, one token.
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbiItem,
  decodeEventLog,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, loadDeployment, type Deployment } from "./config.js";
import { talosEscrowAbi } from "./abi/talosEscrow.js";
import { mockUsdcAbi } from "./abi/mockUsdc.js";
import { evalRegistryAbi } from "./abi/evalRegistry.js";
import { attestationRegistryAbi } from "./abi/attestationRegistry.js";

export const chain = defineChain({
  id: config.chainId,
  name: config.chainId === 84532 ? "Base Sepolia" : "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

export function wallet(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain, transport: http(config.rpcUrl) });
}

export const accounts = {
  buyer: privateKeyToAccount(config.buyerKey),
  seller: privateKeyToAccount(config.sellerKey),
  settler: privateKeyToAccount(config.settlerKey),
};

let _deployment: Deployment | null = null;
export function addresses(): Deployment {
  if (!_deployment) _deployment = loadDeployment();
  return _deployment;
}

export const escrowAbi = talosEscrowAbi;
export const usdcAbi = mockUsdcAbi;
export const evalRegAbi = evalRegistryAbi;
export const attRegAbi = attestationRegistryAbi;

export type DealStatus = "None" | "Held" | "Released" | "Refunded";
const STATUS: DealStatus[] = ["None", "Held", "Released", "Refunded"];

export interface OnchainDeal {
  buyer: Address;
  seller: Address;
  amount: bigint;
  deadline: bigint;
  evalId: Hex;
  status: DealStatus;
}

export async function readDeal(id: Hash): Promise<OnchainDeal> {
  const { escrow } = addresses();
  const [buyer, seller, amount, deadline, evalId, status] = (await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [id],
  })) as [Address, Address, bigint, bigint, Hex, number];
  return { buyer, seller, amount, deadline, evalId, status: STATUS[status] };
}

export async function isExpired(id: Hash): Promise<boolean> {
  const { escrow } = addresses();
  return (await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "isExpired",
    args: [id],
  })) as boolean;
}

export async function usdcBalance(who: Address): Promise<bigint> {
  const { usdc } = addresses();
  return (await publicClient.readContract({
    address: usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [who],
  })) as bigint;
}

// --- EvalRegistry ---

export async function evalExists(evalId: Hex): Promise<boolean> {
  const { evalRegistry } = addresses();
  return (await publicClient.readContract({
    address: evalRegistry,
    abi: evalRegAbi,
    functionName: "exists",
    args: [evalId],
  })) as boolean;
}

/// Register an eval if it isn't already onchain. Returns nothing; idempotent.
export async function registerEval(
  authorKey: `0x${string}`,
  name: string,
  version: number,
  codeHash: Hex,
  threshold: number,
  schemaHash: Hex
): Promise<void> {
  const { evalRegistry } = addresses();
  const w = wallet(authorKey);
  const tx = await w.writeContract({
    address: evalRegistry,
    abi: evalRegAbi,
    functionName: "register",
    args: [name, version, codeHash, 0 /* TrustTier.Reproducible */, threshold, schemaHash],
  });
  await waitReceipt(tx);
}

// --- AttestationRegistry ---

/// Post a verdict onchain and return the attId parsed from the Attested event.
export async function attest(
  evaluatorKey: `0x${string}`,
  args: {
    evalId: Hex;
    version: number;
    deliverableHash: Hex;
    inputHash: Hex;
    score: number;
    evidenceHash: Hex;
  }
): Promise<{ attId: Hex; txHash: Hex }> {
  const { attestationRegistry } = addresses();
  const w = wallet(evaluatorKey);
  const tx = await w.writeContract({
    address: attestationRegistry,
    abi: attRegAbi,
    functionName: "attest",
    args: [args.evalId, args.version, args.deliverableHash, args.inputHash, args.score, args.evidenceHash],
  });
  const receipt = await waitReceipt(tx);
  // Parse the Attested event to get the attId (first indexed arg).
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== attestationRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: attRegAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Attested") {
        return { attId: (decoded.args as { attId: Hex }).attId, txHash: tx };
      }
    } catch {
      /* not our event */
    }
  }
  throw new Error("attest: Attested event not found in receipt");
}

export async function waitReceipt(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

// 6-decimal USDC formatting.
export function fmtUsdc(v: bigint): string {
  const s = (Number(v) / 1e6).toFixed(2);
  return `${s} USDC`;
}

// Reputation: read Attested events, aggregate per seller is not possible from the event alone
// (it carries evaluator + evalId + score). We surface per-evaluator/per-eval aggregates and let
// the CLI join deliverableHash -> deal -> seller via local state.
export interface AttestedEvent {
  attId: Hex;
  evaluator: Address;
  evalId: Hex;
  deliverableHash: Hex;
  score: number;
}

export const attestedEvent = parseAbiItem(
  "event Attested(bytes32 indexed attId, address indexed evaluator, bytes32 indexed evalId, bytes32 deliverableHash, uint16 score)"
);

export async function readAttestations(fromBlock?: bigint): Promise<AttestedEvent[]> {
  const { attestationRegistry } = addresses();
  // Public RPCs cap eth_getLogs at ~10k blocks; default to a recent window.
  if (fromBlock === undefined) {
    const latest = await publicClient.getBlockNumber();
    fromBlock = latest > 9000n ? latest - 9000n : 0n;
  }
  const logs = await publicClient.getLogs({
    address: attestationRegistry,
    event: attestedEvent,
    fromBlock,
    toBlock: "latest",
  });
  return logs.map((l) => ({
    attId: l.args.attId as Hex,
    evaluator: l.args.evaluator as Address,
    evalId: l.args.evalId as Hex,
    deliverableHash: l.args.deliverableHash as Hex,
    score: Number(l.args.score),
  }));
}

export const events = {
  Locked: parseAbiItem(
    "event Locked(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint64 deadline, bytes32 evalId)"
  ),
  Settled: parseAbiItem("event Settled(bytes32 indexed id, bytes32 indexed attId, uint16 score, bool passed)"),
  Released: parseAbiItem("event Released(bytes32 indexed id, address indexed seller, uint256 amount)"),
  Refunded: parseAbiItem(
    "event Refunded(bytes32 indexed id, address indexed buyer, uint256 amount, bool byDeadline)"
  ),
};
