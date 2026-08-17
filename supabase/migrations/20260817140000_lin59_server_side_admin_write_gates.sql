-- =============================================================================
-- LIN-59: Server-side write authorization gating
-- 1. Restrict direct POST /nodes (standalone creation) to admins only.
-- 2. Restrict divorce link creation to admins only.
-- 3. Require BOTH endpoints to be within 1-degree for non-admin link creation.
-- 4. Guard cluster field updates on nodes so non-admins cannot modify them.
-- 5. Tighten link_existing_relative_secure RPC to enforce 1-degree on both endpoints.
-- 6. Update is_within_1_degree to compute full 1-degree network with robust auth uid resolution.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCTION: is_within_1_degree
-- Computes the full 1-degree perimeter: self, direct links, siblings,
-- parents' spouses, child's other parent, and spouse's children.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_within_1_degree(p_target_node_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_node_id uuid;
  v_current_user_id text := COALESCE(auth.jwt() ->> 'sub', auth.uid()::text);
BEGIN
  IF v_current_user_id IS NULL THEN RETURN FALSE; END IF;
  SELECT node_id INTO v_user_node_id FROM public.users WHERE id = v_current_user_id;
  IF v_user_node_id IS NULL THEN RETURN FALSE; END IF;
  IF p_target_node_id = v_user_node_id THEN RETURN TRUE; END IF;

  -- 1. Direct connection (parent, marriage, divorce)
  IF EXISTS (
    SELECT 1 FROM public.links
    WHERE (source_node_id = v_user_node_id AND target_node_id = p_target_node_id)
       OR (source_node_id = p_target_node_id AND target_node_id = v_user_node_id)
  ) THEN RETURN TRUE; END IF;

  -- 2. Siblings (share a parent)
  IF EXISTS (
    SELECT 1 FROM public.links l1
    JOIN public.links l2 ON l1.source_node_id = l2.source_node_id
    WHERE l1.target_node_id = v_user_node_id AND l2.target_node_id = p_target_node_id
      AND l1.type = 'parent' AND l2.type = 'parent'
  ) THEN RETURN TRUE; END IF;

  -- 3. Parent's spouse (marriage or divorce)
  IF EXISTS (
    SELECT 1 FROM public.links l_parent
    JOIN public.links l_marriage ON (
      l_marriage.source_node_id = l_parent.source_node_id
      OR l_marriage.target_node_id = l_parent.source_node_id
    )
    WHERE l_parent.target_node_id = v_user_node_id AND l_parent.type = 'parent'
      AND (l_marriage.type = 'marriage' OR l_marriage.type = 'divorce')
      AND (l_marriage.source_node_id = p_target_node_id OR l_marriage.target_node_id = p_target_node_id)
  ) THEN RETURN TRUE; END IF;

  -- 4. Child's other parent
  IF EXISTS (
    SELECT 1 FROM public.links l_child
    JOIN public.links l_other_parent ON l_other_parent.target_node_id = l_child.target_node_id
    WHERE l_child.source_node_id = v_user_node_id AND l_child.type = 'parent'
      AND l_other_parent.type = 'parent' AND l_other_parent.source_node_id = p_target_node_id
  ) THEN RETURN TRUE; END IF;

  -- 5. Spouse's child (step-child)
  IF EXISTS (
    SELECT 1 FROM public.links l_marriage
    JOIN public.links l_spouse_child ON (
      l_spouse_child.source_node_id = l_marriage.source_node_id
      OR l_spouse_child.source_node_id = l_marriage.target_node_id
    )
    WHERE (l_marriage.source_node_id = v_user_node_id OR l_marriage.target_node_id = v_user_node_id)
      AND (l_marriage.type = 'marriage' OR l_marriage.type = 'divorce')
      AND l_spouse_child.type = 'parent' AND l_spouse_child.target_node_id = p_target_node_id
      AND l_spouse_child.source_node_id != v_user_node_id
  ) THEN RETURN TRUE; END IF;

  RETURN FALSE;
END;
$$;

