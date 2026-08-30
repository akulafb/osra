# Schema Notes

Reference for developers working with the Osra database schema. The migration in `migrations/20260101_initial_schema.sql` applies the final state directly—no incremental fixes or backfills.

## Key Design Decisions

### RLS: `(select auth.uid())` in policies

Policies use `(select auth.uid())` instead of `auth.uid()` directly. This avoids Supabase lint 0003 (RLS initplan): the subquery ensures `auth.uid()` is evaluated once per query rather than per row, which can cause performance issues and incorrect behavior.

### SECURITY DEFINER functions: `SET search_path = public`

All SECURITY DEFINER functions include `SET search_path = public` to prevent search path injection (Supabase lint 0011). Without this, a malicious user could create objects in a schema they control and have the function run in that context.

### 1-degree permission model

Users can view and edit only their **1-degree network**:

- **Self**: Their bound node
- **Parents**: Direct parent links
- **Children**: Direct child links
- **Siblings**: Nodes sharing at least one parent
- **Spouse**: Marriage/divorce link connections
- **Parent's spouse**: e.g. step-parent
- **Child's other parent**: Co-parent
- **Spouse's children**: Step-children

`is_within_1_degree` implements this logic.

**Why the last three cases exist.** They are not symmetry for its own sake — they were added to
fix a reported bug (2026-03-12). A mother could not invite her own children, while the father
could. The children were linked to the father by `parent` links and to the mother by nothing:
she reached the family through a `marriage` link to him. A perimeter built only from direct
links therefore excluded her children from her own 1-degree network. **Spouse's children** closes
that; **Parent's spouse** and **Child's other parent** close the same gap from the other two
directions. Any change that narrows the perimeter back to direct links reopens the bug.

The TypeScript equivalent is `get1DegreeRelatives` in `src/lib/familyGraph.ts`, which classifies
these three as blended relatives (ADR-0006). The two must agree: the client derives edit
affordances from it and the server derives authorization from `is_within_1_degree`, so a
divergence shows up as the client offering writes the server refuses.

### Audit log

`audit_log` has RLS disabled (empty table, no policies). Re-enable and add policies if you implement audit logging. Migration `20260514120000_data_api_public_table_grants.sql` revokes `anon`/`authenticated` on this table (to drop legacy defaults) and grants DML only to `service_role` for PostgREST. Do not extend `anon`/`authenticated` here without enabling RLS and policies first.

### Data API: grants on `public` tables

Supabase applies **Postgres `GRANT`s** plus **RLS policies** together: the JWT role must hold the privilege **and** any policy must allow the row. New projects no longer infer table grants automatically; migrations must declare them—see migration `20260514120000_data_api_public_table_grants.sql`.

**Convention for new tables**

1. `CREATE TABLE` in `public`.
2. Enable RLS and add policies (`TO authenticated`, `TO public`, etc.) as usual.
3. In the **same migration** (or immediately after table creation): `GRANT` the appropriate verbs on that table to `anon`, `authenticated`, and/or `service_role` for how you intend PostgREST / `supabase-js` to use it. Omit `anon`/`authenticated` when RLS is off or when only the service role should access the table.
4. Add `USAGE, SELECT ON SEQUENCES` for that table only if it uses `serial`, identity, or other sequences.

If a grant is missing, PostgREST returns `42501` with a suggested `GRANT` in the error detail.

## Migration history: repaired 2026-08-30

Every migration in this directory was applied to both hosted projects by hand
through the dashboard SQL editor, which stamps its own version number. The
remote `supabase_migrations.schema_migrations` table therefore recorded the same
work under numbers that matched no local filename: 25 such rows on dev, 7 on
production. `supabase db push` read that as "almost nothing here is applied" and
would have replayed the 22KB initial schema over a live database.

The history was rebuilt from the live schema rather than from migration names,
because names lie in both directions. Production carried
`is_within_1_degree(uuid)` while missing the migration that rewrote it, and its
`lin59` row was absent although several of its siblings were present. Each local
file was instead reduced to catalogue predicates — a trigger's attachment, a
policy name, a `proconfig` entry, a constraint's `confdeltype` — and only
versions whose predicates held were recorded as applied. The pre-repair rows are
archived in `reference/migration-history-before-repair-2026-08-30.json`.

Both projects now record the same eleven versions as the files on disk, so
`supabase migration list --linked` matches row for row and `db push` is a no-op
against either.

Two traps are worth knowing before writing such a predicate again:

- **`pg_get_function_identity_arguments` includes parameter names** on this
  server, returning `p_node_id uuid` rather than `uuid`. Comparing it to a bare
  type list silently reports every function as missing.
