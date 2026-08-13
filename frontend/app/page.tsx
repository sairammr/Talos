"use client";

import { useState } from "react";
import { type Hex } from "viem";
import { ADDR, addrUrl } from "@/lib/talos";
import { short } from "@/lib/ids";
import { ConnectBar } from "@/components/ConnectBar";
import { RoleTabs, type Role } from "@/components/RoleTabs";
import { BuyerPath } from "@/components/paths/BuyerPath";
import { SellerPath } from "@/components/paths/SellerPath";
import { AuthorPath } from "@/components/paths/AuthorPath";
import { KeeperPath } from "@/components/paths/KeeperPath";

type Active = { id: Hex; name: string; thresholdBp: number } | null;

export default function Home() {
  const [active, setActive] = useState<Active>(null);
  const [role, setRole] = useState<Role>("buyer");

  return (
    <main className="relative z-10 mx-auto w-full max-w-4xl px-5 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <TalosMark />
          <div>
            <p className="font-head text-lg font-semibold leading-none tracking-tight">talos</p>
            <p className="font-mono text-[11px] text-faint">eval layer · onboarding</p>
          </div>
        </div>
        <ConnectBar />
      </header>

      <section className="rise py-9 sm:py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan mb-4">
          Integrate the eval layer
        </p>
        <h1 className="font-head text-4xl font-bold leading-[1.05] sm:text-5xl">
          Add <span className="text-cyan text-glow-cyan">Talos</span> to your agent —
          <br className="hidden sm:block" /> verdicts that settle themselves.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] text-dim">
          Money moves only when work is <b className="text-text">provably correct</b>. Pick your role
          — every path below is live on{" "}
          <a
            href={addrUrl(ADDR.escrow)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text underline decoration-line-strong underline-offset-2 hover:text-cyan"
          >
            Base Sepolia
          </a>
          .
        </p>

        <div className="mt-8">
          <RoleTabs role={role} onChange={setRole} />
        </div>
      </section>

      {active && (
        <div className="rise mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-cyan/40 bg-cyan/5 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-cyan">active eval</span>
          <span className="font-medium">{active.name}</span>
          <span className="font-mono text-xs text-amber">
            ≥ {(active.thresholdBp / 100).toFixed(0)}%
          </span>
          <span className="font-mono text-xs text-faint">{short(active.id, 8)}</span>
        </div>
      )}

      {role === "buyer" && <BuyerPath active={active} setActive={setActive} />}
      {role === "seller" && <SellerPath />}
      {role === "author" && <AuthorPath active={active} setActive={setActive} />}
      {role === "keeper" && <KeeperPath evalId={active?.id ?? null} />}

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[12.5px] text-faint">
        <span>Talos · the eval layer for the agent economy</span>
        <span className="font-mono">github.com/sairammr/Talos · settled through KeeperHub</span>
      </footer>
    </main>
  );
}

function TalosMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 42 42" fill="none" aria-hidden>
      <circle cx="21" cy="21" r="19" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="21" cy="21" r="12" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.45" />
      <circle cx="21" cy="21" r="3.4" fill="var(--cyan)" />
      <path d="M21 2 V9 M21 33 V40 M2 21 H9 M33 21 H40" stroke="var(--cyan)" strokeWidth="1.5" />
    </svg>
  );
}
