"use client";

export type Role = "buyer" | "seller" | "author" | "keeper";

export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "buyer", label: "Buyer agent", blurb: "Pay only for provably-correct work" },
  { id: "seller", label: "Seller agent", blurb: "Deliver, get paid on pass" },
  { id: "author", label: "Eval author", blurb: "Define what correct means" },
  { id: "keeper", label: "Keeper", blurb: "Grade → attest → settle" },
];

export function RoleTabs({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {ROLES.map((r, i) => {
        const active = r.id === role;
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`rounded-xl border px-3.5 py-3 text-left transition ${
              active
                ? "border-cyan bg-cyan/10 glow-cyan"
                : "border-line bg-panel/40 hover:border-cyan/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-cyan">{String(i + 1).padStart(2, "0")}</span>
              <span className={`text-sm font-medium ${active ? "text-cyan" : "text-text"}`}>
                {r.label}
              </span>
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-dim">{r.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}