- **A later migration erases the evidence of an earlier one.** `20260826120000`
  does `CREATE OR REPLACE` on `link_existing_relative_secure`, so nothing in
  that body can attest to `20260817140000`. Prefer discriminators no later file
  touches: triggers, policy names, and grants.

### Production was behind by two migrations — closed 2026-08-30

`20260407220000` (`lin33_admin_node_insert_users_fk`) and `20260817140000`
(`lin59_server_side_admin_write_gates`) were genuinely unapplied to production,
which had been running without the server-side write gates. Both are applied
now, and every effect was verified individually:

| Effect | Before | After |
| --- | --- | --- |
| `users_node_id_fkey` on `public.users` | absent | present, `ON DELETE SET NULL` |
| `nodes` INSERT policy | `nodes_insert_by_bound_users` | `nodes_insert_admin_only` |
| `trg_guard_node_cluster_updates` on `public.nodes` | absent | present |
| `divorce` excluded from the `links` write policies | no | yes |
| `is_within_1_degree` resolves `auth.jwt() ->> 'sub'` | no | yes |

Row counts were unchanged across the whole operation: 77 nodes, 82 links, 9
users. Gates were then proved behaviourally under a real non-admin JWT, inside
`BEGIN`/`ROLLBACK`: a name edit on the caller's own node succeeds, a cluster edit
raises `Only administrators can update paternal_family_cluster`, a direct
`INSERT` into `public.nodes` is refused by RLS, and `create_relative_secure`
still returns the full `{success, new_node_id, nodes, links, message}` envelope.

Applying these needed no application change: the client already gated direct
`POST /nodes` and `POST /links` behind `identity.isAdmin`, and already refused
non-admin divorce, so the migrations only moved that enforcement server-side.

**`db push` alone would have broken production.** `20260817140000` is timestamped
before `20260826120000` but was applied after it, and both do
`CREATE OR REPLACE` on `link_existing_relative_secure`. Pushing the older file
against a database already holding the newer one silently reverts that function
to its pre-`written_links` body, breaking the write seam with no error. The
ordering hazard is general: **when a migration lands out of timestamp order,
replay every later migration that touches the same object.** Here the newer
definition was re-applied in the same transaction.

### `users.id` and `created_by_user_id`: text/uuid divergence closed 2026-08-30

The two databases used to disagree on the type of six identity columns. Dev
stored them as `text`, production as `uuid`. Every column in every `public`
table was compared across both databases; these six were the whole of it:

| Column | Dev (before) | Production | Both (now) |
| --- | --- | --- | --- |
| `users.id` | `text` | `uuid` | `uuid` |
| `nodes.created_by_user_id` | `text` | `uuid` | `uuid` |
| `links.created_by_user_id` | `text` | `uuid` | `uuid` |
| `node_invites.created_by_user_id` | `text` | `uuid` | `uuid` |
| `node_invites.claimed_by_user_id` | `text` | `uuid` | `uuid` |
| `audit_log.actor_user_id` | `text` | `uuid` | `uuid` |

That divergence cost real uptime. A predicate authored against dev compares one
of these columns to a text expression, which production rejects with
`42883: operator does not exist: uuid = text`. Note that this is not a
compile-time error: the policy or function is created successfully and fails
only when a request evaluates it. Both migrations above shipped with dev-shaped
comparisons; the failure landed mid-migration and briefly took production's
non-admin write path down until the comparisons were corrected.

`20260830120000_reconcile_identity_column_types.sql` resolves it in the
direction production already pointed, and that `20260101_initial_schema.sql`
specified all along: dev's six columns were converted to `uuid`, matching
`auth.users.id`. Production needed no column change. Every value in the dev
columns was already a valid UUID, so the conversion was a pure type change, and
the five nullable columns stayed nullable.

Two policies named one of these columns directly and so blocked `ALTER TYPE`
with `cannot alter type of a column used in a policy definition`. Both were
dropped and recreated in production's shape around the conversion:
`users_select_own_or_admin` on `public.users` and `audit_log_insert_authenticated`
on `public.audit_log`.

The same migration reconciles the functions that had drifted with the columns.
`is_admin` and `is_bound` had grown different definitions on the two databases —
dev's carried the casts its `text` columns required — and now share a single
cast-free definition. `is_within_1_degree` compares `uuid` to `uuid` with no
`::text`.

**These columns are `uuid` in every environment, so compare them to `auth.uid()`
directly and do not cast.** A `::text` cast on an indexed identity column makes
the predicate non-sargable and defeats the index. There is no longer a
dev-versus-production shape to write around.

### Missing `ON DELETE CASCADE` foreign keys on production — closed 2026-08-30

