-- =============================================================================
-- bound-reads: checks that only a bound account or an admin reads Persons and
-- Kinship Links
-- =============================================================================
-- Runs against a database where the bound-reads migration has been applied, as
-- a superuser (postgres). Everything happens inside one transaction that is
-- rolled back, so it leaves no rows behind. A failed check stops with an error
-- that names it; success prints "bound_reads: all checks passed".
--
-- Local Supabase stack:   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bound_reads.sql
-- Plain Postgres (no Supabase): first run supabase/tests/stub_supabase_auth.sql,
-- then every schema migration, then this file. Never run it against dev or prod.
-- =============================================================================

BEGIN;

-- Ids: aaa1 = bound account, ad01 = bound admin, ad02 = admin with node_id NULL,
-- bbb1 = no public.users row, bbb2 = node_id NULL, ccc1 = no row until it claims.
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000aaa1'),
  ('00000000-0000-0000-0000-00000000ad01'),
  ('00000000-0000-0000-0000-00000000ad02'),
  ('00000000-0000-0000-0000-00000000bbb1'),
  ('00000000-0000-0000-0000-00000000bbb2'),
  ('00000000-0000-0000-0000-00000000ccc1');

INSERT INTO public.nodes (id, first_name, paternal_family_cluster, gender) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Fadi', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000e1', 'Ebtisam', 'Kutob', NULL),
  ('00000000-0000-0000-0000-0000000000c1', 'Ali', 'Badran', NULL),
  ('00000000-0000-0000-0000-0000000000c2', 'Celine', 'Badran', NULL),
  ('00000000-0000-0000-0000-0000000000c3', 'Seif', 'Badran', NULL);

INSERT INTO public.links (source_node_id, target_node_id, type) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'marriage'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'parent'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'parent');

INSERT INTO public.users (id, node_id, role) VALUES
  ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-0000000000f1', 'user'),
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000e1', 'admin'),
  ('00000000-0000-0000-0000-00000000ad02', NULL, 'admin'),
  ('00000000-0000-0000-0000-00000000bbb2', NULL, 'user');

INSERT INTO public.node_invites (node_id, token, expires_at, created_by_user_id) VALUES
  ('00000000-0000-0000-0000-0000000000c3', 'tok-claim', now() + interval '1 day', '00000000-0000-0000-0000-00000000aaa1');

CREATE TEMP TABLE reads (who text, path text, seen bigint);
GRANT ALL ON reads TO authenticated;
CREATE TEMP TABLE claimed (who text, ids uuid[]);
GRANT ALL ON claimed TO authenticated;

-- What each account reads, recorded while acting as that account.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['aaa1', 'ad01', 'ad02', 'bbb1', 'bbb2'] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000' || u, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO reads SELECT u, 'nodes', count(*) FROM public.nodes;
    INSERT INTO reads SELECT u, 'links', count(*) FROM public.links;
    INSERT INTO reads SELECT u, 'users', count(*) FROM public.users;
    INSERT INTO claimed SELECT u, ARRAY(SELECT x FROM unnest(public.get_claimed_node_ids()) x ORDER BY x);
    INSERT INTO reads SELECT u, 'metrics', (public.get_public_metrics() ->> 'individuals')::bigint;
    INSERT INTO reads SELECT u, 'invite', (public.get_invite_by_token('tok-claim') IS NOT NULL)::int;
    RESET ROLE;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.seen(p_who text, p_path text) RETURNS bigint
LANGUAGE sql STABLE
AS $$ SELECT seen FROM reads WHERE who = p_who AND path = p_path $$;

-- An account that is neither bound nor an admin reads no Persons or Kinship Links.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['bbb1', 'bbb2'] LOOP
    ASSERT pg_temp.seen(u, 'nodes') = 0, u || ' should read 0 nodes, read ' || pg_temp.seen(u, 'nodes');
    ASSERT pg_temp.seen(u, 'links') = 0, u || ' should read 0 links, read ' || pg_temp.seen(u, 'links');
    ASSERT (SELECT ids FROM claimed WHERE who = u) = '{}'::uuid[], u || ' should get no claimed ids, got ' || (SELECT ids FROM claimed WHERE who = u)::text;
  END LOOP;
END $$;

-- A bound account and both admins read every row and every claimed id. The two
-- bound accounts hold the two claimed Persons, f1 and e1.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['aaa1', 'ad01', 'ad02'] LOOP
    ASSERT pg_temp.seen(u, 'nodes') = 5, u || ' should read 5 nodes, read ' || pg_temp.seen(u, 'nodes');
    ASSERT pg_temp.seen(u, 'links') = 3, u || ' should read 3 links, read ' || pg_temp.seen(u, 'links');
    ASSERT (SELECT ids FROM claimed WHERE who = u) = ARRAY['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1']::uuid[],
      u || ' should get e1 and f1 as claimed ids, got ' || (SELECT ids FROM claimed WHERE who = u)::text;
  END LOOP;
