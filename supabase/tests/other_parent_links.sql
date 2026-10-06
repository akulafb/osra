-- =============================================================================
-- LIN-79: checks that adding a child links both parents (ADR 0012), through
-- create_relative_secure and link_existing_relative_secure's p_other_parent_id
-- =============================================================================
-- Runs against a database where the LIN-76 and LIN-79 migrations have been
-- applied, as a superuser (postgres). Everything happens inside one transaction
-- that is rolled back, so it leaves no rows behind. A failed check stops with
-- an error that names it; success prints "other_parent_links: all checks passed".
--
-- Local Supabase stack:   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/other_parent_links.sql
-- Plain Postgres (no Supabase): first run supabase/tests/stub_supabase_auth.sql,
-- then every schema migration, then this file. Never run it against dev or prod.
-- =============================================================================

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000ad01'),
  ('00000000-0000-0000-0000-00000000ad02');

-- Ids: f = father, e = mother, c = child.
INSERT INTO public.nodes (id, first_name, paternal_family_cluster, gender) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Fadi', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000e1', 'Ebtisam', 'Kutob', 'female'),
  ('00000000-0000-0000-0000-0000000000c1', 'Ali', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000c2', 'Celine', 'Badran', 'female'),
  ('00000000-0000-0000-0000-0000000000f2', 'Hisham', 'Shaban', 'male'),
  ('00000000-0000-0000-0000-0000000000e2', 'Hala', 'Badran', 'female'),
  ('00000000-0000-0000-0000-0000000000f3', 'Karim', 'Qasim', 'male'),
  ('00000000-0000-0000-0000-0000000000e3', 'Mona', 'Aziz', 'female'),
  ('00000000-0000-0000-0000-0000000000e4', 'Rasha', 'Najjar', 'female'),
  ('00000000-0000-0000-0000-0000000000f5', 'Yusuf', 'Haddad', 'male'),
  ('00000000-0000-0000-0000-0000000000e5', 'Huda', 'Mansour', 'female');

INSERT INTO public.users (id, node_id, role) VALUES
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000f2', 'admin'),
  ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-0000000000f1', 'user');

INSERT INTO public.links (source_node_id, target_node_id, type) VALUES
  -- Fadi married Ebtisam, his only spouse.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'marriage'),
  -- Celine is linked to her mother Ebtisam only.
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'parent'),
  -- Hisham and Hala divorced.
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f2', 'divorce'),
  -- Karim married Mona, then Rasha.
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', 'marriage'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f3', 'marriage'),
  -- Huda's only spouse is Yusuf.
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000f5', 'marriage');

