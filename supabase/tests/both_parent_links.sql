-- =============================================================================
-- LIN-78: checks for fill_in_both_parent_links, the one-time fill-in that links
-- each child to both parents (ADR 0012)
-- =============================================================================
-- Runs against a database where the LIN-76 and LIN-78 migrations have been
-- applied, as a superuser (postgres). Everything happens inside one transaction
-- that is rolled back, so it leaves no rows behind. A failed check stops with
-- an error that names it; success prints "both_parent_links: all checks passed".
--
-- Local Supabase stack:   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/both_parent_links.sql
-- Plain Postgres (no Supabase): first run supabase/tests/stub_supabase_auth.sql,
-- then every schema migration, then this file. Never run it against dev or prod.
-- =============================================================================

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000ad01'),
  ('00000000-0000-0000-0000-00000000ad02');

-- Ids: f = father, m = mother, c = child, x = other.
INSERT INTO public.nodes (id, first_name, paternal_family_cluster, gender) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Fadi', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000e1', 'Ebtisam', 'Kutob', 'female'),
  ('00000000-0000-0000-0000-0000000000c1', 'Ali', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000c2', 'Celine', 'Badran', 'female'),
  ('00000000-0000-0000-0000-0000000000f2', 'Hisham', 'Shaban', 'male'),
  ('00000000-0000-0000-0000-0000000000e2', 'Hala', 'Badran', 'female'),
  ('00000000-0000-0000-0000-0000000000c3', 'Seif', 'Shaban', 'male'),
  ('00000000-0000-0000-0000-0000000000f3', 'Karim', 'Qasim', 'male'),
  ('00000000-0000-0000-0000-0000000000e3', 'Mona', 'Aziz', 'female'),
  ('00000000-0000-0000-0000-0000000000e4', 'Rasha', 'Najjar', 'female'),
  ('00000000-0000-0000-0000-0000000000c4', 'Jad', 'Qasim', 'male'),
  ('00000000-0000-0000-0000-0000000000f5', 'Yusuf', 'Haddad', 'male'),
  ('00000000-0000-0000-0000-0000000000e5', 'Huda', 'Mansour', 'female'),
  ('00000000-0000-0000-0000-0000000000c5', 'Omar', 'Haddad', 'male'),
  ('00000000-0000-0000-0000-0000000000f6', 'Bashir', 'Aziz', 'male'),
  ('00000000-0000-0000-0000-0000000000e6', 'Dana', 'Farah', NULL),
  ('00000000-0000-0000-0000-0000000000c6', 'Dina', 'Aziz', NULL),
  ('00000000-0000-0000-0000-0000000000f7', 'Walid', 'Aziz', 'male'),
  ('00000000-0000-0000-0000-0000000000c7', 'Sami', 'Aziz', 'male'),
  ('00000000-0000-0000-0000-0000000000c8', 'Nour', 'Badran', 'female'),
  ('00000000-0000-0000-0000-0000000000f9', 'Majed', 'Saleh', NULL),
  ('00000000-0000-0000-0000-0000000000e9', 'Lama', 'Saleh', 'female'),
  ('00000000-0000-0000-0000-0000000000c9', 'Tarek', 'Saleh', 'male');

INSERT INTO public.users (id, node_id, role) VALUES
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000f1', 'admin'),
  ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-0000000000c1', 'user');

INSERT INTO public.links (source_node_id, target_node_id, type) VALUES
  -- Fadi married Ebtisam, his only spouse; Ali and Celine are linked to him only.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'marriage'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'parent'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'parent'),
  -- Nour is already linked to both.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c8', 'parent'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c8', 'parent'),
  -- Hisham and Hala divorced; Seif is linked to Hisham only.
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f2', 'divorce'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c3', 'parent'),
  -- Karim married twice; Jad is linked to Karim only.
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', 'marriage'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f3', 'marriage'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c4', 'parent'),
  -- Omar is linked to his mother Huda only; her only spouse is Yusuf.
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000f5', 'marriage'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c5', 'parent'),
  -- Bashir's only spouse Dana has no gender recorded.
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e6', 'marriage'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000c6', 'parent'),
  -- Walid has no spouse recorded.
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000c7', 'parent'),
  -- Majed has no gender and his link to Tarek no role, so Lama is not assumed.
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000e9', 'marriage'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000c9', 'parent');

