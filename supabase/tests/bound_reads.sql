-- =============================================================================
-- bound-reads: checks that only a bound account or an admin reads family data
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

-- claim_invite_secure reads these two; the plain-Postgres stub leaves them out.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;

-- Ids: aaa1 = bound member, ad01 = bound admin, ad02 = admin with node_id NULL,
-- bbb1 = no public.users row, bbb2 = node_id NULL, ccc1 = no row until it claims.
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000aaa1'),
  ('00000000-0000-0000-0000-00000000ad01'),
  ('00000000-0000-0000-0000-00000000ad02'),
  ('00000000-0000-0000-0000-00000000bbb1'),
  ('00000000-0000-0000-0000-00000000bbb2'),
  ('00000000-0000-0000-0000-00000000ccc1');

INSERT INTO public.nodes (id, first_name, paternal_family_cluster) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Fadi', 'Badran'),
  ('00000000-0000-0000-0000-0000000000e1', 'Ebtisam', 'Kutob'),
  ('00000000-0000-0000-0000-0000000000c1', 'Ali', 'Badran'),
  ('00000000-0000-0000-0000-0000000000c2', 'Celine', 'Badran'),
  ('00000000-0000-0000-0000-0000000000c3', 'Seif', 'Badran');

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
    INSERT INTO reads SELECT u, 'claimed', cardinality(public.get_claimed_node_ids());
    INSERT INTO reads SELECT u, 'metrics', (public.get_public_metrics() ->> 'individuals')::bigint;
    INSERT INTO reads SELECT u, 'invite', (public.get_invite_by_token('tok-claim') IS NOT NULL)::int;
    RESET ROLE;
  END LOOP;
END $$;

SELECT * FROM reads ORDER BY who, path;

CREATE FUNCTION pg_temp.seen(p_who text, p_path text) RETURNS bigint
LANGUAGE sql STABLE
AS $$ SELECT seen FROM reads WHERE who = p_who AND path = p_path $$;

-- An account that is neither bound nor an admin reads no family data.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['bbb1', 'bbb2'] LOOP
    ASSERT pg_temp.seen(u, 'nodes') = 0, u || ' should read 0 nodes, read ' || pg_temp.seen(u, 'nodes');
    ASSERT pg_temp.seen(u, 'links') = 0, u || ' should read 0 links, read ' || pg_temp.seen(u, 'links');
    ASSERT pg_temp.seen(u, 'claimed') = 0, u || ' should get no claimed ids, got ' || pg_temp.seen(u, 'claimed');
  END LOOP;
END $$;

-- A bound member and both admins read every row and every claimed id. The two
-- bound accounts hold the two claimed Persons.
DO $$
DECLARE
  u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['aaa1', 'ad01', 'ad02'] LOOP
    ASSERT pg_temp.seen(u, 'nodes') = 5, u || ' should read 5 nodes, read ' || pg_temp.seen(u, 'nodes');
    ASSERT pg_temp.seen(u, 'links') = 3, u || ' should read 3 links, read ' || pg_temp.seen(u, 'links');
    ASSERT pg_temp.seen(u, 'claimed') = 2, u || ' should get 2 claimed ids, got ' || pg_temp.seen(u, 'claimed');
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
-- bound to f1, so c1 is a child and c3 is outside the network until linked.
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
  v_new := (created ->> 'node_id')::uuid;
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
  ASSERT linked IS NOT NULL AND (linked ->> 'success') IS DISTINCT FROM 'false', 'link_existing_relative_secure should link: ' || coalesce(linked::text, 'NULL');
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
  edited bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bbb2","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  WITH upd AS (
    UPDATE public.nodes SET first_name = 'Forged'
    WHERE id = '00000000-0000-0000-0000-0000000000f1'
    RETURNING id
  )
  SELECT count(*) INTO edited FROM upd;
  RESET ROLE;
  ASSERT edited = 0, 'bbb2 should edit no Person, edited ' || edited;
END $$;

SELECT 'bound_reads: all checks passed' AS result;

ROLLBACK;
