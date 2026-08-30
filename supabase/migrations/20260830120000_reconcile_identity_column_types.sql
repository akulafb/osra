-- =============================================================================
-- Reconcile identity column types: text -> uuid
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- Six identity columns carried different types on the two hosted databases.
-- Every one of them is declared `uuid` in `20260101_initial_schema.sql`, so dev
-- is the database that drifted, out of band, away from the committed schema:
--
--   public.users.id                        dev: text NOT NULL  prod: uuid NOT NULL
--   public.nodes.created_by_user_id        dev: text NULL      prod: uuid NULL
--   public.links.created_by_user_id        dev: text NULL      prod: uuid NULL
--   public.node_invites.created_by_user_id dev: text NULL      prod: uuid NULL
--   public.node_invites.claimed_by_user_id dev: text NULL      prod: uuid NULL
--   public.audit_log.actor_user_id         dev: text NULL      prod: uuid NULL
--
-- Migrations are authored against dev, so they were written to compare these
-- columns to text expressions (`auth.jwt() ->> 'sub'`). Applied to production
-- those comparisons are uuid = text, which Postgres rejects with
-- `42883: operator does not exist: uuid = text`. That is not a compile-time
-- error: the policy or function is created successfully and only fails when a
-- request evaluates it. One such migration took production's non-admin write
-- path down until two defensive `::text` casts were added as a stopgap:
--
--   * `nodes_insert_admin` (LIN-33) compared `created_by_user_id::text` to
--     `auth.uid()::text`. That policy was already superseded by
--     `nodes_insert_admin_only` in LIN-59, so nothing here needs to undo it.
--   * `is_within_1_degree` (LIN-59) resolved the caller into a `text` local and
--     looked the user up with `WHERE id::text = v_current_user_id`. The cast on
--     the left-hand side makes `users_pkey` unusable, forcing a sequential scan
--     inside a function that every RLS policy on nodes and links calls.
--
-- Casting at every call site is the wrong fix; a single column type is the
-- right one. This migration converges dev onto production's shape (`uuid`,
-- matching `auth.users.id`), then retires the stopgap cast so future migrations
-- no longer need to reason about two possible column types.
--
-- Every value in all six dev columns was verified to be a valid uuid before
-- this migration was written, so `USING col::uuid` cannot fail on data. The
-- columns keep their existing nullability; dev's NULL `created_by_user_id`,
-- `claimed_by_user_id` and `actor_user_id` rows survive as NULL.
--
--
-- IDEMPOTENCE
--
-- Each of the six column conversions is guarded on
-- `information_schema.columns.data_type`, so it runs only while the column is
-- still `text`. Against production, or on a second run against dev, no guard
-- fires and the file is a no-op. The policy drop/recreate pairs and the
-- `CREATE OR REPLACE FUNCTION` statements are unconditional but converge on the
-- target definition, so re-running them changes nothing.
--
--
-- POLICY DROP / RECREATE PAIRS
--
-- Postgres refuses to alter the type of a column named in an RLS policy
-- expression (`cannot alter type of a column used in a policy definition`), so
-- any such policy must be dropped and recreated around the conversion. Exactly
-- two policies across users, nodes, links, node_invites and audit_log name one
-- of the six columns. Both are recreated below, in production's shape:
--
--   DROP     users_select_own_or_admin ON public.users        -- SELECT, authenticated
--   RECREATE users_select_own_or_admin ON public.users        -- SELECT, authenticated
--       dev  had: ((id = (auth.jwt() ->> 'sub')) OR is_admin())  <- text-shaped
--       prod has: ((id = (select auth.uid())) OR is_admin())     <- target
--
--   DROP     audit_log_insert_authenticated ON public.audit_log -- INSERT, authenticated
--   RECREATE audit_log_insert_authenticated ON public.audit_log -- INSERT, authenticated
--       dev  had: (actor_user_id = (auth.jwt() ->> 'sub'))       <- text-shaped
--       prod has: (actor_user_id = auth.uid())                   <- target
--
-- No cast is needed in either recreated expression once the column is uuid.
--
-- No other policy needs touching, and none is dropped without being recreated:
--   * nodes_update_1degree_or_admin names `nodes.id`, which is already uuid.
--   * links_insert/update_1degree_or_admin name `links.source_node_id` and
--     `links.target_node_id`, already uuid and deliberately out of scope.
--   * all four node_invites policies (insert/update/delete_1degree and
--     select_1degree_or_admin) go through `can_manage_invites_for_node(node_id)`
--     and never name `created_by_user_id` or `claimed_by_user_id`, so the two
--     node_invites conversions do not block on them.
--   * audit_log_select_admin references only `is_admin()`.
--   * users_insert_blocked / users_update_admin_only / users_delete_admin_only
--     reference only `is_admin()` and `false`, so the conversion does not block
--     on them. (Those three exist on production but not on dev — a separate
--     policy-level divergence, out of scope here and not fixed by this file.)
--
-- Function bodies are not dependency-tracked by ALTER TABLE, so they never
-- block the conversion; the three below are re-emitted because their
-- comparisons would otherwise be wrong once the columns are uuid.
--
-- Constraints need no juggling: no foreign key exists on any of the six
-- columns, and node_invites' PK(id), UNIQUE(token) and FK(node_id) -> nodes(id)
-- all name columns this migration does not alter.
--
-- OUT OF SCOPE, DELIBERATELY
--   * No foreign key is added on any `created_by_user_id`.
--   * `links.source_node_id` / `links.target_node_id` are untouched.
--   * No grant is changed. In particular `20260514120000` revokes anon and
--     authenticated DML on public.audit_log; that must survive this migration,
--     so audit_log's grants are left exactly as they are.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Drop the two policies that block the conversions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_own_or_admin ON public.users;
DROP POLICY IF EXISTS audit_log_insert_authenticated ON public.audit_log;


