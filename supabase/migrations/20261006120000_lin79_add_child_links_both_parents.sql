-- =============================================================================
-- LIN-79: adding a child links both parents (ADR 0012).
--
-- LIN-78 filled in the other parent of every existing child it could. This
-- migration lets the app do the same for each new one, in the call that adds
-- it, so the two parent Kinship Links are written together or not at all:
--
-- 1. create_relative_secure and link_existing_relative_secure gain
--    `p_other_parent_id`. With `rel_type = 'child'` it names the anchor's
--    spouse or former spouse (a `marriage` or `divorce` link to the anchor),
--    and the child gets a `parent` link from them as well as from the anchor.
--    The role is left NULL for trg_links_parent_role_follows_gender to give
--    from the other parent's gender. Any other `rel_type`, or a Person who is
--    not the anchor's spouse, fails and writes nothing.
-- 2. create_relative_secure derives the new Person's cluster fields from the
--    named other parent only. With none named (no spouse, or "Not known") the
--    anchor alone gives them, as when the anchor has no spouse: an arbitrary
--    current spouse no longer does.
-- 3. link_existing_relative_secure keeps `already_connected` exactly as before
--    when the anchor's link exists, and skips the other parent's link when that
--    one exists already.
--
-- The client picks the other parent: it is linked without asking when the
-- anchor has had one spouse, ever, and chosen by the user when more than one
-- ("Not known" omits it, and one link is written as before).
--
-- Authorization of the anchor (and the existing child) is unchanged from
-- 20261001130000_lin76_person_gender.sql. For the other parent (ADR 0013,
-- Amendments):
-- - link_existing_relative_secure holds a non-admin's other-parent link to the
--   rule every link they write follows, both endpoints in their 1-Degree
--   Network. When the other parent is outside it, the anchor's link is still
--   written and the other parent's is skipped, so `links` reports only the one.
--   The check runs before anything is written, since the anchor's new link can
--   itself bring the other parent into the network.
-- - create_relative_secure has no such check: its links all go to the Person
--   the call creates, so they cannot widen the caller's network. The anchor is
--   checked already, and the caller's own spouse is a direct link.
-- A failure raised after the node is inserted (the role trigger, a key
-- collision) is caught by the function's EXCEPTION block, which rolls back
-- everything the block wrote, so a failed call leaves no Person behind.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCTION: is_spouse_of (internal)
-- Whether two Persons have a `marriage` or `divorce` Kinship Link, either way.
-- Called only by the two functions below, which run as postgres.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_spouse_of(p_person uuid, p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.links l
    WHERE l.type IN ('marriage', 'divorce')
      AND (
        (l.source_node_id = p_person AND l.target_node_id = p_other)
        OR (l.source_node_id = p_other AND l.target_node_id = p_person)
      )
  );
$$;