`20260101_initial_schema.sql` declares three foreign keys onto `public.nodes`,
all `ON DELETE CASCADE`: `links.source_node_id` (line 32),
`links.target_node_id` (line 33), and `node_invites.node_id` (line 42). Dev had
all three. Production had none of them — further evidence that production's
schema was never built from that file.

| Constraint | Dev (before) | Production (before) | Both (now) |
| --- | --- | --- | --- |
| `links_source_node_id_fkey` | present, `ON DELETE CASCADE` | absent | present, `ON DELETE CASCADE` |
| `links_target_node_id_fkey` | present, `ON DELETE CASCADE` | absent | present, `ON DELETE CASCADE` |
| `node_invites_node_id_fkey` | present, `ON DELETE CASCADE` | absent | present, `ON DELETE CASCADE` |

**Why it mattered.** `admin_delete_node_secure(p_node_id uuid)` collects the ids
of every Kinship Link touching the Person, runs a single
`DELETE FROM public.nodes`, and returns those ids as `removed_link_ids`. It never
deletes from `public.links`: the cascade is the entire mechanism that makes that
return value true. The assumption is written down at
`20260826120000_lin64_write_seam_return_contract.sql:353-356`. On production the
assumption was false, so the function returned `success: true` and named the
Kinship Link ids while leaving the rows in place. The Write Outcome was
confirmed, the Confirmed Snapshot dropped those Kinship Links, and the database
silently disagreed.

No user ever saw a problem because `dropOrphanLinks`
(`src/lib/sanitizeFamilyGraph.ts`) filters any Kinship Link whose endpoints are
absent, and it runs on both client paths: the Tree Record fetch at
`src/hooks/useWorkingRecord.ts:246` and the Working Record projection at
`src/lib/workingRecord.ts:133`. That is the lesson worth carrying: **a
client-side safety net can hide a false server contract indefinitely.** Two
independent nets masked this one for roughly a fortnight, and only a
column-by-column schema comparison surfaced it.

The residue was 5 orphan rows on production, all `type = 'parent'`, each with a
live source Person and a deleted target, written 2026-08-17 and 2026-08-18. The
target Persons are gone from `public.nodes`, so no facts about them survive and
there is nothing to restore. The rows are archived verbatim in
`reference/orphan-links-before-delete-2026-08-30.json` and were then deleted.

`20260830140000_restore_links_nodes_fk_cascade.sql` deletes orphan Kinship Links
and orphan invites, adds the three constraints guarded on `pg_constraint`, and
ends in a `DO $verify$` block that aborts unless all three exist with
`confdeltype = 'c'`, no orphans remain, and the endpoint columns are still
`NOT NULL`. **The deletes must precede `ADD CONSTRAINT`**, or FK validation fails
with `23503`. Dev was a pure no-op; production went from 82 Kinship Links to 77,
with nodes, invites, and users unchanged. All four foreign keys onto `nodes` are
now present, including the pre-existing `users_node_id_fkey ... ON DELETE SET
NULL`.

**Two hardening findings were recorded and deliberately not applied.** An
applied migration is immutable: editing `20260830140000` now would leave the
committed text different from what executed on both databases, which is the
exact class of mismatch this branch exists to remove. Fold them into the next
migration that touches these constraints.

- The verify block matches constraints by name, `confrelid` and `confdeltype`.
  It checks neither `convalidated` nor `conkey`, so a pre-existing `NOT VALID`
  constraint, or one whose name and column disagree, would satisfy it. Match on
  `(conrelid, conname, attname)` with `convalidated` instead.
- `SET LOCAL lock_timeout` is not set. `ADD CONSTRAINT` takes ACCESS EXCLUSIVE
  on the referencing table, and that request queues behind any open transaction
  touching it while blocking every reader arriving after it. Table size is not
  the risk here; lock queueing is.

Separately, `20260826120000_lin64_write_seam_return_contract.sql:356` states
"Same transaction, so nothing can be added in between", which is stronger than
READ COMMITTED provides: a Kinship Link committed between the `SELECT` and the
`DELETE` would be removed by the cascade without appearing in
`removed_link_ids`. The foreign key narrows that window, because inserting a
Kinship Link now takes `FOR KEY SHARE` on the parent Person's row.

## Using another Postgres provider

The migration SQL is standard Postgres and can be run on Neon, Railway, RDS, etc. However, `auth.uid()` and `auth.jwt()` are Supabase-specific. You will need to replace them with your own auth mechanism (e.g. JWT claims, custom functions) and swap the Supabase client for another Postgres client. The app is built for Supabase; using another database requires adapting auth and the data layer.

## Further reference

- [reference/policies.sql](reference/policies.sql) — Policy definitions
- [reference/public-metrics.sql](reference/public-metrics.sql) — `get_public_metrics` RPC