-- -----------------------------------------------------------------------------
-- 2. Convert the six columns, each only while it is still text
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN id TYPE uuid USING id::uuid;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes'
      AND column_name = 'created_by_user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.nodes
      ALTER COLUMN created_by_user_id TYPE uuid USING created_by_user_id::uuid;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'links'
      AND column_name = 'created_by_user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.links
      ALTER COLUMN created_by_user_id TYPE uuid USING created_by_user_id::uuid;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'node_invites'
      AND column_name = 'created_by_user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.node_invites
      ALTER COLUMN created_by_user_id TYPE uuid USING created_by_user_id::uuid;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'node_invites'
      AND column_name = 'claimed_by_user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.node_invites
      ALTER COLUMN claimed_by_user_id TYPE uuid USING claimed_by_user_id::uuid;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log'
      AND column_name = 'actor_user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.audit_log
      ALTER COLUMN actor_user_id TYPE uuid USING actor_user_id::uuid;
  END IF;
END
$do$;


-- -----------------------------------------------------------------------------
-- 3. FUNCTION: is_admin
-- Compares users.id directly to auth.uid(). This is production's definition;
-- dev's used `auth.jwt() ->> 'sub'`, which is text and would break here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. FUNCTION: is_bound
-- Same convergence as is_admin: one cast-free definition for both databases.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_bound()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND node_id IS NOT NULL
  );
END;
$$;

ALTER FUNCTION public.is_bound() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_bound() TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5. FUNCTION: is_within_1_degree
-- Retires the `WHERE id::text = ...` stopgap. The caller is now resolved into a
-- uuid local and matched directly against users.id, so users_pkey is usable
-- again. The five perimeter rules below are unchanged from LIN-59.
--
-- The uuid cast on the JWT `sub` claim can raise 22P02 on a malformed subject,
-- where the old text comparison merely missed and returned FALSE. The nested
-- block preserves that outcome: a subject that is not a uuid cannot identify a
-- user, so there is no perimeter and the answer is FALSE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_within_1_degree(p_target_node_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_node_id uuid;
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := COALESCE((auth.jwt() ->> 'sub')::uuid, auth.uid());
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
  END;

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
-- 6. Recreate the two policies dropped in step 1, in production's shape
-- Recreated after the functions so that no committed state ever pairs a uuid
-- column with a function body that compares it to text.
-- -----------------------------------------------------------------------------
CREATE POLICY users_select_own_or_admin ON public.users
  FOR SELECT TO authenticated
  USING ((id = (select auth.uid())) OR is_admin());

CREATE POLICY audit_log_insert_authenticated ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());
