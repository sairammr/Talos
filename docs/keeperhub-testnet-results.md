# Talos on Base Sepolia — live KeeperHub actuation results

Real chain (Base Sepolia, 84532) · real Circle USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) ·
settlement fired **through real KeeperHub workflows** (gas sponsored by KeeperHub).

## Deployment

| Thing | Value |
|---|---|
| TalosEscrow | `0x77814575AC3dAAE41972AF6d11e534b41DEf08Bb` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Circle, Base Sepolia) |
| Escrow settler | `0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4` (KeeperHub Turnkey signer) |

## Workflows (built via KeeperHub MCP)

- **talos-settle** `9z8xaukywmqwsyfb0kzqo` — Webhook `{dealId,verdict,action}` → Condition on `action`
  → `release(bytes32)` (true) / `refund(bytes32)` (false). **Enabled.**
  Webhook URL: `https://app.keeperhub.com/api/workflows/9z8xaukywmqwsyfb0kzqo/webhook`
  (auth: `Authorization: Bearer wfb_…` user webhook key).
- **talos-refund-deadline** `e6g38hlw0ykql3u6leont` — Block-interval trigger → `read isExpired(dealId)`
  → Condition `== true` → `refund(bytes32)`. Genuinely autonomous (no keeper input). Enabled for the
  run, disabled afterward.

## Settlements (every tx verified on-chain, `receiptStatus: success`, `sponsored: true`)

| Deal | Verdict | Action | Via | Tx |
|---|---|---|---|---|
| happy-1 | approved | release | webhook workflow | `0x13ac6de06a85e05888441f03c518bda16fa956c2ee3bbd35f4da73b66c7c1780` |
| happy-2 | approved | release | webhook workflow | `0x8683f5a7438e7d06713d355804728c54a38341f52867c0eb5c5379b4c728165a` |
| happy-3 | approved | release | webhook workflow | `0xe15cc81887cc2fd7719ff2225c927592bd10d52687a062092c35dbd089ac3a40` |
| fraud-9 | rejected | refund  | webhook workflow | `0x0389b37ccc0d0cd7007916db828f4ba53c8319d9238395c7aeaf68ade1b73ca9` |
| autonomous-1 | expired | refund | **block-interval autonomous** | `0x18c6fb24420a64b7d2c26012dcfbce716336faa64c771ad5fc8c8a650930cbb1` |

The autonomous refund's execution: `triggerSource: block`, `triggeredByUserApiKeyId: null` — decided
entirely from on-chain `isExpired(dealId)`, no keeper. (One release, happy-3, reverted on the first
webhook due to a nonce race with the batch and succeeded on immediate retry.)

## Balances (reconcile exactly)

```
seller Δ +3.40 USDC   (3 releases = 3.00 + 4 x402 delivery fees = 0.40)
buyer  Δ -3.40 USDC   (5 locked; 3 released, 2 refunded; minus 0.40 x402 fees)
```

Verify: https://sepolia.basescan.org/address/0x77814575AC3dAAE41972AF6d11e534b41DEf08Bb
