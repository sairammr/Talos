"use client";

import { type Hex } from "viem";
import { KNOWN_EVALS } from "@/lib/talos";
import { evalId as computeEvalId, short } from "@/lib/ids";
import { Eyebrow } from "./ui";

export function EvalPicker({
  activeId,
  onPick,
}: {
  activeId: Hex | null;
  onPick: (id: Hex, name: string, thresholdBp: number) => void;
}) {
  return (
    <div>
      <Eyebrow>…or use one already registered onchain</Eyebrow>
      <div className="flex flex-wrap gap-2.5">
        {KNOWN_EVALS.map((e) => {
          const id = computeEvalId(e.name, e.version);
          const active = activeId?.toLowerCase() === id.toLowerCase();
          return (
            <button
              key={e.name}
              onClick={() => onPick(id, e.name, e.threshold)}
              className={`group flex items-baseline gap-2.5 rounded-full border px-3.5 py-2 text-left transition ${
                active
                  ? "border-cyan bg-cyan/10 text-cyan"
                  : "border-line bg-panel/40 text-text hover:border-cyan/60"
              }`}
              title={id}
            >
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-[11px] text-amber">
                ≥ {(e.threshold / 100).toFixed(0)}%
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                {e.kind}
              </span>
              <span className="font-mono text-[10px] text-faint">{short(id, 4)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
