-- =============================================================================
-- bound-reads: only a bound account or an admin reads family data (ADR 0013,
-- Amendments).
--
-- Any signed-in Google account could read every Person, Kinship Link and
-- claimed-Person id, invited or not:
--
-- 1. nodes_select_authenticated and links_select_authenticated were USING (true).
--    They give way to is_admin() OR is_bound(). Never is_bound() alone: an admin
--    is not guaranteed bound, since users.node_id is ON DELETE SET NULL.
-- 2. get_claimed_node_ids() reads public.users as postgres and had no caller
--    check. It now returns no ids to anyone else under the same rule, and anon
--    can no longer execute it.
--
-- Unchanged: get_public_metrics, get_invite_by_token and claim_invite_secure are
-- SECURITY DEFINER, as are the write functions and triggers that read nodes and
-- links, and run as the table owner, which RLS does not apply to. Each account
-- still reads its own users row through users_select_own_or_admin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. POLICIES: reading nodes and links
-- Each call is a subquery so that it runs once per statement, not once per row.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS nodes_select_authenticated ON public.nodes;
DROP POLICY IF EXISTS nodes_select_bound_or_admin ON public.nodes;

CREATE POLICY nodes_select_bound_or_admin ON public.nodes
  FOR SELECT TO authenticated
  USING ((select is_admin()) OR (select is_bound()));

DROP POLICY IF EXISTS links_select_authenticated ON public.links;
DROP POLICY IF EXISTS links_select_bound_or_admin ON public.links;

CREATE POLICY links_select_bound_or_admin ON public.links
  FOR SELECT TO authenticated
  USING ((select is_admin()) OR (select is_bound()));

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: get_claimed_node_ids
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_claimed_node_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(node_id) FILTER (WHERE node_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.users
  WHERE node_id IS NOT NULL
    AND ((select is_admin()) OR (select is_bound()));
$$;

ALTER FUNCTION public.get_claimed_node_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_claimed_node_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_node_ids() TO authenticated, service_role;
