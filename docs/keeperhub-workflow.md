# KeeperHub workflow wiring

Talos uses KeeperHub as the **execution surface** (the "last mile" — PRD §2). Two workflows.
The keeper code already talks to both shapes; this doc is the build-time wiring for the
hosted KeeperHub UI.

The MCP server is registered so an agent can discover + call KeeperHub:

```
claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp
```

## Prerequisite (Hour-1 blocker, PRD §13)

Confirm in KeeperHub docs/Discord: **a workflow Web3 Action can call an arbitrary contract
method (`release(bytes32)`, `refund(bytes32)`) on the target chain**, and note the **signer
address** the Web3 Action uses. Set that address as the escrow's `settler`:

```
# after deploy, if the KeeperHub signer differs from the deploy-time settler:
cast send $ESCROW "setSettler(address)" $KEEPERHUB_SIGNER --private-key $DEPLOYER_KEY --rpc-url $RPC_URL
```

Until confirmed, the keeper runs the **settler-fallback** path (settler wallet submits the
tx directly, still audited). Flip to the workflow path by setting `KEEPERHUB_WEBHOOK_URL`.

## Workflow 1 — Release/Refund on verdict (webhook trigger)

The keeper posts `{dealId, verdict, action}` when the critic returns a verdict. KeeperHub
branches and actuates. The release verdict is *carried in* (reproducibility is computed
off-chain); KeeperHub **actuates a proven verdict** — it does not invent it.

```
Trigger:   Webhook            body: { dealId, verdict, action }
Condition: verdict == "approved"   → branch A
           verdict == "rejected"   → branch B
Action A:  Web3 write  TalosEscrow.release(dealId)   [smart gas · backoff · private routing]
Action B:  Web3 write  TalosEscrow.refund(dealId)
Audit:     trigger → simulation → tx hash → gas → outcome → timestamp   (automatic)
```

Set `KEEPERHUB_WEBHOOK_URL` (+ `KEEPERHUB_API_KEY`) in `keeper/.env`. The keeper expects the
webhook response to return `{ txHash, gasUsed }` for the audit row.

## Workflow 2 — Autonomous deadline refund (block-interval trigger)

**This branch is decided entirely inside KeeperHub from onchain state, with zero keeper
input** — the honest centerpiece of "KeeperHub acts" (PRD §3a). No webhook, no verdict.

```
Trigger:   Block Interval     (every N blocks)
Read:      Web3 read   TalosEscrow.isExpired(dealId)   → bool
Condition: isExpired == true
Action:    Web3 write  TalosEscrow.refund(dealId)      [permissionless after deadline]
Audit:     trigger → read → tx hash → gas → outcome → timestamp
```

`isExpired(dealId)` returns `status == Held && now > deadline` — the exact predicate, exposed
on the contract precisely so the workflow can branch on it with a single Web3 read. Because
`refund()` is permissionless after the deadline, this workflow needs no special privileges —
custody is never hostage to the keeper being alive.

## Reliability surfaces touched (PRD §3, §7)

- **MCP server** — agent discovers/calls KeeperHub
- **Workflow builder** — the two Trigger→Condition→Action graphs above
- **x402 / MPP** — agent↔agent paid delivery (`keeper/src/adapters/x402Delivery.ts`)
- **Audit trail** — every settlement logged (mirrored in `keeper/.audit.jsonl`)
- **Smart gas + exponential backoff** — the settlement tx (fallback mirrors it with retry/backoff)
- **Private routing (MEV protection)** — settlement tx submission
