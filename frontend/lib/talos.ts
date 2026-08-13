import { baseSepolia } from "viem/chains";

export const CHAIN = baseSepolia; // 84532

// Deployed stack — Base Sepolia (see HANDOFF.md)
export const ADDR = {
  evalRegistry: "0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47",
  attestationRegistry: "0x8C672E44452F4e6522Fe47c63c3bD29e818335e8",
  escrow: "0xC6b6Baa7A80ec471e81F0680BC599A3041410719",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  settler: "0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4",
} as const;

export const EXPLORER = "https://sepolia.basescan.org";
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;

// TrustTier enum — v1 registers only Reproducible (= 0)
export const TIER_REPRODUCIBLE = 0;

// The three evals already registered onchain (name + version → id computed clientside)
export const KNOWN_EVALS = [
  { name: "reproduction", version: 1, threshold: 10000, kind: "binary" },
  { name: "fieldMatch", version: 1, threshold: 9500, kind: "graded" },
  { name: "signature", version: 1, threshold: 10000, kind: "binary" },
] as const;

// ---- ABIs (only what the app calls) ----
export const evalRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "uint16" },
      { name: "evaluatorCodeHash", type: "bytes32" },
      { name: "trustTier", type: "uint8" },
      { name: "threshold", type: "uint16" },
      { name: "schemaHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "bytes32" }],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getEval",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "bytes32" },
          { name: "name", type: "string" },
          { name: "version", type: "uint16" },
          { name: "evaluatorCodeHash", type: "bytes32" },
          { name: "trustTier", type: "uint8" },
          { name: "threshold", type: "uint16" },
          { name: "schemaHash", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "EvalRegistered",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "version", type: "uint16", indexed: false },
      { name: "evaluatorCodeHash", type: "bytes32", indexed: false },
      { name: "threshold", type: "uint16", indexed: false },
      { name: "author", type: "address", indexed: true },
    ],
  },
] as const;

export const escrowAbi = [
  {
    type: "function",
    name: "lock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "evalId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getDeal",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "evalId", type: "bytes32" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "Locked",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "evalId", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