END $$;

-- The public counts and the invite lookup behave the same for every account.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['aaa1', 'ad01', 'ad02', 'bbb1', 'bbb2'] LOOP
    ASSERT pg_temp.seen(u, 'metrics') = 5, u || ' should count 5 individuals, counted ' || pg_temp.seen(u, 'metrics');
    ASSERT pg_temp.seen(u, 'invite') = 1, u || ' should find the invite by its token';
  END LOOP;
END $$;

-- Each account still reads its own users row while unbound. An admin reads all
-- four, and an account with no row has none to read.
DO $$
BEGIN
  ASSERT pg_temp.seen('bbb2', 'users') = 1, 'bbb2 should read its own users row';
  ASSERT pg_temp.seen('bbb1', 'users') = 0, 'bbb1 has no users row to read';
  ASSERT pg_temp.seen('aaa1', 'users') = 1, 'aaa1 should read only its own users row';
  ASSERT pg_temp.seen('ad02', 'users') = 4, 'ad02 should read all 4 users rows';
END $$;

-- anon: no claimed ids, no rows, and the public counts and invite lookup as before.
DO $$
DECLARE
  refused boolean := false;
  n bigint;
  m bigint;
  invite_found boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.get_claimed_node_ids();
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  SELECT count(*) INTO n FROM public.nodes;
  SELECT count(*) + n INTO n FROM public.links;
  m := (public.get_public_metrics() ->> 'individuals')::bigint;
  invite_found := public.get_invite_by_token('tok-claim') IS NOT NULL;
  RESET ROLE;
  ASSERT refused, 'anon should not run get_claimed_node_ids';
  ASSERT n = 0, 'anon should read no nodes or links';
  ASSERT m = 5, 'anon should count 5 individuals';
  ASSERT invite_found, 'anon should find the invite by its token';
END $$;

