#!/usr/bin/env bash
# One-command Talos demo. Spins a local anvil chain, deploys TalosEscrow + MockUSDC,
# wires the keeper, and runs the full escrow lifecycle end-to-end (all real txs).
#
#   ./run.sh              → local anvil (zero credentials)
#   RPC_URL=... ./run.sh  → any EVM RPC (e.g. Base Sepolia; also set keys — see .env.example)
set -euo pipefail
cd "$(dirname "$0")"

# `./run.sh --testnet` sources keeper/.env.testnet (Base Sepolia, real USDC).
if [ "${1:-}" = "--testnet" ]; then
  echo "▶ loading keeper/.env.testnet (Base Sepolia)…"
  set -a; . keeper/.env.testnet; set +a
fi

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${CHAIN_ID:-31337}"
DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
# anvil acct #3 — the address of keeper's default SETTLER_KEY (0x7c85…07a6). Must match.
SETTLER_ADDR="${SETTLER_ADDR:-0x90F79bf6EB2c4f870365E785982E1f101E93b906}"

ANVIL_PID=""
cleanup() { [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT

# 1. Local chain (only when using the default local RPC).
if [ "$RPC_URL" = "http://127.0.0.1:8545" ]; then
  echo "▶ starting local anvil…"
  anvil --silent &
  ANVIL_PID=$!
  sleep 1.5
fi

# 2. Deploy contracts.
echo "▶ deploying TalosEscrow + MockUSDC…"
pushd contracts >/dev/null
DEPLOY_OUT=$(PRIVATE_KEY="$DEPLOYER_KEY" SETTLER="$SETTLER_ADDR" ${USDC_ADDRESS:+USDC_ADDRESS=$USDC_ADDRESS} \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast 2>&1)
echo "$DEPLOY_OUT" | grep -E "TalosEscrow:|USDC:|Settler:" || true
ESCROW=$(echo "$DEPLOY_OUT" | grep "TalosEscrow:" | awk '{print $NF}')
USDC=$(echo "$DEPLOY_OUT" | grep -E "^\s*USDC:" | awk '{print $NF}')
popd >/dev/null

if [ -z "$ESCROW" ] || [ -z "$USDC" ]; then
  echo "✗ deploy failed to yield addresses"; echo "$DEPLOY_OUT"; exit 1
fi

# 3. Record deployment for the keeper.
cat > keeper/.deploy.json <<EOF
{ "escrow": "$ESCROW", "usdc": "$USDC", "chainId": $CHAIN_ID }
EOF
echo "▶ deployment: escrow=$ESCROW usdc=$USDC"

# 3b. If a KeeperHub Turnkey signer is set, make it the escrow settler so the
#     workflow's Web3 Action can move held funds (real KeeperHub actuation path).
if [ -n "${KEEPERHUB_SIGNER:-}" ]; then
  echo "▶ setting escrow.settler = KeeperHub signer $KEEPERHUB_SIGNER"
  cast send "$ESCROW" "setSettler(address)" "$KEEPERHUB_SIGNER" \
    --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" >/dev/null && echo "  ✓ settler set"
fi

# 4. Run the keeper demo.
echo "▶ running keeper demo…"
cd keeper
RPC_URL="$RPC_URL" CHAIN_ID="$CHAIN_ID" ESCROW_ADDRESS="$ESCROW" USDC_ADDRESS="$USDC" \
  npx tsx src/demo.ts

echo "▶ audit view:"
RPC_URL="$RPC_URL" CHAIN_ID="$CHAIN_ID" ESCROW_ADDRESS="$ESCROW" USDC_ADDRESS="$USDC" \
  npx tsx src/cli.ts audit
