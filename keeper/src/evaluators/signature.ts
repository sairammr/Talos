// `signature` — binary reproducible eval. The delivery is valid iff its payload was signed by a
// named oracle key (ECDSA recover == expected signer). Signature verification is deterministic,
// so the verdict is reproducible by anyone holding the same payload + signature.
import { keccak256, stringToHex, recoverMessageAddress, getAddress, type Hex, type Address } from "viem";
import { type Evaluator, type Verdict, codeHashOf, evalIdOf, hashOf } from "./types.js";

export interface SignatureInput {
  signer: Address; // the oracle whose signature is required
  message: string; // the payload that must be signed
}
export interface SignatureDelivery {
  signature: Hex;
}

const NAME = "signature";
const VERSION = 1;

export const signature: Evaluator = {
  id: "signature",
  name: NAME,
  version: VERSION,
  trustTier: "reproducible",
  threshold: 10_000, // binary: signed by the named oracle or not
  codeHash: codeHashOf("signature", VERSION),
  async evaluate(rawInput: unknown, rawDelivery: unknown): Promise<Verdict> {
    const input = rawInput as SignatureInput;
    const delivery = rawDelivery as SignatureDelivery;
    let recovered: Address | null = null;
    let valid = false;
    try {
      recovered = await recoverMessageAddress({ message: input.message, signature: delivery.signature });
      valid = getAddress(recovered) === getAddress(input.signer);
    } catch {
      valid = false;
    }
    const inputHash = keccak256(stringToHex(`${getAddress(input.signer)}|${input.message}`));
    const evidence = { signer: getAddress(input.signer), recovered, valid };
    return {
      score: valid ? 10_000 : 0,
      inputHash,
      deliverableHash: hashOf(delivery),
      evidence,
      evidenceHash: hashOf(evidence),
      reason: valid ? `payload signed by oracle ${getAddress(input.signer)}` : "signature does not match the named oracle",
    };
  },
};

export const signatureEvalId = evalIdOf(NAME, VERSION);
