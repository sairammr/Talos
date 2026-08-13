"use client";

import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { txUrl, addrUrl } from "@/lib/talos";
import { short } from "@/lib/ids";

export function Panel({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-line bg-panel/70 backdrop-blur-sm p-5 sm:p-6 ${
        glow ? "glow-cyan" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-faint mb-3">
      {children}
    </p>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  ...rest
}: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-45 disabled:cursor-not-allowed";
  const styles = {
    primary:
      "bg-cyan text-[#04181d] hover:brightness-110 shadow-[0_0_24px_-6px_rgba(53,224,255,0.6)]",
    ghost:
      "border border-line-strong text-text hover:border-cyan hover:text-cyan bg-transparent",
    danger: "bg-red text-[#210606] hover:brightness-110",
  }[variant];
  return (
    <button
      className={`${base} ${styles} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-dim">{label}</span>
        {hint && <span className="font-mono text-[11px] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
) {
  const { mono, className = "", ...rest } = props;
  return (
    <input
      className={`w-full rounded-xl border border-line bg-bg2/80 px-3.5 py-2.5 text-sm text-text placeholder:text-faint outline-none transition focus:border-cyan focus:ring-1 focus:ring-cyan/40 ${
        mono ? "font-mono" : ""
      } ${className}`}
      {...rest}
    />
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-cyan hover:underline underline-offset-2"
    >
      {label ?? short(hash)} ↗
    </a>
  );
}

export function AddrLink({ addr, label }: { addr: string; label?: string }) {
  return (
    <a
      href={addrUrl(addr)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-dim hover:text-cyan"
    >
      {label ?? short(addr)} ↗
    </a>
  );
}

export function Copy({ text, label = "copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
      className="font-mono text-[11px] text-faint hover:text-cyan transition"
      type="button"
    >
      {done ? "✓ copied" : label}
    </button>
  );
}

export function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg2/80 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <span className="font-mono text-[11px] text-faint">{filename ?? "snippet"}</span>
        <Copy text={code} />
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed font-mono text-text/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function StatusLine({
  kind,
  children,
}: {
  kind: "info" | "ok" | "err" | "wait";
  children: ReactNode;
}) {
  const c = {
    info: "text-dim",
    ok: "text-green",
    err: "text-red",
    wait: "text-cyan",
  }[kind];
  const dot = {
    info: "bg-dim",
    ok: "bg-green",
    err: "bg-red",
    wait: "bg-cyan pulse-dot",
  }[kind];
  return (
    <div className={`flex items-start gap-2 text-sm ${c}`}>
      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${dot}`} />
      <span className="break-words">{children}</span>
    </div>
  );
}
