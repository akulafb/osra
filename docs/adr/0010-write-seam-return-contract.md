# 0010 The Write Seam's Return Contract

Every Tree Record write returns the rows it wrote, in one shape (`ConfirmedRows`), decoded by
the same functions the read path uses. `addLink` carries one extra bit, because the server can
accept a write and write nothing.

**Issue**: [LIN-64](https://linear.app/linearfb/issue/LIN-64) — Arch 06b, split out of
[LIN-58](https://linear.app/linearfb/issue/LIN-58) as the one part that needs a SQL migration
(`docs/plans/2026-08-26-lin-58-working-record-spec.md`, D1). It blocks LIN-58.

## Context & Problem

ADR-0003 consolidated eight write paths into six operations and specified their parameters, their
routing and their error kinds. It never specified what they *return*. What shipped was
`addPerson → { id?: string }` and five `Promise<void>`, with `Prefer: return=minimal` on three of
the four REST writes. An unfinished contract, not a violated one — but the consequence is that
**nothing optimistic can be confirmed from a response**:

- `addLink` never yielded a Kinship Link id, so an optimistically drawn link could never learn the
  id it needs to be deletable.
- `removePerson` never reported its cascade, so a client holding the graph could not know which
  Kinship Links went with the Person.
- `create_relative_secure` derives the new Person's `paternal_family_cluster` and
  `maternal_family_cluster` from the anchor and the anchor's spouse. The client cannot predict
  either, and was never told.
- `rel_type = 'sibling'` inserts one Kinship Link per parent the anchor has. The client cannot know
  how many, or to whom.
- `already_connected` — the server accepting a write having inserted nothing — was returned by the
  database and dropped on the floor. ADR-0005 recorded it as "read by nothing", which is the third
  outcome LIN-58's D10 depends on.

## Decision

1. **One return shape for all six operations.** `ConfirmedRows` is
   `{ persons?, links?, removedPersonIds?, removedLinkIds? }` in domain vocabulary (`FamilyNode`,
   `FamilyLink`), never row vocabulary. A caller folding a write into its own copy of the record
   does not learn which transport the write took, and the `sibling` fan-out needs no special case.

2. **`addLink` returns `AddLinkResult` — `ConfirmedRows` plus `alreadyConnected`.** Empty `links`
   alone cannot distinguish "already connected, nothing written" from "wrote something and declined
   to say what". Only this operation has the outcome, so only this operation carries the flag.

3. **One decoder for both directions of the seam** (`src/lib/treeRecordRows.ts`). The read path —
   `FamilyDataContext` then, `useWorkingRecord` since LIN-58 — and all six writes decode `nodes`
   and `links` rows through `personFromRow` / `kinshipLinkFromRow`. Two decoders would be two
   answers to "what Person is this row", and under LIN-58 the write path's answer overwrites the
   read path's on every confirmation.

4. **The three RPCs return the rows they wrote; the three REST writes flip to
   `Prefer: return=representation`.** `create_relative_secure` returns `nodes` and `links` arrays,
   `link_existing_relative_secure` returns `links` and keeps `already_connected`, and
   `admin_delete_node_secure` returns `removed_link_ids`.

5. **`create_relative_secure` accepts a caller-supplied Person uuid** (`p_new_node_id`, defaulting
   to `gen_random_uuid()`), so a Spawn can be keyed on the Person before the network answers
   (LIN-58's D11). Because the signature gains a parameter, the five-argument function is dropped
   rather than replaced: PostgREST resolves an RPC by the argument names supplied, and two overloads
   make a call that omits `p_parent_role` ambiguous — the trap
   `20260406140000_drop_legacy_create_relative_secure_4arg.sql` exists to clear.

6. **Ids the caller already supplied are not echoed back through the network.**
   `removePerson` returns `removedPersonIds: [params.id]` and `removeLink` returns
   `removedLinkIds: [params.id]`: each asked the database to remove one named row, and the
   response's job is to say *whether* it happened, never which row it was. The cascade is the one
   part only the database knows, so `removed_link_ids` is the only thing `admin_delete_node_secure`
   reports — and the SQL cascade is never re-implemented in TypeScript.

7. **A write that reports no rows is not a confirmed write.** `editPerson` and `editLink` raise
   `not-authorized` on an empty representation, mirroring the guard `removeLink` already had:
   under `return=minimal` PostgREST answered `204` whether or not a row matched, so an edit RLS
   silently dropped looked like a success. `addPerson` raises `unknown` instead when
   `create_relative_secure` returns a success envelope with no `nodes` row, because there the
   write did land — the server is simply older than this migration — and the Person's two cluster
   fields are derived server-side, so nothing sent can reconstruct the row.

8. **A 2xx body the seam cannot read raises `unknown`, not `network`.** The row is in the database
   and only the confirmation is missing. `network` would tell the caller the write did not happen,
   which is the one thing we know is false, and LIN-58's sequencer reverts a Pending Change on a
   rejection. This applies to the RPC envelopes as well as the REST representations: both go
   through one `unreadable()`.

## How the cascade is reported without re-implementing it

`admin_delete_node_secure` reads the Kinship Link ids **before** the delete and still issues the
single `DELETE FROM public.nodes`. `links.source_node_id` and `links.target_node_id` are
`NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE`, so the ids selected are exactly the rows
the cascade removes, and it is one transaction, so nothing can be inserted in between. Deleting
the links explicitly would have reported the same ids while quietly replacing the cascade with
application code.

## A defect this uncovered: `link_existing_relative_secure` never worked

Making this function's output load-bearing meant running it. It fails — and has failed since the
initial schema — for `rel_type` of `parent`, `child` and `spouse`:

```
{"success": false, "message": "column reference \"target_node_id\" is ambiguous"}
```

`target_node_id` is both a function parameter and a column of `public.links`, and the
duplicate-guard `EXISTS` blocks referenced the column unqualified. plpgsql's default
`variable_conflict = error` raises at runtime, the function's own `EXCEPTION WHEN OTHERS` converts
it into a `success: false` envelope, and the client reports it as a refusal. Only `sibling` worked,
because its queries were already alias-qualified.

So every non-admin "connect an existing relative" has been failing with an obscure message, and
`already_connected` was not merely unread — it was **unreachable**. Fixed here by qualifying the
column references with a table alias: no signature change, no parameter rename, no policy change,
and no dependence on column types.

## Considered and rejected

- **A discriminated union return (`{ kind: 'confirmed', rows } | { kind: 'empty' }`) on all six
  operations.** Rejected: five of the six have no `empty` outcome, so five callers would unwrap a
  union that can only take one branch. The union belongs one layer up, where LIN-58's `write`
  sequencer decides between `confirm` and `drop`.
- **Returning the rows in database vocabulary and letting callers decode.** Rejected: that is the
  decoder duplication decision 3 exists to prevent, and it would put `snake_case` row shapes into
  the interface of the module whose job is to keep them out (ADR-0003: "The module interface speaks
  Kinship Link").
- **Returning `removed_node_ids` from `admin_delete_node_secure`.** Rejected: the client named the
  Person, so the RPC would be echoing its own argument.
- **Reporting server-side corrections separately from the rows.** Rejected for the reason ADR-0008
  records: the server row wins wholesale (LIN-58's D12), so a correction channel would have no
  consumer.
- **Passing `isClaimed` into `personFromRow` so the decoder is the only construction point.**
  Rejected: `isClaimed` is not on a `nodes` row, so a decoder that always emitted the key would
  put `isClaimed: undefined` on every row a *write* returns, and merging such a row over an older
  one erases the claim. The read path stamps the flag onto the Person one line after minting it,
  before it is shared with anything.
- **Fixing `is_within_1_degree` in this migration.** Rejected — see the risk below. It is an
  authorization helper, its fix depends on a column type this change cannot observe, and ADR-0003
  already drew the line at authorization belonging to its own ticket.
- **A fallback for a server that predates the migration** (treating a missing `links` key as
  success). Rejected: it would confirm a Pending Change with no rows, which under LIN-58 removes
  the Person from the canvas as if the write had been rejected. The migration is a deployment
  prerequisite, not a runtime negotiation.

## Verification

The migration history was replayed onto a throwaway Postgres and each RPC exercised directly: a
`child` addition with a caller-supplied uuid returns the Person row and one Kinship Link; the same
uuid twice returns `duplicate key value violates unique constraint "nodes_pkey"` (which the client
maps to `conflict`); a `sibling` addition returns two Kinship Links; omitting the uuid still mints
one; linking an existing relative returns the row and `already_connected: false`, and repeating it
returns `already_connected: true` with `links: []`; deleting a Person with five attached Kinship
Links reports exactly those five ids and leaves unrelated links standing; a missing node still
fails; and the non-admin and 1-degree gates still refuse.

## Consequences

- **LIN-58's D12 becomes implementable.** `confirmPending(state, changeId, rows)` has rows to fold.
- **`isClaimed` is not in a `nodes` row**, so no write can report it. Under LIN-58's "server row
  wins wholesale", confirming an `editPerson` would drop a Person's claim indicator until the next
  full reload. `confirmPending` must carry it across, or the projection must read it from elsewhere.
  This ADR records the hazard rather than pre-solving it in the wrong module.
- **`familyCluster` no longer preserves an empty string.** The read path used
  `paternal_family_cluster ?? undefined` and `maternal_family_cluster || undefined`; the shared
  decoder uses `|| undefined` for both. An empty-string cluster is not a cluster, and two different
  coalescing operators in one function would have been a question with no answer.
- **`create_relative_secure` must be migrated before a client that sends `p_new_node_id` deploys.**
  Omitting the parameter resolves fine against the new six-parameter function, so the current
  client is forward-compatible; sending it against the old five-parameter function is not.
  Nothing sends it yet — LIN-58's callers will.
- **`is_within_1_degree` cannot work against the schema as declared, and this change does not fix
  it.** `20260817140000_lin59...` compares `public.users.id` to
  `COALESCE(auth.jwt() ->> 'sub', auth.uid()::text)` (text), while `is_admin()` compares the same
  column to `auth.uid()` (uuid) and the initial schema declares it `uuid`. Both cannot hold: with a
  `uuid` column every `is_within_1_degree` call raises `operator does not exist: uuid = text`, and
  with a `text` column every `is_admin()` call raises the mirror image. The live definitions may
  have been hand-edited in the Supabase SQL editor — `20260407220000`'s own comment records that
  the dev database stores `created_by_user_id` as `text` while the declared schema says `uuid`.
  Resolving that drift needs the live column types and belongs to its own change; a blind cast here
  would risk breaking the half that currently works.
