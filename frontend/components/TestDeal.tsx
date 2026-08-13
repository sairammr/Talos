"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, type Hex } from "viem";
import { ADDR, CHAIN, escrowAbi, erc20Abi } from "@/lib/talos";
import { randomDealId, short } from "@/lib/ids";
import { Panel, Eyebrow, Field, Input, Button, StatusLine, TxLink } from "./ui";

const DEFAULT_SELLER = "0x60E34Ea8741e183B62Ab7C84d77F7Dc72a1b8f22"; // demo seller (HANDOFF)

export function TestDeal({ evalId, evalName }: { evalId: Hex | null; evalName: string | null }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const wrongChain = isConnected && chainId !== CHAIN.id;

  const [amountStr, setAmountStr] = useState("0.01");
  const [seller, setSeller] = useState(DEFAULT_SELLER);
  const [dealId, setDealId] = useState<Hex | null>(null);

  const amount = useMemo(() => {
    try {
      return parseUnits(amountStr || "0", 6); // Circle USDC = 6 decimals
    } catch {
      return BigInt(0);
    }
  }, [amountStr]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ADDR.usdc as Hex,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, ADDR.escrow as Hex] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { data: balance } = useReadContract({
    address: ADDR.usdc as Hex,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const needsApproval = (allowance ?? BigInt(0)) < amount;
  const lowBalance = (balance ?? BigInt(0)) < amount;

  // approve
  const approveW = useWriteContract();
  const approveWait = useWaitForTransactionReceipt({ hash: approveW.data });
  useEffect(() => {
    if (approveWait.isSuccess) void refetchAllowance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveWait.isSuccess]);

  // lock
  const lockW = useWriteContract();
  const lockWait = useWaitForTransactionReceipt({ hash: lockW.data });

  const ready = isConnected && !wrongChain && evalId && amount > BigInt(0) && /^0x[0-9a-fA-F]{40}$/.test(seller);

  function approve() {
    approveW.writeContract({
      address: ADDR.usdc as Hex,
      abi: erc20Abi,
      functionName: "approve",
      args: [ADDR.escrow as Hex, amount],
    });
  }

  function lock() {
    if (!evalId) return;
    const id = randomDealId();
    setDealId(id);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // +1h
    lockW.writeContract({
      address: ADDR.escrow as Hex,
      abi: escrowAbi,
      functionName: "lock",
      args: [id, seller as Hex, amount, deadline, evalId],
    });
  }

  return (
    <Panel>
      <Eyebrow>Step 3b · Optional — lock a live test deal</Eyebrow>
      <h3 className="font-head text-xl font-semibold mb-1">Escrow a real deal against your eval</h3>
      <p className="text-sm text-dim mb-5 max-w-prose">
        Approve USDC, then <span className="font-mono text-cyan">TalosEscrow.lock(...)</span> naming{" "}
        {evalName ? (
          <span className="font-mono text-amber">{evalName}</span>
        ) : (
          "your evalId"
        )}
        . The deal is now settleable by KeeperHub — release iff the attested score ≥ threshold.
      </p>

      {!evalId && (
        <StatusLine kind="info">Pick or register an eval above to enable this.</StatusLine>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" hint="USDC (Circle testnet)">
          <Input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            mono
            inputMode="decimal"
          />
        </Field>
        <Field label="Seller" hint="who gets paid on pass">
          <Input value={seller} onChange={(e) => setSeller(e.target.value)} mono />
        </Field>
      </div>

      {isConnected && (
        <p className="mt-2 font-mono text-[11px] text-faint">
          balance: {balance !== undefined ? (Number(balance) / 1e6).toFixed(3) : "…"} USDC · allowance:{" "}
          {allowance !== undefined ? (Number(allowance) / 1e6).toFixed(3) : "…"} USDC
        </p>
      )}
      {lowBalance && isConnected && (
        <StatusLine kind="err">
          Not enough test USDC — faucet at faucet.circle.com (Base Sepolia).
        </StatusLine>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {needsApproval ? (
          <Button
            onClick={approve}
            disabled={!ready || approveW.isPending || approveWait.isLoading}
            loading={approveW.isPending || approveWait.isLoading}
          >
            {approveW.isPending ? "Confirm approve…" : approveWait.isLoading ? "Approving…" : "1 · Approve USDC"}
          </Button>
        ) : (
          <span className="font-mono text-xs text-green">✓ approved</span>
        )}
        <Button
          variant={needsApproval ? "ghost" : "primary"}
          onClick={lock}
          disabled={!ready || needsApproval || lockW.isPending || lockWait.isLoading}
          loading={lockW.isPending || lockWait.isLoading}
        >
          {lockW.isPending ? "Confirm lock…" : lockWait.isLoading ? "Locking…" : "2 · Lock deal"}
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {approveW.data && !approveWait.isSuccess && (
          <StatusLine kind="wait">
            Approve sent — <TxLink hash={approveW.data} />
          </StatusLine>
        )}
        {lockW.data && !lockWait.isSuccess && (
          <StatusLine kind="wait">
            Lock sent — <TxLink hash={lockW.data} /> · mining
          </StatusLine>
        )}
        {lockWait.isSuccess && lockW.data && (
          <StatusLine kind="ok">
            Deal locked{dealId ? ` · id ${short(dealId, 6)}` : ""} — <TxLink hash={lockW.data} />. Held
            onchain, awaiting settlement.
          </StatusLine>
        )}
        {(approveW.error || lockW.error) && (
          <StatusLine kind="err">
            {(lockW.error ?? approveW.error)!.message.split("\n")[0]}
          </StatusLine>
        )}
      </div>
    </Panel>
  );
}