CREATE TEMP TABLE result (r jsonb);

DO $$
DECLARE
  admin_claims text := '{"sub": "00000000-0000-0000-0000-00000000ad01", "role": "authenticated"}';
  user_claims text := '{"sub": "00000000-0000-0000-0000-00000000ad02", "role": "authenticated"}';
  r jsonb;
  row_of jsonb;
  refused boolean;
  v_count integer;
  v_role text;
  links_before integer;
BEGIN
  SELECT count(*) INTO links_before FROM public.links;

  -- Only an admin or the service role may call it.
  PERFORM set_config('request.jwt.claims', user_claims, true);
  refused := false;
  BEGIN
    PERFORM public.fill_in_both_parent_links();
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  ASSERT refused, 'a signed-in non-admin should be refused';

  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  r := public.fill_in_both_parent_links();
  ASSERT (r ->> 'applied')::boolean = false, 'the service role may run the dry run';

  -- The dry run, as the admin.
  PERFORM set_config('request.jwt.claims', admin_claims, true);
  r := public.fill_in_both_parent_links();
  ASSERT (SELECT count(*) FROM public.links) = links_before, 'the dry run should write nothing';
  ASSERT (r -> 'counts' ->> 'will_link')::int = 3, format('three children should be linked, got %s', r -> 'will_link');
  ASSERT (r -> 'counts' ->> 'needs_a_name')::int = 5, format('five children should be on the list, got %s', r -> 'needs_a_name');
  ASSERT (r -> 'counts' ->> 'children_with_two_or_more_parents')::int = 1, 'Nour is the one child with both parents';

  -- Ali and Celine to Ebtisam as mother; Omar to Yusuf as father.
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'will_link') e WHERE e ->> 'child_name' = 'Ali Badran';
  ASSERT row_of ->> 'other_parent_name' = 'Ebtisam Kutob' AND row_of ->> 'parent_role' = 'mother'
    AND row_of ->> 'source' = 'only spouse', format('Ali should get Ebtisam as mother, got %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'will_link') e WHERE e ->> 'child_name' = 'Omar Haddad';
  ASSERT row_of ->> 'other_parent_name' = 'Yusuf Haddad' AND row_of ->> 'parent_role' = 'father',
    format('Omar, linked only to his mother, should get Yusuf as father, got %s', row_of);

  -- The questions, each with its reason and the linked parent's spouses.
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Seif Shaban';
  ASSERT row_of ->> 'reason' = 'divorced' AND row_of -> 'spouses' -> 0 ->> 'name' = 'Hala Badran',
    format('Seif should be asked about, as his parents divorced, got %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Jad Qasim';
  ASSERT row_of ->> 'reason' = 'more than one spouse' AND jsonb_array_length(row_of -> 'spouses') = 2,
    format('Jad should be asked about, with both of Karim''s spouses, got %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Dina Aziz';
  ASSERT row_of ->> 'reason' = 'the spouse has no gender recorded', format('Dina: %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Sami Aziz';
  ASSERT row_of ->> 'reason' = 'no spouse recorded', format('Sami: %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Tarek Saleh';
  ASSERT row_of ->> 'reason' = 'the linked parent has no gender recorded', format('Tarek: %s', row_of);
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r -> 'will_link') e WHERE e ->> 'child_name' IN ('Seif Shaban', 'Jad Qasim', 'Dina Aziz', 'Sami Aziz', 'Tarek Saleh', 'Nour Badran')
  ), 'nothing is assumed for a child on the list, or one with both parents';

  -- The owner names Seif's mother, and gets two names wrong.
  r := public.fill_in_both_parent_links(false, '[
    {"child_id": "00000000-0000-0000-0000-0000000000c3", "parent_id": "00000000-0000-0000-0000-0000000000e2"},
    {"child_id": "00000000-0000-0000-0000-0000000000c4", "parent_id": "00000000-0000-0000-0000-0000000000f3"},
    {"child_id": "00000000-0000-0000-0000-0000000000c7", "parent_id": "00000000-0000-0000-0000-0000000000f1"},
    {"child_id": "00000000-0000-0000-0000-0000000000c9", "parent_id": "00000000-0000-0000-0000-0000000000e9"}
  ]'::jsonb);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'will_link') e WHERE e ->> 'child_name' = 'Seif Shaban';
  ASSERT row_of ->> 'other_parent_name' = 'Hala Badran' AND row_of ->> 'source' = 'named' AND row_of ->> 'parent_role' = 'mother',
    format('the named mother should be linked, got %s', row_of);
  ASSERT (r -> 'counts' ->> 'refused_names')::int = 3, format('three names should be refused, got %s', r -> 'refused_names');
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'refused_names') e WHERE e ->> 'child_name' = 'Jad Qasim';
  ASSERT row_of ->> 'reason' = 'that Person is already the linked parent', format('Jad: %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'refused_names') e WHERE e ->> 'child_name' = 'Sami Aziz';
  ASSERT row_of ->> 'reason' = 'the named parent would be a second father', format('Sami: %s', row_of);
  SELECT e INTO row_of FROM jsonb_array_elements(r -> 'refused_names') e WHERE e ->> 'child_name' = 'Tarek Saleh';
  ASSERT row_of ->> 'reason' = 'the linked parent has no gender recorded', format('Tarek named: %s', row_of);
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'needs_a_name') e WHERE e ->> 'child_name' = 'Seif Shaban'),
    'a named child is off the list';

  -- An apply with a refused name writes nothing.
  refused := false;
  BEGIN
    PERFORM public.fill_in_both_parent_links(true, '[
      {"child_id": "00000000-0000-0000-0000-0000000000c3", "parent_id": "00000000-0000-0000-0000-0000000000e2"},
      {"child_id": "00000000-0000-0000-0000-0000000000c4", "parent_id": "00000000-0000-0000-0000-0000000000f3"}
    ]'::jsonb);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  ASSERT refused, 'an apply with a refused name should fail';
  ASSERT (SELECT count(*) FROM public.links) = links_before, 'a refused apply should write nothing';

  -- The apply, with Seif's mother named.
  r := public.fill_in_both_parent_links(true, '[
    {"child_id": "00000000-0000-0000-0000-0000000000c3", "parent_id": "00000000-0000-0000-0000-0000000000e2"}
  ]'::jsonb);
  ASSERT (r ->> 'applied')::boolean, 'the apply should say so';
  ASSERT jsonb_array_length(r -> 'inserted_link_ids') = 4, format('four links should be written, got %s', r -> 'inserted_link_ids');
  ASSERT (SELECT count(*) FROM public.links) = links_before + 4, 'four new links';

  SELECT parent_role INTO v_role FROM public.links
  WHERE type = 'parent' AND source_node_id = '00000000-0000-0000-0000-0000000000e1' AND target_node_id = '00000000-0000-0000-0000-0000000000c1';
  ASSERT v_role = 'mother', format('Ebtisam''s new link to Ali should be mother, got %s', v_role);
  SELECT parent_role INTO v_role FROM public.links
  WHERE type = 'parent' AND source_node_id = '00000000-0000-0000-0000-0000000000f5' AND target_node_id = '00000000-0000-0000-0000-0000000000c5';
  ASSERT v_role = 'father', format('Yusuf''s new link to Omar should be father, got %s', v_role);

  SELECT count(*) INTO v_count FROM public.links
  WHERE type = 'parent' AND target_node_id IN ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c7');
  ASSERT v_count = 3, 'Jad, Dina and Sami still have only their one parent';

  -- Running it again links no one twice.
  r := public.fill_in_both_parent_links(true);
  ASSERT jsonb_array_length(r -> 'inserted_link_ids') = 0, format('a second run should write nothing, got %s', r -> 'inserted_link_ids');
  ASSERT (r -> 'counts' ->> 'children_with_two_or_more_parents')::int = 5, 'Nour, Ali, Celine, Omar and Seif have both parents';
END $$;

-- No API role may call the internal plan, and anon may not call the fill-in.
DO $$
DECLARE
  refused boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  refused := false;
  BEGIN
    PERFORM * FROM public.both_parent_links_plan();
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, 'authenticated should not run both_parent_links_plan';

  SET LOCAL ROLE anon;
  refused := false;
  BEGIN
    PERFORM public.fill_in_both_parent_links();
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, 'anon should not run fill_in_both_parent_links';
END $$;

SELECT 'both_parent_links: all checks passed' AS result;

ROLLBACK;
