"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { type Hex } from "viem";
import { ADDR, escrowAbi } from "@/lib/talos";
import { isBytes32, short } from "@/lib/ids";
import { Field, Input, Button, StatusLine } from "./ui";

const STATUS = ["None", "Held", "Released", "Refunded"] as const;
const STATUS_KIND = ["info", "wait", "ok", "err"] as const;

export function DealStatus() {
  const [idInput, setIdInput] = useState("");
  const [query, setQuery] = useState<Hex | null>(null);

  const valid = isBytes32(idInput.trim());
  const { data, isLoading, isError, refetch } = useReadContract({
    address: ADDR.escrow as Hex,
    abi: escrowAbi,
    functionName: "getDeal",
    args: query ? [query] : undefined,
    query: { enabled: Boolean(query) },
  });

  const status = data ? Number(data[5]) : null;

  return (
    <div className="rounded-xl border border-line bg-bg2/60 p-4">
      <Field label="Check a deal's onchain status" hint="dealId (bytes32)">
        <div className="flex gap-2">
          <Input
            placeholder="0x… deal id"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            mono
          />
          <Button
            variant="ghost"
            disabled={!valid}
            onClick={() => {
              setQuery(idInput.trim() as Hex);
              if (query === (idInput.trim() as Hex)) refetch();
            }}
          >
            Read
          </Button>
        </div>
      </Field>

      <div className="mt-3">
        {isLoading && <StatusLine kind="wait">Reading chain…</StatusLine>}
        {isError && <StatusLine kind="err">Read failed — check the id / network.</StatusLine>}
        {data && status !== null && (
          <div className="space-y-1.5">
            <StatusLine kind={STATUS_KIND[status]}>
              status: <b>{STATUS[status]}</b>
              {status === 2 && " — released to seller"}
              {status === 3 && " — refunded to buyer"}
              {status === 1 && " — held, awaiting settlement"}
              {status === 0 && " — no such deal"}
            </StatusLine>
            {status !== 0 && (
              <p className="font-mono text-[11px] text-faint">
                seller {short(data[1] as string, 5)} · amount{" "}
                {(Number(data[2]) / 1e6).toFixed(2)} USDC · eval {short(data[4] as string, 5)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
