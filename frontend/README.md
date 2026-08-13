# Talos Onboard — frontend

Wallet-connected onboarding for **integrating Talos**, organised by role. Pick who you are; each
path shows the concept, live onchain actions, and copy-paste code with your `evalId` substituted
in. Everything is live on Base Sepolia (84532).

**Connect** — injected (MetaMask), Coinbase Wallet, and WalletConnect (optional). Auto-prompts a
switch to Base Sepolia.

**The four paths**

1. **Buyer agent** — pay only for correct work. Pick the eval that gates release, then live:
   approve USDC → `TalosEscrow.lock(...)`. Plus the `approve`/`lock` snippet.
2. **Seller agent** — deliver, get paid on pass. Deliver over x402 (nothing onchain changes); live
   `getDeal` status reader to watch a deal settle.
3. **Eval author** — define correctness. Real `EvalRegistry.register(...)` tx → returns `evalId`;
   or pick one of the three registered evals. Plus the reproducible `Evaluator` snippet.
4. **Keeper** — grade → attest → settle. `AttestationRegistry.attest(...)` + the deployed
   `talos-settle` KeeperHub webhook. The contract decides release vs refund from the onchain score.

Design matches the launch video: near-black canvas, electric cyan, amber, Space Grotesk +
JetBrains Mono.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Requirements to exercise the live txs: a wallet on **Base Sepolia**, a little test ETH (gas), and
test **USDC** for the lock step (faucet: faucet.circle.com).

## WalletConnect (optional)

Injected + Coinbase work out of the box. To enable the WalletConnect QR option, add a projectId
(free from https://cloud.reown.com):

```bash
# frontend/.env.local
NEXT_PUBLIC_WC_PROJECT_ID=your_project_id
```

Without it, the WalletConnect connector is simply not registered.

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| EvalRegistry | `0xDD8076334e66d5041DFe3Ab9C14Ee2E1ED4dfb47` |
| TalosEscrow (consumer) | `0xC6b6Baa7A80ec471e81F0680BC599A3041410719` |
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Stack: Next.js 16 (App Router) · wagmi + viem · TanStack Query · Tailwind v4.

## Layout

```
app/                layout · providers (wagmi/query) · page (role switcher)
components/          ConnectBar · RoleTabs · RegisterEval · EvalPicker · TestDeal · DealStatus · ui atoms
components/paths/    BuyerPath · SellerPath · AuthorPath · KeeperPath
lib/                 talos.ts (addresses + ABIs) · ids.ts (evalId/hash helpers) · wagmi.ts (config)
```
