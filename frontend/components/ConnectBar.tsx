"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
  useBalance,
} from "wagmi";
import { CHAIN } from "@/lib/talos";
import { short } from "@/lib/ids";
import { Button } from "./ui";

export function ConnectBar() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { enabled: isConnected } });
  const [open, setOpen] = useState(false);

  const wrongChain = isConnected && chainId !== CHAIN.id;

  if (!isConnected) {
    return (
      <div className="relative">
        <Button onClick={() => setOpen((o) => !o)} loading={isPending}>
          Connect wallet
        </Button>
        {open && (
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-line-strong bg-panel p-1.5 backdrop-blur-md shadow-xl">
            {connectors.map((c) => (
              <button
                key={c.uid}
                onClick={() => {
                  connect({ connector: c });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-text hover:bg-cyan/10 hover:text-cyan"
              >
                {c.name}
              </button>
            ))}
            {error && (
              <p className="px-3 py-1.5 text-[11px] text-red">{error.message}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {wrongChain ? (
        <Button
          variant="danger"
          loading={switching}
          onClick={() => switchChain({ chainId: CHAIN.id })}
        >
          Switch to Base Sepolia
        </Button>
      ) : (
        <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-dim">
          <span className="h-2 w-2 rounded-full bg-green pulse-dot" />
          Base Sepolia
        </span>
      )}
      <span className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-text">
        {short(address!)}
        {bal && (
          <span className="text-faint">
            {" "}· {(Number(bal.value) / 10 ** bal.decimals).toFixed(3)} {bal.symbol}
          </span>
        )}
      </span>
      <button
        onClick={() => disconnect()}
        className="font-mono text-xs text-faint hover:text-red"
      >
        disconnect
      </button>
    </div>
  );
}
