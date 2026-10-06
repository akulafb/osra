-- =============================================================================
-- LIN-76: checks for nodes.gender and the rule that parent_role follows it
-- =============================================================================
-- Runs against a database where the LIN-76 and LIN-79 migrations have been
-- applied, as a superuser (postgres). Everything happens inside one transaction
-- that is rolled back, so it leaves no rows behind. A failed check stops with
-- an error that names it; success prints "person_gender: all checks passed".
--
-- Local Supabase stack:   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/person_gender.sql
-- Plain Postgres (no Supabase): first run supabase/tests/stub_supabase_auth.sql,
-- then every migration, then this file. Never run it against dev or prod.
-- =============================================================================

BEGIN;

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-00000000ad01');

INSERT INTO public.nodes (id, first_name, paternal_family_cluster, gender) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Fadi', 'Badran', 'male'),
  ('00000000-0000-0000-0000-0000000000e1', 'Ebtisam', 'Kutob', 'female'),
  ('00000000-0000-0000-0000-0000000000a1', 'Ali', 'Badran', NULL),
  ('00000000-0000-0000-0000-0000000000c1', 'Celine', 'Badran', NULL),
  ('00000000-0000-0000-0000-0000000000c2', 'Cyrus', 'Badran', NULL);

INSERT INTO public.users (id, node_id, role) VALUES
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000f1', 'admin');

INSERT INTO public.links (source_node_id, target_node_id, type) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'marriage');

DO $$
DECLARE
  fadi uuid := '00000000-0000-0000-0000-0000000000f1';
  ebtisam uuid := '00000000-0000-0000-0000-0000000000e1';
  ali uuid := '00000000-0000-0000-0000-0000000000a1';
  celine uuid := '00000000-0000-0000-0000-0000000000c1';
  cyrus uuid := '00000000-0000-0000-0000-0000000000c2';
  v_role text;
  refused boolean;
BEGIN
  -- A gender outside the list is refused by the column.
  refused := false;
  BEGIN
    UPDATE public.nodes SET gender = 'other' WHERE id = ali;
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  ASSERT refused, 'a gender other than male or female should be refused';

  -- A new parent link with no role takes it from the parent's gender.
  INSERT INTO public.links (source_node_id, target_node_id, type)
  VALUES (fadi, celine, 'parent') RETURNING parent_role INTO v_role;
  ASSERT v_role = 'father', format('Fadi''s link should be father, got %s', v_role);

  -- A role that disagrees with the parent's gender is refused.
  refused := false;
  BEGIN
    INSERT INTO public.links (source_node_id, target_node_id, type, parent_role)
    VALUES (ebtisam, celine, 'parent', 'father');
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  ASSERT refused, 'a father link from a female parent should be refused';

  -- ...and so is changing an existing link's role to disagree.
  refused := false;
  BEGIN
    UPDATE public.links SET parent_role = 'mother' WHERE source_node_id = fadi AND target_node_id = celine;
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  ASSERT refused, 'changing Fadi''s link to mother should be refused';

  -- A parent with no gender recorded keeps the role as written.
  INSERT INTO public.links (source_node_id, target_node_id, type)
  VALUES (ali, cyrus, 'parent') RETURNING parent_role INTO v_role;
  ASSERT v_role IS NULL, format('Ali has no gender, so no role: got %s', v_role);

  -- Setting a gender gives the Person's parent links with no role theirs.
  UPDATE public.nodes SET gender = 'male' WHERE id = ali;
  SELECT parent_role INTO v_role FROM public.links WHERE source_node_id = ali AND target_node_id = cyrus;
  ASSERT v_role = 'father', format('Ali''s link should become father, got %s', v_role);

  -- A gender that disagrees with a recorded role is refused.
  refused := false;
  BEGIN
    UPDATE public.nodes SET gender = 'female' WHERE id = fadi;
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  ASSERT refused, 'Fadi is a father, so female should be refused';

  -- Not recorded is always allowed, and leaves the links alone.
  UPDATE public.nodes SET gender = NULL WHERE id = ali;
  SELECT parent_role INTO v_role FROM public.links WHERE source_node_id = ali AND target_node_id = cyrus;
  ASSERT v_role = 'father', 'clearing a gender should leave the link''s role';

  -- Marriage links are untouched by the rule.
  INSERT INTO public.links (source_node_id, target_node_id, type)
  VALUES (ali, celine, 'marriage') RETURNING parent_role INTO v_role;
  ASSERT v_role IS NULL, 'a marriage link has no role';
  DELETE FROM public.links WHERE source_node_id = ali AND target_node_id = celine AND type = 'marriage';
