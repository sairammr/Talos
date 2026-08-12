# Talos eval layer on Base Sepolia — live KeeperHub results

Real chain (Base Sepolia, 84532) · real Circle USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) ·
settlement fired **through a real KeeperHub workflow** calling `settle(dealId, attId)` (gas
sponsored by KeeperHub). The contract — not the keeper — decides release vs refund from the
onchain attested score.

## Deployment (eval-layer stack)

| Contract | Address |
|---|---|
| EvalRegistry | `0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47` |
| AttestationRegistry | `0x8C672E44452F4e6522Fe47c63c3bD29e818335e8` |
| TalosEscrow (consumer) | `0xC6b6Baa7A80ec471e81F0680BC599A3041410719` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Circle) |
| Escrow settler | `0x7d08B1E51C9172dDd55A277e86d54a3Cd9733BF4` (KeeperHub Turnkey signer) |

## Workflows (built via KeeperHub MCP)

- **talos-settle** `9z8xaukywmqwsyfb0kzqo` — Webhook `{dealId, attId}` → Web3 write
  `settle(bytes32 dealId, bytes32 attId)`. The escrow reads the attestation and releases iff
  `score ≥ threshold`, else refunds. **Enabled.** Auth: `Authorization: Bearer wfb_…`.
- **talos-refund-deadline** `e6g38hlw0ykql3u6leont` — Block-interval → `read isExpired` →
  Condition → `refund`. Autonomous (no keeper input). (Demo's expiry leg used the keeper's
  permissionless-refund fallback; the standalone autonomous workflow was proven in an earlier run.)

## Settlements (every tx verified onchain, `receiptStatus: success`, `sponsored: true`)

The keeper graded each delivery, posted the score to AttestationRegistry, then KeeperHub actuated
`settle(dealId, attId)`:

| Deal | Eval | Score | Contract decided | settle tx (via KeeperHub) |
|---|---|---|---|---|
| repro-ok | reproduction | 10000 | release | `0xb968c330be47594132b73adcabc861304c5365bd8eaa99e4330bc7661c3c1cb6` |
| field-pass | fieldMatch | 9700 ≥ 9500 | release (graded pass) | `0x95f01ea4c44c5340c5f2d9645585462962923ba8536ea81203f3daf43d18141f` |
| field-fail | fieldMatch | 9000 < 9500 | refund (graded fail) | `0xd1d526d07cab7416c5c93e6c40548c3d0d5780f21027dbaf8b139bbe32f8ba5a` |
| repro-fraud | reproduction | 0 | refund (fraud) | `0xc9e288fcb73205d88a1de3839a19d3e30330a5178e1974a76e89a7677060b20d` |
| expire | reproduction | — | autonomous deadline refund | `0x87c31a872c…` (keeper permissionless refund) |

The graded-fail row (9000 < 9500 → refund) is the eval-layer money shot: a 90%-correct delivery
is refunded, decided entirely from the onchain score vs the onchain threshold.

## Balances (reconcile)

```
seller Δ +2.40 USDC   (2 releases = 2.00 + 5 x402 delivery fees = 0.40)   [1-USDC testnet deals]
buyer  Δ -2.40 USDC
Reputation (onchain Attested events): mean score 71.8% · 4/8 passed
```

Verify: https://sepolia.basescan.org/address/0xC6b6Baa7A80ec471e81F0680BC599A3041410719
