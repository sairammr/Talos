"use client";

import { useMemo, useState, useEffect } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Hex } from "viem";
import { ADDR, CHAIN, TIER_REPRODUCIBLE, evalRegistryAbi } from "@/lib/talos";
import { evalId as computeEvalId, hashText, isBytes32, ZERO32, short } from "@/lib/ids";
import { Panel, Eyebrow, Field, Input, Button, StatusLine, TxLink, Copy } from "./ui";

export function RegisterEval({
  onRegistered,
}: {
  onRegistered: (id: Hex, name: string, thresholdBp: number) => void;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const wrongChain = isConnected && chainId !== CHAIN.id;

  const [name, setName] = useState("");
  const [version, setVersion] = useState(1);
  const [codeMode, setCodeMode] = useState<"text" | "hash">("text");
  const [codeInput, setCodeInput] = useState("");
  const [schemaInput, setSchemaInput] = useState("");
  const [pct, setPct] = useState(95);

  const codeHash: Hex | null = useMemo(() => {
    if (!codeInput.trim()) return null;
    if (codeMode === "hash") return isBytes32(codeInput.trim()) ? (codeInput.trim() as Hex) : null;
    return hashText(codeInput);
  }, [codeInput, codeMode]);

  const schemaHash: Hex = useMemo(
    () => (schemaInput.trim() ? hashText(schemaInput) : ZERO32),
    [schemaInput]
  );

  const thresholdBp = Math.round(Math.min(100, Math.max(0, pct)) * 100);
  const previewId = useMemo(
    () => (name.trim() ? computeEvalId(name.trim(), version) : null),
    [name, version]
  );

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && previewId) onRegistered(previewId, name.trim(), thresholdBp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const codeInvalid = codeInput.trim().length > 0 && codeHash === null;
  const canSubmit =
    isConnected && !wrongChain && name.trim().length > 0 && codeHash !== null && !isPending && !mining;

  function submit() {
    if (!canSubmit || !codeHash) return;
    reset();
    writeContract({
      address: ADDR.evalRegistry as Hex,
      abi: evalRegistryAbi,
      functionName: "register",
      args: [name.trim(), version, codeHash, TIER_REPRODUCIBLE, thresholdBp, schemaHash],
    });
  }

  return (
    <Panel glow>
      <Eyebrow>Step 2 · Register your eval — a real onchain tx</Eyebrow>
      <h3 className="font-head text-xl font-semibold mb-1">Add a reproducible eval</h3>
      <p className="text-sm text-dim mb-5 max-w-prose">
        This writes to <span className="font-mono text-cyan">EvalRegistry.register(...)</span> on Base
        Sepolia. Anyone can add an eval — the verdict is reproducible, so trust is a property of the
        code, not the author.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="unique per version">
          <Input
            placeholder="e.g. jsonSchemaMatch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            mono
          />
        </Field>
        <Field label="Version" hint="uint16">
          <Input
            type="number"
            min={1}
            max={65535}
            value={version}
            onChange={(e) => setVersion(Math.max(1, Number(e.target.value) || 1))}
            mono
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          label="Evaluator code hash"
          hint={
            <button
              type="button"
              onClick={() => setCodeMode((m) => (m === "text" ? "hash" : "text"))}
              className="text-cyan hover:underline"
            >
              {codeMode === "text" ? "hash from text ▾" : "paste bytes32 ▾"}
            </button>
          }
        >
          <Input
            placeholder={
              codeMode === "text"
                ? "paste your evaluator source / spec — we keccak256 it"
                : "0x… (32-byte hash)"
            }
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            mono
          />
        </Field>
        {codeHash && (
          <p className="mt-1.5 font-mono text-[11px] text-faint">
            → {short(codeHash, 10)} <Copy text={codeHash} />
          </p>
        )}
        {codeInvalid && (
          <p className="mt-1.5 text-[11px] text-red">Not a valid 32-byte hex string.</p>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Pass threshold" hint={`${thresholdBp} bp`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full accent-[var(--cyan)]"
            />
            <span className="font-mono text-sm text-cyan w-14 text-right">{pct}%</span>
          </div>
        </Field>
        <Field label="Schema hash" hint="optional">
          <Input
            placeholder="input/delivery schema (text → hash)"
            value={schemaInput}
            onChange={(e) => setSchemaInput(e.target.value)}
            mono
          />
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-bg2/60 px-3.5 py-3">
        <p className="font-mono text-[11px] text-faint">
          evalId = keccak256(abi.encode(name, version))
        </p>
        <p className="mt-1 font-mono text-xs text-text break-all">
          {previewId ? previewId : "— enter a name —"}
          {previewId && <span className="ml-2"><Copy text={previewId} /></span>}
        </p>
        <p className="mt-1 font-mono text-[11px] text-faint">tier: Reproducible (v1)</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={!canSubmit} loading={isPending || mining}>
          {isPending ? "Confirm in wallet…" : mining ? "Mining…" : "Register eval onchain"}
        </Button>
        {!isConnected && <StatusLine kind="info">Connect a wallet first.</StatusLine>}
        {wrongChain && <StatusLine kind="err">Wrong network — switch to Base Sepolia.</StatusLine>}
      </div>

      <div className="mt-3 space-y-2">
        {hash && !isSuccess && (
          <StatusLine kind="wait">
            Submitted — <TxLink hash={hash} /> · waiting for confirmation
          </StatusLine>
        )}
        {isSuccess && hash && (
          <StatusLine kind="ok">
            Eval registered · <TxLink hash={hash} /> — evalId ready below ↓
          </StatusLine>
        )}
        {error && (
          <StatusLine kind="err">
            {error.message.includes("EvalExists")
              ? "That name+version is already registered — bump the version."
              : error.message.split("\n")[0]}
          </StatusLine>
        )}
      </div>
    </Panel>
  );
}
