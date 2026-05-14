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

## Using another Postgres provider

The migration SQL is standard Postgres and can be run on Neon, Railway, RDS, etc. However, `auth.uid()` and `auth.jwt()` are Supabase-specific. You will need to replace them with your own auth mechanism (e.g. JWT claims, custom functions) and swap the Supabase client for another Postgres client. The app is built for Supabase; using another database requires adapting auth and the data layer.

## Further reference

- [reference/policies.sql](reference/policies.sql) — Policy definitions
- [reference/public-metrics.sql](reference/public-metrics.sql) — `get_public_metrics` RPC