ALTER FUNCTION public.is_within_1_degree(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_within_1_degree(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: link_existing_relative_secure
-- Enforces 1-degree perimeter on BOTH endpoints for non-admins.
-- Rejects divorce link creation (admin-only).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_existing_relative_secure(
  existing_node_id uuid,
  rel_type text,
  target_node_id uuid,
  creator_id uuid,
  p_parent_role text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_id UUID;
  parent_count INTEGER := 0;
  missing_count INTEGER := 0;
  v_existing uuid := existing_node_id;
  v_target uuid := target_node_id;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != creator_id THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  -- Verify authorization: admins can link any nodes; non-admins must have BOTH nodes in their 1-degree network
  IF NOT (is_admin() OR (is_within_1_degree(v_target) AND is_within_1_degree(v_existing))) THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF v_existing = v_target THEN
    RETURN json_build_object('success', false, 'message', 'Cannot link a node to itself');
  END IF;

  IF rel_type = 'parent' THEN
    IF EXISTS (
      SELECT 1 FROM public.links
      WHERE type = 'parent' AND source_node_id = v_existing AND target_node_id = v_target
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_existing, v_target, 'parent', NULL, creator_id);

  ELSIF rel_type = 'child' THEN
    IF EXISTS (
      SELECT 1 FROM public.links
      WHERE type = 'parent' AND source_node_id = v_target AND target_node_id = v_existing
        AND (parent_role IS NOT DISTINCT FROM p_parent_role)
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_target, v_existing, 'parent', p_parent_role, creator_id);

  ELSIF rel_type = 'spouse' THEN
    IF EXISTS (
      SELECT 1 FROM public.links
      WHERE type IN ('marriage', 'divorce')
        AND (
          (source_node_id = v_target AND target_node_id = v_existing)
          OR (source_node_id = v_existing AND target_node_id = v_target)
        )
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, created_by_user_id)
    VALUES (v_target, v_existing, 'marriage', creator_id);

  ELSIF rel_type = 'sibling' THEN
    SELECT COUNT(*) INTO parent_count
    FROM public.links l
    WHERE l.target_node_id = v_target AND l.type = 'parent';

    IF parent_count = 0 THEN
      RETURN json_build_object('success', false, 'message', 'Cannot add sibling: Target node has no parents to branch from.');
    END IF;

    SELECT COUNT(*) INTO missing_count
    FROM public.links l
    WHERE l.target_node_id = v_target AND l.type = 'parent'
      AND NOT EXISTS (
        SELECT 1 FROM public.links l2
        WHERE l2.type = 'parent'
          AND l2.source_node_id = l.source_node_id
          AND l2.target_node_id = v_existing
      );

    IF missing_count = 0 THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'message', 'Already connected'
      );
    END IF;

    FOR parent_id IN
      SELECT l.source_node_id FROM public.links l
      WHERE l.target_node_id = v_target AND l.type = 'parent'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.links
        WHERE type = 'parent' AND source_node_id = parent_id AND target_node_id = v_existing
      ) THEN
        INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
        VALUES (parent_id, v_existing, 'parent', NULL, creator_id);
      END IF;
    END LOOP;

  ELSE
    RETURN json_build_object('success', false, 'message', format('Invalid relationship type: %s', rel_type));
  END IF;

  RETURN json_build_object(
    'success', true,
    'new_node_id', v_existing,
    'already_connected', false,
    'message', 'Relative linked successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

ALTER FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. POLICIES ON public.nodes
-- -----------------------------------------------------------------------------

-- Drop old insert policies
DROP POLICY IF EXISTS nodes_insert_by_bound_users ON public.nodes;
DROP POLICY IF EXISTS nodes_insert_admin ON public.nodes;
DROP POLICY IF EXISTS nodes_insert_admin_only ON public.nodes;

-- Direct INSERT on nodes is admin-only.
-- Non-admin users create nodes via create_relative_secure RPC.
CREATE POLICY nodes_insert_admin_only ON public.nodes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Update policy on nodes: admin or 1-degree relative
DROP POLICY IF EXISTS nodes_update_1degree_or_admin ON public.nodes;
DROP POLICY IF EXISTS nodes_update_1degree_or_admin_name_only ON public.nodes;

CREATE POLICY nodes_update_1degree_or_admin ON public.nodes
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_within_1_degree(id))
  WITH CHECK (is_admin() OR is_within_1_degree(id));

-- Delete policy on nodes: admin-only
DROP POLICY IF EXISTS nodes_delete_admin_only ON public.nodes;

CREATE POLICY nodes_delete_admin_only ON public.nodes
  FOR DELETE TO authenticated
  USING (is_admin());

-- Guard trigger for cluster fields: prevents non-admins from changing cluster fields on nodes
CREATE OR REPLACE FUNCTION public.check_node_update_cluster_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    IF NEW.paternal_family_cluster IS DISTINCT FROM OLD.paternal_family_cluster THEN
      RAISE EXCEPTION 'Only administrators can update paternal_family_cluster';
    END IF;
    IF NEW.maternal_family_cluster IS DISTINCT FROM OLD.maternal_family_cluster THEN
      RAISE EXCEPTION 'Only administrators can update maternal_family_cluster';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_node_update_cluster_guard() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_guard_node_cluster_updates ON public.nodes;
CREATE TRIGGER trg_guard_node_cluster_updates
  BEFORE UPDATE ON public.nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_node_update_cluster_guard();

-- -----------------------------------------------------------------------------
-- 4. POLICIES ON public.links
-- -----------------------------------------------------------------------------

-- Drop old insert policies
DROP POLICY IF EXISTS links_insert_1degree_or_admin ON public.links;
DROP POLICY IF EXISTS links_insert_admin_only ON public.links;

-- Direct INSERT on links:
-- Admin can insert any link type (parent, marriage, divorce).
-- Non-admin can only insert non-divorce links where BOTH endpoints are within 1-degree.
CREATE POLICY links_insert_1degree_or_admin ON public.links
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      type != 'divorce'
      AND is_within_1_degree(source_node_id)
      AND is_within_1_degree(target_node_id)
    )
  );

-- Drop old update policies
DROP POLICY IF EXISTS links_update_1degree_or_admin ON public.links;
DROP POLICY IF EXISTS links_update_admin_only ON public.links;

-- Direct UPDATE on links:
-- Admin can update any link.
-- Non-admin can only update non-divorce links where BOTH endpoints remain within 1-degree.
CREATE POLICY links_update_1degree_or_admin ON public.links
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (
      type != 'divorce'
      AND is_within_1_degree(source_node_id)
      AND is_within_1_degree(target_node_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      type != 'divorce'
      AND is_within_1_degree(source_node_id)
      AND is_within_1_degree(target_node_id)
    )
  );

-- Delete policy on links: admin-only
DROP POLICY IF EXISTS links_delete_admin_only ON public.links;

CREATE POLICY links_delete_admin_only ON public.links
  FOR DELETE TO authenticated
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 5. GRANTS
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nodes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links TO authenticated, service_role;