CREATE FUNCTION pg_temp.attempt(p_role text, p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
  ended text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000' || p_sub, 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    ended := n || ' rows';
  EXCEPTION WHEN OTHERS THEN
    ended := SQLSTATE || ': ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN ended;
END;
$$;

-- No trigger on nodes or links tells anon or an unbound account anything about a
-- Person: a real id, with a gender (f1) or without (c1), ends the same way as an
-- id that is no Person.
DO $$
DECLARE
  caller text[];
  probe text;
  person text;
  unknown_ended text;
  ended text;
BEGIN
  FOREACH caller SLICE 1 IN ARRAY ARRAY[['anon', NULL], ['authenticated', 'bbb1'], ['authenticated', 'bbb2']] LOOP
    FOREACH probe IN ARRAY ARRAY[
      $q$INSERT INTO public.links (source_node_id, target_node_id, type, parent_role) VALUES (%L, '00000000-0000-0000-0000-0000000000c2', 'parent', 'mother')$q$,
      $q$INSERT INTO public.links (source_node_id, target_node_id, type) VALUES (%L, '00000000-0000-0000-0000-0000000000c2', 'parent')$q$,
      $q$UPDATE public.links SET parent_role = 'mother' WHERE source_node_id = %L$q$,
      $q$UPDATE public.nodes SET gender = 'female' WHERE id = %L$q$,
      $q$UPDATE public.nodes SET paternal_family_cluster = 'Forged' WHERE id = %L$q$,
      $q$INSERT INTO public.nodes (id, first_name) VALUES (%L, 'Forged')$q$,
      $q$INSERT INTO public.nodes (id, first_name) VALUES (%L, 'Forged') ON CONFLICT (id) DO NOTHING$q$
    ] LOOP
      unknown_ended := pg_temp.attempt(caller[1], caller[2], format(probe, '11111111-1111-4111-8111-111111111111'));
      FOREACH person IN ARRAY ARRAY['00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1'] LOOP
        ended := pg_temp.attempt(caller[1], caller[2], format(probe, person));
        ASSERT ended = unknown_ended,
          caller[1] || ' ' || COALESCE(caller[2], '') || ' can tell ' || person || ' from an unknown id: "' || ended || '" against "' || unknown_ended || '" on ' || probe;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  caller text[];
  ended text;
BEGIN
  FOREACH caller SLICE 1 IN ARRAY ARRAY[['authenticated', 'aaa1'], ['authenticated', 'ad01'], ['authenticated', 'ad02'], ['service_role', NULL]] LOOP
    ended := pg_temp.attempt(caller[1], caller[2],
      $q$INSERT INTO public.links (source_node_id, target_node_id, type, parent_role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'parent', 'mother')$q$);
    ASSERT ended = 'P0001: Fadi is recorded as male, so they can only be a father here, not a mother.',
      caller[1] || ' ' || COALESCE(caller[2], '') || ' should get the gender error, got "' || ended || '"';
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.write_as_owner(p_sql text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$ BEGIN EXECUTE p_sql; END; $$;

-- RLS does not stop a SECURITY DEFINER function, as when an admin unbinds the
-- caller after the function's own check. The trigger still refuses these callers,
-- whether the role is wrong or right, and on the path a gender edit takes.
DO $$
DECLARE
  caller text[];
  write text;
  ended text;
  links_before bigint;
  links_after bigint;
BEGIN
  INSERT INTO public.links (source_node_id, target_node_id, type) VALUES
    ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 'parent');
  SELECT count(*) INTO links_before FROM public.links;
  FOREACH caller SLICE 1 IN ARRAY ARRAY[['anon', NULL], ['authenticated', 'bbb1'], ['authenticated', 'bbb2']] LOOP
    FOREACH write IN ARRAY ARRAY[
      $q$INSERT INTO public.links (source_node_id, target_node_id, type, parent_role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'parent', 'mother')$q$,
      $q$INSERT INTO public.links (source_node_id, target_node_id, type, parent_role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'parent', 'father')$q$,
      $q$INSERT INTO public.links (source_node_id, target_node_id, type) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'parent')$q$,
      $q$INSERT INTO public.links (source_node_id, target_node_id, type) VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 'marriage')$q$,
      $q$UPDATE public.links SET parent_role = 'mother' WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND type = 'parent'$q$,
      $q$UPDATE public.nodes SET gender = 'male' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$
    ] LOOP
      ended := pg_temp.attempt(caller[1], caller[2], format('SELECT pg_temp.write_as_owner(%L)', write));
      ASSERT ended = '42501: new row violates row-level security policy for table "links"',
        caller[1] || ' ' || COALESCE(caller[2], '') || ' should be refused, got "' || ended || '" on ' || write;
    END LOOP;
  END LOOP;
  SELECT count(*) INTO links_after FROM public.links;
  ASSERT links_after = links_before, 'a refused write should store no link, links went from ' || links_before || ' to ' || links_after;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.links
    WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND parent_role IS DISTINCT FROM 'father' AND type = 'parent'
  ), 'a refused write should change no parent role';
  DELETE FROM public.links WHERE source_node_id = '00000000-0000-0000-0000-0000000000c1';
END $$;

-- Everyone who may read the Person still stores a correct role, directly or through
-- a SECURITY DEFINER function, and a missing role is still filled in.
DO $$
DECLARE
  caller text[];
  write text;
  ended text;
BEGIN
  FOREACH caller SLICE 1 IN ARRAY ARRAY[['authenticated', 'aaa1'], ['authenticated', 'ad01'], ['authenticated', 'ad02'], ['service_role', NULL]] LOOP
    FOREACH write IN ARRAY ARRAY[
      $q$INSERT INTO public.links (source_node_id, target_node_id, type, parent_role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'parent', 'father')$q$,
      $q$INSERT INTO public.links (source_node_id, target_node_id, type) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'parent')$q$
    ] LOOP
      ended := pg_temp.attempt(caller[1], caller[2], write);
      ASSERT ended = '1 rows', caller[1] || ' ' || COALESCE(caller[2], '') || ' should store the link, got "' || ended || '" on ' || write;
      ASSERT (SELECT parent_role FROM public.links WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND target_node_id = '00000000-0000-0000-0000-0000000000e1' AND type = 'parent') = 'father',
        caller[1] || ' ' || COALESCE(caller[2], '') || ' should store the role father on ' || write;
      DELETE FROM public.links WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND target_node_id = '00000000-0000-0000-0000-0000000000e1' AND type = 'parent';

      ended := pg_temp.attempt(caller[1], caller[2], format('SELECT pg_temp.write_as_owner(%L)', write));
      ASSERT ended = '1 rows', caller[1] || ' ' || COALESCE(caller[2], '') || ' should store the link through a SECURITY DEFINER function, got "' || ended || '" on ' || write;
      ASSERT (SELECT parent_role FROM public.links WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND target_node_id = '00000000-0000-0000-0000-0000000000e1' AND type = 'parent') = 'father',
        caller[1] || ' ' || COALESCE(caller[2], '') || ' should store the role father through a SECURITY DEFINER function on ' || write;
      DELETE FROM public.links WHERE source_node_id = '00000000-0000-0000-0000-0000000000f1' AND target_node_id = '00000000-0000-0000-0000-0000000000e1' AND type = 'parent';
    END LOOP;
  END LOOP;
