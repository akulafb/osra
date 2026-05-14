-- -----------------------------------------------------------------------------
-- Data API (PostgREST / supabase-js): explicit privileges on public tables
-- -----------------------------------------------------------------------------
-- Required for Supabase projects where new public tables are not auto-exposed to
-- the Data API (default for new projects from 2026-05-30; enforced for existing
-- projects for tables created after 2026-10-30). See:
-- https://github.com/orgs/supabase/discussions/45329
--
-- RLS continues to constrain anon/authenticated; service_role bypasses RLS.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon, authenticated,
  service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nodes TO anon, authenticated,
  service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.links TO anon, authenticated,
  service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.node_invites TO anon, authenticated,
  service_role;

-- RLS disabled on audit_log — do not grant anon/authenticated (would expose rows via REST).
-- Revoke default-era privileges on existing projects; then allow only service_role for REST.
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_log TO service_role;
