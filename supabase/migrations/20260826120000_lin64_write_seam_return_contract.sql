-- =============================================================================
-- LIN-64: Complete the Tree Record write seam's return contract.
--
-- ADR-0003 fixed the six write operations and the error kinds and left return
-- values unspecified, so nothing optimistic could be confirmed from a response.
-- The three writes that go through raw REST only needed a `Prefer` header, which
-- is a client change. The three `*_secure` RPCs choose their own return shape,
-- and this migration is that choice:
--
-- 1. create_relative_secure: accepts a caller-supplied Person uuid, and returns
--    the `nodes` row and every `links` row it wrote. `rel_type = 'sibling'`
--    writes one Kinship Link per parent the anchor has, and the client cannot
--    know how many, or to whom.
-- 2. link_existing_relative_secure: returns the `links` rows it wrote, and keeps
--    `already_connected` for the outcome where it accepts and writes nothing.
--    It also FIXES A LIVE DEFECT — see section 2 below. Expect the non-admin
--    "connect an existing relative" path to start working after this migration.
-- 3. admin_delete_node_secure: returns the Kinship Link ids the FK cascade takes
--    with the Person, so the cascade is never re-implemented in TypeScript.
--
-- No policy, grant or authorization gate changes: every authorization check
-- below is verbatim from the migration it supersedes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCTION: create_relative_secure
-- Supersedes 20260406120000_lin22_first_name.sql.
--
-- The signature gains a sixth parameter, so the five-argument function is
-- dropped rather than replaced: PostgREST resolves an RPC by the argument names
-- supplied, and two overloads make the call with `p_parent_role` omitted
-- ambiguous (the same trap 20260406140000 was written to clear).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_relative_secure(text, text, uuid, uuid, text);