-- ---------------------------------------------------------------------------
-- Called as the authenticated role, the way PostgREST calls them, by argument
-- name: an overload left behind would make these calls ambiguous.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_claims text := '{"sub": "00000000-0000-0000-0000-00000000ad01", "role": "authenticated"}';
  user_claims text := '{"sub": "00000000-0000-0000-0000-00000000ad02", "role": "authenticated"}';
  admin_id uuid := '00000000-0000-0000-0000-00000000ad01';
  user_id uuid := '00000000-0000-0000-0000-00000000ad02';
  fadi uuid := '00000000-0000-0000-0000-0000000000f1';
  ebtisam uuid := '00000000-0000-0000-0000-0000000000e1';
  ali uuid := '00000000-0000-0000-0000-0000000000c1';
  celine uuid := '00000000-0000-0000-0000-0000000000c2';
  hisham uuid := '00000000-0000-0000-0000-0000000000f2';
  hala uuid := '00000000-0000-0000-0000-0000000000e2';
  karim uuid := '00000000-0000-0000-0000-0000000000f3';
  rasha uuid := '00000000-0000-0000-0000-0000000000e4';
  yusuf uuid := '00000000-0000-0000-0000-0000000000f5';
  huda uuid := '00000000-0000-0000-0000-0000000000e5';
  r jsonb;
  child uuid;
  links_before integer;
  v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims', admin_claims, true);

  -- A child of a father, with his only spouse: both links, roles from gender.
  r := public.create_relative_secure(
    new_first_name => 'Dalia', rel_type => 'child', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT (r ->> 'success')::boolean, format('adding Dalia to Fadi and Ebtisam should succeed: %s', r);
  ASSERT jsonb_array_length(r -> 'links') = 2, format('both parent links reported: %s', r);
  child := (r ->> 'new_node_id')::uuid;
  SELECT parent_role INTO v_role FROM public.links WHERE type = 'parent' AND source_node_id = fadi AND target_node_id = child;
  ASSERT v_role = 'father', format('Fadi''s link to Dalia should be father, got %s', v_role);
  SELECT parent_role INTO v_role FROM public.links WHERE type = 'parent' AND source_node_id = ebtisam AND target_node_id = child;
  ASSERT v_role = 'mother', format('Ebtisam''s link to Dalia should be mother, got %s', v_role);
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r -> 'links') l
    WHERE l ->> 'source_node_id' = ebtisam::text AND l ->> 'parent_role' = 'mother'
  ), format('the other parent''s link is reported with its role: %s', r);

  -- The other direction: a child of a mother links the father.
  r := public.create_relative_secure(
    new_first_name => 'Omar', rel_type => 'child', target_node_id => huda, creator_id => admin_id,
    p_other_parent_id => yusuf
  )::jsonb;
  ASSERT (r ->> 'success')::boolean, format('adding Omar to Huda and Yusuf should succeed: %s', r);
  child := (r ->> 'new_node_id')::uuid;
  SELECT parent_role INTO v_role FROM public.links WHERE type = 'parent' AND source_node_id = yusuf AND target_node_id = child;
  ASSERT v_role = 'father', format('Yusuf''s link to Omar should be father, got %s', v_role);
  ASSERT r -> 'nodes' -> 0 ->> 'paternal_family_cluster' = 'Haddad', format('Omar''s paternal cluster is Yusuf''s: %s', r);

  -- A former spouse may be named, and the named one gives the cluster fields.
  r := public.create_relative_secure(
    new_first_name => 'Zeina', rel_type => 'child', target_node_id => hala, creator_id => admin_id,
    p_other_parent_id => hisham
  )::jsonb;
  ASSERT (r ->> 'success')::boolean AND jsonb_array_length(r -> 'links') = 2,
    format('Hala''s former husband may be named: %s', r);
  r := public.create_relative_secure(
    new_first_name => 'Jad', rel_type => 'child', target_node_id => karim, creator_id => admin_id,
    p_other_parent_id => rasha
  )::jsonb;
  ASSERT r -> 'nodes' -> 0 ->> 'maternal_family_cluster' = 'Najjar',
    format('Jad''s maternal cluster is the named Rasha''s, not Mona''s: %s', r);

  -- No other parent: one link, as before.
  r := public.create_relative_secure(
    new_first_name => 'Sami', rel_type => 'child', target_node_id => fadi, creator_id => admin_id
  )::jsonb;
  ASSERT (r ->> 'success')::boolean AND jsonb_array_length(r -> 'links') = 1, format('one link without an other parent: %s', r);

  -- Someone who is not the anchor's spouse is refused, and no Person is left.
  r := public.create_relative_secure(
    new_first_name => 'Nobody', rel_type => 'child', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => huda
  )::jsonb;
  ASSERT NOT (r ->> 'success')::boolean, format('Huda is not Fadi''s spouse: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.nodes WHERE first_name = 'Nobody'), 'a refused call leaves no Person';

  -- A failure after the Person is inserted (here the role trigger, on the
  -- anchor's link) rolls the Person back too.
  r := public.create_relative_secure(
    new_first_name => 'Rami', rel_type => 'child', target_node_id => ebtisam, creator_id => admin_id,
    p_parent_role => 'father', p_other_parent_id => fadi
  )::jsonb;
  ASSERT NOT (r ->> 'success')::boolean, format('a father role for Ebtisam should be refused: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.nodes WHERE first_name = 'Rami'), 'a failed call leaves no Person';

  -- An other parent with any relation but child is refused.
  r := public.create_relative_secure(
    new_first_name => 'Nadia', rel_type => 'spouse', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT NOT (r ->> 'success')::boolean, format('an other parent for a spouse should be refused: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.nodes WHERE first_name = 'Nadia'), 'nothing written for a refused spouse';
  r := public.link_existing_relative_secure(
    existing_node_id => ali, rel_type => 'spouse', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT NOT (r ->> 'success')::boolean, format('an other parent when linking a spouse should be refused: %s', r);

  -- An existing child: both links in one call.
  SELECT count(*) INTO links_before FROM public.links;
  r := public.link_existing_relative_secure(
    existing_node_id => ali, rel_type => 'child', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT (r ->> 'success')::boolean AND NOT (r ->> 'already_connected')::boolean, format('linking Ali should succeed: %s', r);
  ASSERT jsonb_array_length(r -> 'links') = 2, format('both of Ali''s parent links reported: %s', r);
  ASSERT (SELECT count(*) FROM public.links) = links_before + 2, 'two links written for Ali';
  SELECT parent_role INTO v_role FROM public.links WHERE type = 'parent' AND source_node_id = ebtisam AND target_node_id = ali;
  ASSERT v_role = 'mother', format('Ebtisam''s link to Ali should be mother, got %s', v_role);

  -- Linking again is already connected, and writes nothing.
  r := public.link_existing_relative_secure(
    existing_node_id => ali, rel_type => 'child', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT (r ->> 'already_connected')::boolean AND jsonb_array_length(r -> 'links') = 0, format('Ali is already connected: %s', r);
  ASSERT (SELECT count(*) FROM public.links) = links_before + 2, 'nothing more written for Ali';

  -- The other parent's link already exists: only the anchor's is written.
  r := public.link_existing_relative_secure(
    existing_node_id => celine, rel_type => 'child', target_node_id => fadi, creator_id => admin_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT (r ->> 'success')::boolean AND jsonb_array_length(r -> 'links') = 1, format('only Fadi''s link to Celine is new: %s', r);
  ASSERT (SELECT count(*) FROM public.links WHERE type = 'parent' AND target_node_id = celine) = 2, 'Celine has two parent links';

  -- Not a spouse, for an existing child: refused, nothing written.
  SELECT count(*) INTO links_before FROM public.links;
  r := public.link_existing_relative_secure(
    existing_node_id => ali, rel_type => 'child', target_node_id => karim, creator_id => admin_id,
    p_other_parent_id => huda
  )::jsonb;
  ASSERT NOT (r ->> 'success')::boolean, format('Huda is not Karim''s spouse: %s', r);
  ASSERT (SELECT count(*) FROM public.links) = links_before, 'a refused link writes nothing';

  -- A non-admin within one degree of the anchor gets both links.
  PERFORM set_config('request.jwt.claims', user_claims, true);
  r := public.create_relative_secure(
    new_first_name => 'Layla', rel_type => 'child', target_node_id => fadi, creator_id => user_id,
    p_other_parent_id => ebtisam
  )::jsonb;
  ASSERT (r ->> 'success')::boolean AND jsonb_array_length(r -> 'links') = 2, format('Fadi may add his own child with both parents: %s', r);

  -- ...and is still refused outside it, other parent or not.
  r := public.create_relative_secure(
    new_first_name => 'Outsider', rel_type => 'child', target_node_id => huda, creator_id => user_id,
    p_other_parent_id => yusuf
  )::jsonb;
  ASSERT r ->> 'message' = 'Unauthorized', format('Huda is outside Fadi''s 1-Degree Network: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.nodes WHERE first_name = 'Outsider'), 'an unauthorized call writes no Person';
  r := public.link_existing_relative_secure(
    existing_node_id => ali, rel_type => 'child', target_node_id => huda, creator_id => user_id,
    p_other_parent_id => yusuf
  )::jsonb;
  ASSERT r ->> 'message' = 'Unauthorized', format('linking under Huda is outside Fadi''s network: %s', r);
END $$;

RESET ROLE;

-- The spouse check is internal: no API role may call it.
DO $$
DECLARE
  refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.is_spouse_of('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, 'authenticated should not run is_spouse_of';
END $$;

SELECT 'other_parent_links: all checks passed' AS result;

ROLLBACK;
