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

### `users.id` and `created_by_user_id` are `text` on dev, `uuid` on production

The two databases genuinely diverge on column types:

| Column | Dev | Production |
| --- | --- | --- |
| `users.id` | `text` | `uuid` |
| `nodes.created_by_user_id` | `text` | `uuid` |
| `links.created_by_user_id` | `text` | `uuid` |
| `users.node_id` | `uuid` | `uuid` |

So does `is_admin()`: production compares `id = auth.uid()` while dev must cast.
Any predicate written against one database and compared to a text expression
fails on the other with `42883: operator does not exist: uuid = text`. Both
migrations above shipped with dev-shaped comparisons and had to be corrected
before production would take them — `lin33`'s policy and `lin59`'s
`is_within_1_degree` lookup now cast the *column* to text, which is valid on
either type.

Until the types are reconciled, **write `column::text = <text expression>`**
whenever a migration touches these columns, and check any new predicate against
both databases rather than only the one in front of you.

## Using another Postgres provider

The migration SQL is standard Postgres and can be run on Neon, Railway, RDS, etc. However, `auth.uid()` and `auth.jwt()` are Supabase-specific. You will need to replace them with your own auth mechanism (e.g. JWT claims, custom functions) and swap the Supabase client for another Postgres client. The app is built for Supabase; using another database requires adapting auth and the data layer.

## Further reference

- [reference/policies.sql](reference/policies.sql) — Policy definitions
- [reference/public-metrics.sql](reference/public-metrics.sql) — `get_public_metrics` RPC
