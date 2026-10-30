-- =============================================================================
-- bound-reads: only a bound account or an admin reads Persons and Kinship Links
-- (ADR 0013, Amendments).
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
-- 3. links_parent_role_follows_gender is a SECURITY DEFINER BEFORE trigger, so its
--    error reached anon and unbound accounts before RLS refused the write, and
--    gave a known id's first name and gender. It now refuses them first, with
--    RLS's own error, including a write a SECURITY DEFINER function makes for them.
-- 4. A database that has drifted from the migrations could keep the gap open and
--    still exit 0. The last step fails the migration on the drifts it lists, on each
--    database it runs on. Other drift, such as a redefined is_bound(), still exits 0.
--
-- Unchanged: get_public_metrics, get_invite_by_token and claim_invite_secure are
-- SECURITY DEFINER, as are the write functions and triggers that read nodes and
-- links, and run as the table owner, which RLS does not apply to (the last step
-- checks this). Each account still reads its own users row through
-- users_select_own_or_admin.
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

-- -----------------------------------------------------------------------------
-- 3. TRIGGER on links: a parent link's role follows the parent's gender.
-- Supersedes 20261001130000_lin76_person_gender.sql. One change: the first check
-- gives anon and unbound accounts RLS's own refusal, so it is the same for every id.
-- It also stops a SECURITY DEFINER function, which RLS does not, when an admin
-- unbinds the caller after the function's own check. The role setting, because
-- current_user is postgres in here.
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
  IF current_setting('role', true) IN ('anon', 'authenticated') AND NOT (is_admin() OR is_bound()) THEN
    RAISE EXCEPTION 'new row violates row-level security policy for table "links"' USING ERRCODE = '42501';
  END IF;

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

-- -----------------------------------------------------------------------------
-- 4. CHECK: the database matches what this migration relies on
-- Fails the migration, on each database it runs on, for each drift below that
-- would leave the gap open or the SECURITY DEFINER functions subject to the new
-- policies. A failed run rolls back, so the old policies stay until it is cleared.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_found text;
BEGIN
  SELECT string_agg(format('%I on %I', pol.polname, c.relname), ', ') INTO v_found
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  WHERE c.oid IN ('public.nodes'::regclass, 'public.links'::regclass)
    AND pol.polpermissive
    AND pol.polcmd IN ('r', '*')
    AND pol.polname <> c.relname || '_select_bound_or_admin';
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'bound-reads: other permissive read policies: %', v_found;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_found
  FROM pg_class c
  WHERE c.oid IN ('public.nodes'::regclass, 'public.links'::regclass)
    AND NOT c.relrowsecurity;
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'bound-reads: row level security is off on: %', v_found;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_found
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'get_claimed_node_ids'
    AND p.oid <> 'public.get_claimed_node_ids()'::regprocedure;
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'bound-reads: other overloads of get_claimed_node_ids: %', v_found;
  END IF;

  SELECT string_agg(format('%s owned by %s', p.oid::regprocedure, p.proowner::regrole), ', ') INTO v_found
  FROM pg_proc p
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef
    AND NOT r.rolbypassrls
    AND EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid IN ('public.nodes'::regclass, 'public.links'::regclass)
        AND (c.relowner <> p.proowner OR c.relforcerowsecurity)
    );
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'bound-reads: SECURITY DEFINER functions subject to RLS on nodes or links: %', v_found;
  END IF;
END $$;
