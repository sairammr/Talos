"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useSwitchChain, useBalance } from "wagmi";
import { CHAIN } from "@/lib/talos";
import { short } from "@/lib/ids";
import { Button } from "./ui";

export function ConnectBar() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  if (!ready) {
    return (
      <Button disabled loading>
        Loading…
      </Button>
    );
  }

  if (!authenticated) {
    return <Button onClick={() => login()}>Connect wallet</Button>;
  }

  const wrongChain = isConnected && chainId !== CHAIN.id;

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
        <span className="flex items-center gap-2 rounded-[2px] border border-line px-3 py-1.5 font-mono text-xs text-dim">
          <span className="h-2 w-2 rounded-full bg-green pulse-dot" />
          Base Sepolia
        </span>
      )}
      {address && (
        <span className="rounded-[2px] border border-line px-3 py-1.5 font-mono text-xs text-text">
          {short(address)}
          {bal && (
            <span className="text-faint">
              {" "}· {(Number(bal.value) / 10 ** bal.decimals).toFixed(3)} {bal.symbol}
            </span>
          )}
        </span>
      )}
      <button
        onClick={() => logout()}
        className="font-mono text-xs text-faint hover:text-red"
      >
        log out
      </button>
    </div>
  );
}
