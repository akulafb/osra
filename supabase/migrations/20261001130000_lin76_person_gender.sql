-- =============================================================================
-- LIN-76: Each Person has a gender.
--
-- The Tree Record held no gender on a Person. The only clue was `parent_role`
-- on a Kinship Link where the Person is the parent, so a childless Person could
-- not be called "nephew" or "niece", "son" or "daughter". This migration:
--
-- 1. adds `nodes.gender`: 'male', 'female', or NULL for not recorded;
-- 2. makes `parent_role` follow gender. A parent Kinship Link written with no
--    role takes it from the parent's gender, and a role that disagrees with the
--    parent's gender is refused, on every write path (the RPCs and the admin's
--    raw REST). A gender that disagrees with a role is refused too, and setting
--    a gender gives the Person's parent links with no role theirs;
-- 3. lets create_relative_secure set the new Person's gender (`p_gender`);
-- 4. stops link_existing_relative_secure's child duplicate guard from reading
--    the role: a role filled in from gender would no longer match the NULL a
--    caller sends, and the guard would insert a second link to the same child.
--
-- It does NOT backfill existing empty `parent_role` values. No Person has a
-- gender until the owner's corrected list is applied (scripts/person-gender/),
-- and that generated migration fills the empty roles after storing the list.
--
-- RLS and grants are unchanged on purpose: `nodes_update_1degree_or_admin` and
-- the table grants cover every column, so whoever may rename a Person may set
-- their gender, and only the cluster fields stay admin-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COLUMN: nodes.gender
-- -----------------------------------------------------------------------------
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.nodes DROP CONSTRAINT IF EXISTS nodes_gender_check;
ALTER TABLE public.nodes
  ADD CONSTRAINT nodes_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.nodes.gender IS
  'male, female, or NULL for not recorded. A parent Kinship Link''s parent_role follows it (LIN-76).';

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: parent_role_for_gender
-- The parent_role a parent Kinship Link takes from the parent's gender.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parent_role_for_gender(p_gender text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_gender WHEN 'male' THEN 'father' WHEN 'female' THEN 'mother' ELSE NULL END;
$$;

ALTER FUNCTION public.parent_role_for_gender(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.parent_role_for_gender(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. TRIGGER on links: a parent link's role follows the parent's gender.
-- Fills an empty role, refuses one that disagrees. A parent with no gender
-- recorded leaves the role as written.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.links_parent_role_follows_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gender text;
  v_name text;
  v_role text;
BEGIN
  IF NEW.type <> 'parent' THEN
    RETURN NEW;
  END IF;

  SELECT n.gender, n.first_name INTO v_gender, v_name
  FROM public.nodes n
  WHERE n.id = NEW.source_node_id;

  v_role := parent_role_for_gender(v_gender);
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_role IS NULL THEN
    NEW.parent_role := v_role;
  ELSIF NEW.parent_role <> v_role THEN
    RAISE EXCEPTION '% is recorded as %, so they can only be a % here, not a %.',
      v_name, v_gender, v_role, NEW.parent_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.links_parent_role_follows_gender() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_links_parent_role_follows_gender ON public.links;
CREATE TRIGGER trg_links_parent_role_follows_gender
  BEFORE INSERT OR UPDATE OF type, source_node_id, parent_role ON public.links
  FOR EACH ROW
  EXECUTE FUNCTION public.links_parent_role_follows_gender();

-- -----------------------------------------------------------------------------
-- 4. TRIGGERS on nodes: a gender must agree with the Person's parent links.
-- Before the change: refuse a gender that disagrees with a recorded role.
-- After it: give the Person's parent links with no role the one the gender
-- implies. SECURITY DEFINER (owner postgres) so that a Person the caller may
-- edit has all their parent links filled, not only the ones the caller's RLS
-- would let them update directly.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nodes_gender_agrees_with_parent_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := parent_role_for_gender(NEW.gender);
  v_recorded text;
BEGIN
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.parent_role INTO v_recorded
  FROM public.links l
  WHERE l.type = 'parent'
    AND l.source_node_id = NEW.id
    AND l.parent_role IS NOT NULL
    AND l.parent_role <> v_role
  LIMIT 1;

  IF v_recorded IS NOT NULL THEN
    RAISE EXCEPTION '% is recorded as a % on a Kinship Link, so their gender cannot be %.',
      NEW.first_name, v_recorded, NEW.gender;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.nodes_gender_agrees_with_parent_roles() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_nodes_gender_agrees_with_parent_roles ON public.nodes;
CREATE TRIGGER trg_nodes_gender_agrees_with_parent_roles
  BEFORE UPDATE OF gender ON public.nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.nodes_gender_agrees_with_parent_roles();

CREATE OR REPLACE FUNCTION public.nodes_gender_fills_parent_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    UPDATE public.links
    SET parent_role = parent_role_for_gender(NEW.gender)
    WHERE type = 'parent'
      AND source_node_id = NEW.id
      AND parent_role IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.nodes_gender_fills_parent_roles() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_nodes_gender_fills_parent_roles ON public.nodes;
CREATE TRIGGER trg_nodes_gender_fills_parent_roles
  AFTER UPDATE OF gender ON public.nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.nodes_gender_fills_parent_roles();

-- -----------------------------------------------------------------------------
-- 5. FUNCTION: create_relative_secure
-- Supersedes 20260826120000_lin64_write_seam_return_contract.sql.
--
-- Gains a seventh parameter, `p_gender`, so the six-argument function is
-- dropped rather than replaced (PostgREST resolves an RPC by the argument names
-- supplied; two overloads make a call that omits the new one ambiguous).
--
-- Adding a child with no `p_parent_role` now takes the role from the anchor's
-- gender, for the cluster fields as well as the link. Every link it writes
-- (including the ones copied for a sibling, which used to belong to neither
-- side) is also given its role by trg_links_parent_role_follows_gender.
-- Authorization is verbatim from the superseded function.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_relative_secure(text, text, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.create_relative_secure(text, text, uuid, uuid, text, uuid, text);

CREATE FUNCTION public.create_relative_secure(
  new_first_name text,
  rel_type text,
  target_node_id uuid,
  creator_id uuid,
  p_parent_role text DEFAULT NULL,
  p_new_node_id uuid DEFAULT NULL,
  p_gender text DEFAULT NULL
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

  SELECT paternal_family_cluster, gender INTO target_cluster, target_gender
  FROM public.nodes WHERE id = v_target;

  -- The anchor is the parent of a new child, so its gender gives the role.
  IF rel_type = 'child' THEN
    v_parent_role := COALESCE(v_parent_role, parent_role_for_gender(target_gender));
  END IF;

  IF rel_type = 'child' AND v_parent_role IS NOT NULL THEN
    SELECT CASE
      WHEN l.source_node_id = v_target THEN l.target_node_id
      ELSE l.source_node_id
    END INTO spouse_id
    FROM public.links l
    WHERE l.type = 'marriage'
      AND (l.source_node_id = v_target OR l.target_node_id = v_target)
    LIMIT 1;

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

ALTER FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_relative_secure(text, text, uuid, uuid, text, uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. FUNCTION: link_existing_relative_secure
-- Supersedes 20260826120000_lin64_write_seam_return_contract.sql. Same
-- signature, same gates, same return shape. One change: the `child` duplicate
-- guard no longer compares `parent_role`. A parent link to the same child is
-- the same Kinship Link whatever its role, and with roles now filled in from
-- gender the old comparison would miss it and write a duplicate.
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
