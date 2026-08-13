import { keccak256, encodeAbiParameters, toHex, stringToBytes, type Hex } from "viem";

// evalId = keccak256(abi.encode(name, version)) — matches EvalRegistry.register
export function evalId(name: string, version: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint16" }],
      [name, version]
    )
  );
}

// Convenience: hash arbitrary text into a bytes32 (for evaluatorCodeHash / schemaHash
// when the user types a source string instead of pasting a precomputed hash).
export function hashText(s: string): Hex {
  return keccak256(stringToBytes(s));
}

export const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

// A random bytes32 deal id (deterministic-free; only used for the live test deal).
export function randomDealId(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function isBytes32(s: string): s is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

export const short = (h: string, n = 6) =>
  h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h;