END $$;

-- ---------------------------------------------------------------------------
-- The RPCs, called as the signed-in admin the way the app calls them
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad01"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_id uuid := '00000000-0000-0000-0000-00000000ad01';
  fadi uuid := '00000000-0000-0000-0000-0000000000f1';
  ebtisam uuid := '00000000-0000-0000-0000-0000000000e1';
  celine uuid := '00000000-0000-0000-0000-0000000000c1';
  r jsonb;
  refused boolean := false;
BEGIN
  -- Add a child of Fadi with no role: the role comes from Fadi's gender, and
  -- the cluster fields follow it (paternal Fadi's, maternal from his wife,
  -- named as the other parent: LIN-79 borrows no unnamed spouse's cluster).
  r := public.create_relative_secure('Dalia', 'child', fadi, admin_id, NULL, NULL, 'female', ebtisam)::jsonb;
  ASSERT (r->>'success')::boolean, format('adding a child should succeed: %s', r);
  ASSERT r->'nodes'->0->>'gender' = 'female', format('the new Person''s gender: %s', r);
  ASSERT r->'links'->0->>'parent_role' = 'father', format('the child link''s role: %s', r);
  ASSERT r->'nodes'->0->>'maternal_family_cluster' = 'Kutob', format('maternal cluster from the role: %s', r);

  -- Add a parent of Celine with a gender: the trigger gives the link its role.
  r := public.create_relative_secure('Mona', 'parent', celine, admin_id, NULL, NULL, 'female')::jsonb;
  ASSERT (r->>'success')::boolean, format('adding a parent should succeed: %s', r);
  ASSERT r->'links'->0->>'parent_role' = 'mother', format('the new parent''s role: %s', r);

  -- Add a sibling of Celine: each copied link takes its parent's role, not NULL.
  r := public.create_relative_secure('Sami', 'sibling', celine, admin_id)::jsonb;
  ASSERT (r->>'success')::boolean, format('adding a sibling should succeed: %s', r);
  ASSERT jsonb_array_length(r->'links') = 2, format('one link per parent: %s', r);
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'links') l WHERE l->>'parent_role' IS NULL
  ), format('every copied link has a role: %s', r);

  -- A role that disagrees with the anchor's gender is refused by the server.
  r := public.create_relative_secure('Rami', 'child', ebtisam, admin_id, 'father')::jsonb;
  ASSERT NOT (r->>'success')::boolean, format('a father role for Ebtisam should be refused: %s', r);
  ASSERT r->>'message' LIKE '%Ebtisam is recorded as female%', format('says why: %s', r);

  -- A gender outside the list is refused.
  r := public.create_relative_secure('Rami', 'child', fadi, admin_id, NULL, NULL, 'x')::jsonb;
  ASSERT NOT (r->>'success')::boolean, format('gender x should be refused: %s', r);

  -- Linking Fadi to Celine again, with no role, is already connected rather
  -- than a second link: the stored link's role was filled in from gender.
  r := public.link_existing_relative_secure(celine, 'child', fadi, admin_id)::jsonb;
  ASSERT (r->>'already_connected')::boolean, format('should be already connected: %s', r);
  ASSERT (SELECT count(*) FROM public.links WHERE source_node_id = fadi AND target_node_id = celine) = 1,
    'still one link from Fadi to Celine';

  -- An edit through the API (the nodes UPDATE policy) that gives a father a
  -- female gender is refused, not only in the browser.
  BEGIN
    UPDATE public.nodes SET gender = 'female' WHERE id = fadi;
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  ASSERT refused, 'the API should refuse female for Fadi, a father';
END $$;

RESET ROLE;

SELECT 'person_gender: all checks passed' AS result;

ROLLBACK;