CREATE FUNCTION public.create_relative_secure(
  new_first_name text,
  rel_type text,
  target_node_id uuid,
  creator_id uuid,
  p_parent_role text DEFAULT NULL,
  p_new_node_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_node public.nodes;
  new_link public.links;
  written_links jsonb := '[]'::jsonb;
  parent_id UUID;
  parent_count INTEGER := 0;
  target_cluster TEXT;
  spouse_cluster TEXT;
  spouse_id UUID;
  paternal_cluster TEXT;
  maternal_cluster TEXT;
  v_target uuid := target_node_id;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != creator_id THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT (is_admin() OR is_within_1_degree(v_target)) THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT paternal_family_cluster INTO target_cluster FROM public.nodes WHERE id = v_target;

  IF rel_type = 'child' AND p_parent_role IS NOT NULL THEN
    SELECT CASE
      WHEN l.source_node_id = v_target THEN l.target_node_id
      ELSE l.source_node_id
    END INTO spouse_id
    FROM public.links l
    WHERE l.type = 'marriage'
      AND (l.source_node_id = v_target OR l.target_node_id = v_target)
    LIMIT 1;

    IF p_parent_role = 'mother' THEN
      maternal_cluster := target_cluster;
      IF spouse_id IS NOT NULL THEN
        SELECT paternal_family_cluster INTO spouse_cluster FROM public.nodes WHERE id = spouse_id;
        paternal_cluster := spouse_cluster;
      ELSE
        paternal_cluster := target_cluster;
      END IF;
    ELSIF p_parent_role = 'father' THEN
      paternal_cluster := target_cluster;
      IF spouse_id IS NOT NULL THEN
        SELECT paternal_family_cluster INTO spouse_cluster FROM public.nodes WHERE id = spouse_id;
        maternal_cluster := spouse_cluster;
      ELSE
        maternal_cluster := NULL;
      END IF;
    ELSE
      paternal_cluster := target_cluster;
      maternal_cluster := NULL;
    END IF;
  ELSE
    paternal_cluster := target_cluster;
    maternal_cluster := NULL;
  END IF;

  -- A supplied uuid lets the caller key a Spawn on the Person before this call
  -- answers (LIN-58's D11). A collision surfaces as a primary key violation,
  -- which the exception handler below reports as a failed write.
  INSERT INTO public.nodes (id, first_name, paternal_family_cluster, maternal_family_cluster, created_by_user_id)
  VALUES (
    COALESCE(p_new_node_id, gen_random_uuid()),
    new_first_name,
    paternal_cluster,
    maternal_cluster,
    creator_id
  )
  RETURNING * INTO new_node;

  IF rel_type = 'parent' THEN
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (new_node.id, v_target, 'parent', NULL, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'child' THEN
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_target, new_node.id, 'parent', p_parent_role, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'spouse' THEN
    INSERT INTO public.links (source_node_id, target_node_id, type, created_by_user_id)
    VALUES (v_target, new_node.id, 'marriage', creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'sibling' THEN
    FOR parent_id IN
      SELECT l.source_node_id FROM public.links l
      WHERE l.target_node_id = v_target AND l.type = 'parent'
    LOOP
      INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
      VALUES (parent_id, new_node.id, 'parent', NULL, creator_id)
      RETURNING * INTO new_link;
      written_links := written_links || to_jsonb(new_link);
      parent_count := parent_count + 1;
    END LOOP;

    IF parent_count = 0 THEN
      RAISE EXCEPTION 'Cannot add sibling: Target node has no parents to branch from.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid relationship type: %', rel_type;
  END IF;

  RETURN json_build_object(
    'success', true,
    'new_node_id', new_node.id,
    'nodes', jsonb_build_array(to_jsonb(new_node)),
    'links', written_links,
    'message', 'Relative added successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

ALTER FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: link_existing_relative_secure
-- Supersedes 20260817140000_lin59_server_side_admin_write_gates.sql.
-- Same signature, same gates. Two changes: it now says which rows it wrote, and
-- the duplicate-guard `EXISTS` blocks qualify their columns with `l.`.
--
-- The second is a bug fix, not tidying. `target_node_id` is both a parameter of
-- this function and a column of `public.links`, and the guards referenced the
-- column unqualified (`20260817140000:124-127, 143-146, 158-165`, and the same
-- shape in the initial schema). plpgsql's default `variable_conflict = error`
-- therefore raised `column reference "target_node_id" is ambiguous` at runtime,
-- the `EXCEPTION WHEN OTHERS` below turned it into `{"success": false}`, and the
-- client reported it as a refusal. `parent`, `child` and `spouse` have never
-- worked; only `sibling` did, because its queries were already aliased. So
-- `already_connected` was unreachable rather than merely unread (ADR-0005), and
-- every non-admin attempt to link an existing relative failed.
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
  new_link public.links;
  written_links jsonb := '[]'::jsonb;
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
      SELECT 1 FROM public.links l
      WHERE l.type = 'parent' AND l.source_node_id = v_existing AND l.target_node_id = v_target
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'links', written_links,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_existing, v_target, 'parent', NULL, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'child' THEN
    IF EXISTS (
      SELECT 1 FROM public.links l
      WHERE l.type = 'parent' AND l.source_node_id = v_target AND l.target_node_id = v_existing
        AND (l.parent_role IS NOT DISTINCT FROM p_parent_role)
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'links', written_links,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_target, v_existing, 'parent', p_parent_role, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'spouse' THEN
    IF EXISTS (
      SELECT 1 FROM public.links l
      WHERE l.type IN ('marriage', 'divorce')
        AND (
          (l.source_node_id = v_target AND l.target_node_id = v_existing)
          OR (l.source_node_id = v_existing AND l.target_node_id = v_target)
        )
    ) THEN
      RETURN json_build_object(
        'success', true,
        'new_node_id', v_existing,
        'already_connected', true,
        'links', written_links,
        'message', 'Already connected'
      );
    END IF;
    INSERT INTO public.links (source_node_id, target_node_id, type, created_by_user_id)
    VALUES (v_target, v_existing, 'marriage', creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

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
        'links', written_links,
        'message', 'Already connected'
      );
    END IF;

    FOR parent_id IN
      SELECT l.source_node_id FROM public.links l
      WHERE l.target_node_id = v_target AND l.type = 'parent'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.links l
        WHERE l.type = 'parent' AND l.source_node_id = parent_id AND l.target_node_id = v_existing
      ) THEN
        INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
        VALUES (parent_id, v_existing, 'parent', NULL, creator_id)
        RETURNING * INTO new_link;
        written_links := written_links || to_jsonb(new_link);
      END IF;
    END LOOP;

  ELSE
    RETURN json_build_object('success', false, 'message', format('Invalid relationship type: %s', rel_type));
  END IF;

  RETURN json_build_object(
    'success', true,
    'new_node_id', v_existing,
    'already_connected', false,
    'links', written_links,
    'message', 'Relative linked successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

ALTER FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. FUNCTION: admin_delete_node_secure
-- Supersedes 20260408230000_admin_delete_node_bypass_rls.sql.
--
-- The Kinship Links are read before the delete rather than deleted separately:
-- the single `DELETE FROM public.nodes` and its FK cascade stay the mechanism,
-- and `links.source_node_id`/`target_node_id` are `NOT NULL REFERENCES
-- public.nodes(id) ON DELETE CASCADE`, so those ids are exactly what the cascade
-- removes. Same transaction, so nothing can be added in between.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_node_secure(p_node_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_deleted int;
  v_link_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  IF NOT is_admin() THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized');
  END IF;

  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_link_ids
  FROM public.links
  WHERE source_node_id = p_node_id OR target_node_id = p_node_id;

  DELETE FROM public.nodes WHERE id = p_node_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No row was deleted.');
  END IF;

  RETURN json_build_object('success', true, 'removed_link_ids', to_jsonb(v_link_ids));
END;
$$;

ALTER FUNCTION public.admin_delete_node_secure(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.admin_delete_node_secure(uuid) TO authenticated;