ALTER FUNCTION public.is_spouse_of(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_spouse_of(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: create_relative_secure
-- Supersedes 20261001130000_lin76_person_gender.sql. Gains an eighth
-- parameter, `p_other_parent_id`, so the seven-argument function is dropped
-- rather than replaced (two overloads make a call that omits the new argument
-- ambiguous, ADR 0010).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_relative_secure(text, text, uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.create_relative_secure(text, text, uuid, uuid, text, uuid, text, uuid);

CREATE FUNCTION public.create_relative_secure(
  new_first_name text,
  rel_type text,
  target_node_id uuid,
  creator_id uuid,
  p_parent_role text DEFAULT NULL,
  p_new_node_id uuid DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_other_parent_id uuid DEFAULT NULL
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
  target_gender TEXT;
  spouse_cluster TEXT;
  spouse_id UUID;
  paternal_cluster TEXT;
  maternal_cluster TEXT;
  v_target uuid := target_node_id;
  v_parent_role text := p_parent_role;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != creator_id THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT (is_admin() OR is_within_1_degree(v_target)) THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_gender IS NOT NULL AND p_gender NOT IN ('male', 'female') THEN
    RETURN json_build_object('success', false, 'message', format('Invalid gender: %s', p_gender));
  END IF;

  IF p_other_parent_id IS NOT NULL THEN
    IF rel_type IS DISTINCT FROM 'child' THEN
      RETURN json_build_object('success', false, 'message', 'An other parent can only be given when adding a child.');
    END IF;
    IF NOT is_spouse_of(v_target, p_other_parent_id) THEN
      RETURN json_build_object('success', false, 'message', 'The other parent must be a spouse or former spouse of the parent.');
    END IF;
  END IF;

  SELECT paternal_family_cluster, gender INTO target_cluster, target_gender
  FROM public.nodes WHERE id = v_target;

  -- The anchor is the parent of a new child, so its gender gives the role.
  IF rel_type = 'child' THEN
    v_parent_role := COALESCE(v_parent_role, parent_role_for_gender(target_gender));
  END IF;

  -- Only the named other parent: none named ("Not known") borrows no spouse's cluster.
  IF rel_type = 'child' AND v_parent_role IS NOT NULL THEN
    spouse_id := p_other_parent_id;

    IF v_parent_role = 'mother' THEN
      maternal_cluster := target_cluster;
      IF spouse_id IS NOT NULL THEN
        SELECT paternal_family_cluster INTO spouse_cluster FROM public.nodes WHERE id = spouse_id;
        paternal_cluster := spouse_cluster;
      ELSE
        paternal_cluster := target_cluster;
      END IF;
    ELSIF v_parent_role = 'father' THEN
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
  INSERT INTO public.nodes (id, first_name, paternal_family_cluster, maternal_family_cluster, gender, created_by_user_id)
  VALUES (
    COALESCE(p_new_node_id, gen_random_uuid()),
    new_first_name,
    paternal_cluster,
    maternal_cluster,
    p_gender,
    creator_id
  )
  RETURNING * INTO new_node;

  IF rel_type = 'parent' THEN
    -- The new Person is the parent; the trigger gives the role from p_gender.
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (new_node.id, v_target, 'parent', NULL, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

  ELSIF rel_type = 'child' THEN
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
    VALUES (v_target, new_node.id, 'parent', v_parent_role, creator_id)
    RETURNING * INTO new_link;
    written_links := written_links || to_jsonb(new_link);

    IF p_other_parent_id IS NOT NULL THEN
      -- The trigger gives the role from the other parent's gender.
      INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
      VALUES (p_other_parent_id, new_node.id, 'parent', NULL, creator_id)
      RETURNING * INTO new_link;
      written_links := written_links || to_jsonb(new_link);
    END IF;

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

ALTER FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid, text, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid, text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. FUNCTION: link_existing_relative_secure
-- Supersedes 20261001130000_lin76_person_gender.sql. Gains a sixth parameter,
-- `p_other_parent_id`, so the five-argument function is dropped first, for the
-- same reason as above.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.link_existing_relative_secure(uuid, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.link_existing_relative_secure(uuid, text, uuid, uuid, text, uuid);

CREATE FUNCTION public.link_existing_relative_secure(
  existing_node_id uuid,
  rel_type text,
  target_node_id uuid,
  creator_id uuid,
  p_parent_role text DEFAULT NULL,
  p_other_parent_id uuid DEFAULT NULL
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
  v_link_other_parent boolean := false;
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

  IF p_other_parent_id IS NOT NULL THEN
    IF rel_type IS DISTINCT FROM 'child' THEN
      RETURN json_build_object('success', false, 'message', 'An other parent can only be given when linking a child.');
    END IF;
    IF p_other_parent_id = v_existing OR NOT is_spouse_of(v_target, p_other_parent_id) THEN
      RETURN json_build_object('success', false, 'message', 'The other parent must be a spouse or former spouse of the parent.');
    END IF;
    -- Checked before any write: the anchor's new link could bring the other
    -- parent into the caller's network. Outside it, only the anchor's is written.
    v_link_other_parent := is_admin() OR is_within_1_degree(p_other_parent_id);
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

    IF v_link_other_parent AND NOT EXISTS (
      SELECT 1 FROM public.links l
      WHERE l.type = 'parent' AND l.source_node_id = p_other_parent_id AND l.target_node_id = v_existing
    ) THEN
      -- The trigger gives the role from the other parent's gender.
      INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
      VALUES (p_other_parent_id, v_existing, 'parent', NULL, creator_id)
      RETURNING * INTO new_link;
      written_links := written_links || to_jsonb(new_link);
    END IF;

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

ALTER FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.link_existing_relative_secure(uuid, text, uuid, uuid, text, uuid) TO authenticated, service_role;
