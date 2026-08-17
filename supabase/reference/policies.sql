-- ============================================================================
-- RLS POLICIES - SOURCE OF TRUTH (Reference)
-- ============================================================================
-- Policies are applied via supabase/migrations/. This file documents the
-- current policy set for reference. Run migrations to apply changes.
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE POLICY users_select_own_or_admin ON public.users
  FOR SELECT TO authenticated
  USING ((id = (select auth.uid())) OR is_admin());

CREATE POLICY users_insert_blocked ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY users_update_admin_only ON public.users
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY users_delete_admin_only ON public.users
  FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================================
-- NODES
-- ============================================================================
CREATE POLICY nodes_select_authenticated ON public.nodes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY nodes_insert_by_bound_users ON public.nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    (created_by_user_id = (select auth.uid()))
    AND (EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid()) AND node_id IS NOT NULL
    ))
  );

-- LIN-33: Admins can create standalone nodes (no bound node_id required)
CREATE POLICY nodes_insert_admin ON public.nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    AND (created_by_user_id = (select auth.uid()::text))
  );

CREATE POLICY nodes_update_1degree_or_admin ON public.nodes
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_within_1_degree(id))
  WITH CHECK (is_admin() OR is_within_1_degree(id));

CREATE POLICY nodes_delete_admin_only ON public.nodes
  FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================================
-- LINKS
-- ============================================================================
CREATE POLICY links_select_authenticated ON public.links
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY links_insert_1degree_or_admin ON public.links
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_within_1_degree(source_node_id) OR is_within_1_degree(target_node_id));

CREATE POLICY links_update_1degree_or_admin ON public.links
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_within_1_degree(source_node_id) OR is_within_1_degree(target_node_id))
  WITH CHECK (is_admin() OR is_within_1_degree(source_node_id) OR is_within_1_degree(target_node_id));

CREATE POLICY links_delete_admin_only ON public.links
  FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================================
-- NODE_INVITES
-- ============================================================================
-- LIN-60: Scoped to authenticated users who can manage the node (or admin)
CREATE POLICY node_invites_select_1degree_or_admin ON public.node_invites
  FOR SELECT TO authenticated
  USING (can_manage_invites_for_node(node_id));

CREATE POLICY node_invites_insert_1degree ON public.node_invites
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_invites_for_node(node_id));

-- LIN-60: Allows bulk invalidation of prior unclaimed invites
CREATE POLICY node_invites_update_1degree ON public.node_invites
  FOR UPDATE TO authenticated
  USING (can_manage_invites_for_node(node_id))
  WITH CHECK (can_manage_invites_for_node(node_id));

CREATE POLICY node_invites_delete_1degree ON public.node_invites
  FOR DELETE TO authenticated
  USING (can_manage_invites_for_node(node_id));

