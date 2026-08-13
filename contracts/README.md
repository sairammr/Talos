# Talos contracts — the eval-layer stack

Three onchain objects with a clean separation of concerns, plus a mock token for local runs.
The escrow is a **consumer** of attested verdicts, not the product: it decides release vs refund
purely from the **onchain score** vs the **onchain threshold** — never from a keeper's bare bool.

```
EvalRegistry ──catalogue──▶ AttestationRegistry ──verdict──▶ TalosEscrow (consumer)
  what is an eval,            graded score + evidence,          reads score vs threshold,
  threshold, code hash        posted by an evaluator            releases seller / refunds buyer
```

## Contracts

| File | Contract | Role |
|---|---|---|
| [`src/EvalRegistry.sol`](src/EvalRegistry.sol) | `EvalRegistry` | Catalogue of reproducible evals: `name/version`, `evaluatorCodeHash`, `threshold` (bp), `trustTier`, `schemaHash`. `id = keccak256(name, version)`, immutable once set. |
| [`src/AttestationRegistry.sol`](src/AttestationRegistry.sol) | `AttestationRegistry` | Onchain graded verdicts. `attest(evalId, version, deliverableHash, inputHash, score, evidenceHash)` → `attId`. Reputation reads off `Attested` events — no extra state. |
| [`src/TalosEscrow.sol`](src/TalosEscrow.sol) | `TalosEscrow` | The **consumer**. Holds USDC per deal; a deal names an `evalId`. `settle(dealId, attId)` reads the attestation, checks `evalId` match, and branches on `score ≥ threshold`. |
| [`src/MockUSDC.sol`](src/MockUSDC.sol) | `MockUSDC` | 6-decimal ERC-20 with EIP-3009 `transferWithAuthorization` (x402 delivery legs). Local runs only; testnet/mainnet use real Circle USDC. |

### `EvalRegistry`

Anchors reproducibility onchain. An eval names its off-chain evaluator by
`evaluatorCodeHash`; a verdict later cites `evalId`, anyone resolves the hash, re-runs the
evaluator on the same input, and must reproduce the score. v1 registers only the
`Reproducible` trust tier — `Attested`/`Judged` are reserved in the enum and rejected at
registration until those tiers ship.

- `register(name, version, evaluatorCodeHash, trustTier, threshold, schemaHash) → id`
- `getEval(id) → Eval` · `exists(id) → bool` · `thresholdOf(id) → uint16`
- Errors: `EvalExists`, `BadThreshold` (`> 10000`), `UnsupportedTier`, `UnknownEval`

### `AttestationRegistry`

The onchain record of graded verdicts. `score` is basis points `0..10000`. `attest` is
permissionless and records `msg.sender` as the evaluator; a consumer trusts an attestation
only for its own named `evalId` and applies the onchain threshold. Evaluator-identity trust
(allowlist/stake) is a future tier.

- `attest(evalId, version, deliverableHash, inputHash, score, evidenceHash) → attId`
- `getAttestation(attId) → Attestation` · `attestationExists(attId) → bool`
- `attId = keccak256(evalId, deliverableHash, inputHash, evaluator, count)` (monotonic `count`)
- Errors: `UnknownEval`, `BadScore` (`> 10000`), `UnknownAttestation`

### `TalosEscrow` (consumer)

The release condition is onchain-checkable: attestation exists **and** `evalId` matches **and**
`score ≥ threshold`. The contract, not the keeper, picks the branch. checks-effects-interactions
+ terminal-status guard ⇒ single settlement.

- `lock(id, seller, amount, deadline, evalId)` — buyer locks USDC; `evalId` must exist. Buyer
  must `approve(escrow, amount)` first.
- `settle(id, attId)` — `onlySettler` (KeeperHub workflow). Pass → release to seller; fail →
  refund buyer. The *outcome* is decided by the contract from the onchain score.
- `refund(id)` — after `deadline`, **permissionless** safety net. The autonomous KeeperHub
  Block-Interval workflow's write.
- `isExpired(id) → bool` — exact predicate the autonomous refund workflow branches on.
- `getDeal(id)` / `setSettler(addr)` (owner only)
- Errors: `DealExists`, `DealNotHeld`, `BadDeadline`, `NotSettler`, `NotSettlerNorExpired`,
  `ZeroAmount`, `NotOwner`, `UnknownEval`, `EvalMismatch`

## Deployed — Base Sepolia (chainId 84532)

| Contract | Address |
|---|---|
| `EvalRegistry` | [`0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47`](https://sepolia.basescan.org/address/0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47) |
| `AttestationRegistry` | [`0x8C672E44452F4e6522Fe47c63c3bD29e818335e8`](https://sepolia.basescan.org/address/0x8C672E44452F4e6522Fe47c63c3bD29e818335e8) |
| `TalosEscrow` | [`0xC6b6Baa7A80ec471e81F0680BC599A3041410719`](https://sepolia.basescan.org/address/0xC6b6Baa7A80ec471e81F0680BC599A3041410719) |
| USDC (Circle) | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

Evals (`reproduction`, `fieldMatch`, `signature`) are already registered onchain on the
`EvalRegistry` above.

## Build · test · deploy

Requires [Foundry](https://getfoundry.sh).

```bash
forge build
forge test          # 40 tests: registries, score-gated settle, graded pass/fail, fuzz, EIP-3009
forge fmt
```

Deploy the stack (`EvalRegistry` + `AttestationRegistry` + `TalosEscrow`; deploys `MockUSDC` if
`USDC_ADDRESS` is unset):

```bash
PRIVATE_KEY=0x… \
SETTLER=0x…            # KeeperHub signer; defaults to deployer
USDC_ADDRESS=0x…      # real USDC; omit for MockUSDC (local)
forge script script/Deploy.s.sol:Deploy --rpc-url <rpc> --broadcast
```

For the full Base Sepolia runbook (faucets, KeeperHub workflow wiring) see
[`../TESTNET.md`](../TESTNET.md). Everything above is orchestrated by [`../run.sh`](../run.sh).

## Layout

```
src/          EvalRegistry · AttestationRegistry · TalosEscrow (consumer) · MockUSDC
test/         40 Foundry tests, one file per contract
script/       Deploy.s.sol — deploys the eval-layer stack
lib/          forge-std, openzeppelin-contracts (submodules)
foundry.toml · remappings.txt
```
