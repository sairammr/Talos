// viem clients + escrow/usdc helpers. One chain, one token (PRD §0 row 4).
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbiItem,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, loadDeployment } from "./config.js";
import { talosEscrowAbi } from "./abi/talosEscrow.js";
import { mockUsdcAbi } from "./abi/mockUsdc.js";

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

let _deployment: { escrow: Address; usdc: Address } | null = null;
export function addresses() {
  if (!_deployment) _deployment = loadDeployment();
  return _deployment;
}

export const escrowAbi = talosEscrowAbi;
export const usdcAbi = mockUsdcAbi;

export type DealStatus = "None" | "Held" | "Released" | "Refunded";
const STATUS: DealStatus[] = ["None", "Held", "Released", "Refunded"];

export interface OnchainDeal {
  buyer: Address;
  seller: Address;
  amount: bigint;
  deadline: bigint;
  status: DealStatus;
}

export async function readDeal(id: Hash): Promise<OnchainDeal> {
  const { escrow } = addresses();
  const [buyer, seller, amount, deadline, status] = (await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [id],
  })) as [Address, Address, bigint, bigint, number];
  return { buyer, seller, amount, deadline, status: STATUS[status] };
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

export async function waitReceipt(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

// 6-decimal USDC formatting.
export function fmtUsdc(v: bigint): string {
  const s = (Number(v) / 1e6).toFixed(2);
  return `${s} USDC`;
}

export const events = {
  Locked: parseAbiItem(
    "event Locked(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint64 deadline)"
  ),
  Released: parseAbiItem("event Released(bytes32 indexed id, address indexed seller, uint256 amount)"),
  Refunded: parseAbiItem(
    "event Refunded(bytes32 indexed id, address indexed buyer, uint256 amount, bool byDeadline)"
  ),
};