END $$;

-- An unbound account that claims an invite is bound: it reads everything at once.
DO $$
DECLARE
  claim json;
  nodes_before bigint;
  nodes_after bigint;
  links_after bigint;
  claimed_after bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ccc1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO nodes_before FROM public.nodes;
  claim := public.claim_invite_secure('tok-claim', '00000000-0000-0000-0000-00000000ccc1');
  SELECT count(*) INTO nodes_after FROM public.nodes;
  SELECT count(*) INTO links_after FROM public.links;
  claimed_after := cardinality(public.get_claimed_node_ids());
  RESET ROLE;
  ASSERT nodes_before = 0, 'ccc1 should read 0 nodes before claiming, read ' || nodes_before;
  ASSERT (claim ->> 'success')::boolean, 'ccc1 should claim the invite: ' || claim::text;
  ASSERT claim ->> 'node_id' = '00000000-0000-0000-0000-0000000000c3', 'the claim should bind ccc1 to the invited Person';
  ASSERT nodes_after = 5, 'ccc1 should read 5 nodes after claiming, read ' || nodes_after;
  ASSERT links_after = 3, 'ccc1 should read 3 links after claiming, read ' || links_after;
  ASSERT claimed_after = 3, 'ccc1 should get 3 claimed ids after claiming, got ' || claimed_after;
END $$;

-- The write seam still works for a bound non-admin once reads are narrowed: the
-- RPCs, a direct edit of a 1-degree Person, and the triggers those fire. aaa1 is
-- bound to f1, so c1 is a child.
DO $$
DECLARE
  created json;
  linked json;
  edited bigint;
  v_new uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aaa1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  created := public.create_relative_secure(
    'Nour', 'child', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaa1', 'father', NULL, 'female'
  );
  v_new := (created ->> 'new_node_id')::uuid;
  linked := public.link_existing_relative_secure(
    '00000000-0000-0000-0000-0000000000c2', 'child', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaa1'
  );
  WITH upd AS (
    UPDATE public.nodes SET first_name = 'Alia', gender = 'female'
    WHERE id = '00000000-0000-0000-0000-0000000000c1'
    RETURNING id
  )
  SELECT count(*) INTO edited FROM upd;
  RESET ROLE;
  ASSERT v_new IS NOT NULL, 'create_relative_secure should create a Person: ' || created::text;
  ASSERT (linked ->> 'success')::boolean, 'link_existing_relative_secure should link: ' || linked::text;
  ASSERT edited = 1, 'aaa1 should edit a 1-degree Person, edited ' || edited;
  ASSERT EXISTS (SELECT 1 FROM public.nodes WHERE id = v_new AND first_name = 'Nour'), 'the created Person should exist';
  ASSERT EXISTS (
    SELECT 1 FROM public.links
    WHERE source_node_id = '00000000-0000-0000-0000-0000000000e1'
      AND target_node_id = '00000000-0000-0000-0000-0000000000c2'
      AND type = 'parent'
  ), 'the parent link to the existing child should exist';
END $$;

-- The same writes stay refused for an unbound account.
DO $$
DECLARE
  u text;
  caller uuid;
  created json;
  linked json;
  edited bigint;
BEGIN
  FOREACH u IN ARRAY ARRAY['bbb1', 'bbb2'] LOOP
    caller := ('00000000-0000-0000-0000-00000000' || u)::uuid;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', caller, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    created := public.create_relative_secure(
      'Forged', 'child', '00000000-0000-0000-0000-0000000000f1', caller, 'father', NULL, 'female'
    );
    linked := public.link_existing_relative_secure(
      '00000000-0000-0000-0000-0000000000c3', 'child', '00000000-0000-0000-0000-0000000000f1', caller
    );
    WITH upd AS (
      UPDATE public.nodes SET first_name = 'Forged'
      WHERE id = '00000000-0000-0000-0000-0000000000f1'
      RETURNING id
    )
    SELECT count(*) INTO edited FROM upd;
    RESET ROLE;
    ASSERT created ->> 'message' = 'Unauthorized', u || ' should not create a Person: ' || created::text;
    ASSERT linked ->> 'message' = 'Unauthorized', u || ' should not link a Person: ' || linked::text;
    ASSERT edited = 0, u || ' should edit no Person, edited ' || edited;
  END LOOP;
  ASSERT NOT EXISTS (SELECT 1 FROM public.nodes WHERE first_name = 'Forged'), 'no refused write should leave a Person';
END $$;

SELECT 'bound_reads: all checks passed' AS result;

ROLLBACK;
