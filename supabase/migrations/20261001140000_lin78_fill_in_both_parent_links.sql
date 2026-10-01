-- =============================================================================
-- LIN-78: every child is linked to both parents (ADR 0012).
--
-- Most children are linked by a `parent` Kinship Link to their father only; the
-- mother is known only through his marriage. This migration adds no links by
-- itself. It adds the admin-gated function that does the one-time fill-in,
-- which the owner runs with scripts/both-parents/fill-in.ts: a dry run first,
-- then the same call with p_apply, dev first and then prod.
--
-- For each child linked to exactly one parent:
--
-- * The parent has had exactly one spouse, ever, by a `marriage` link, both
--   have a gender (or the parent a parent_role) recorded, and they differ: the child is linked to the
--   spouse. The trigger from 20261001130000_lin76_person_gender.sql gives the
--   new link its parent_role from the spouse's gender.
-- * Anything else (more than one spouse, a divorce, a parent or spouse with
--   no gender recorded, no spouse at all): the child goes on the list, with the reason
--   and the parent's spouses, for the owner to name the other parent. Nothing
--   is assumed for a child on the list.
--
-- The owner's answers come back as p_named, [{"child_id", "parent_id"}, ...].
-- A named parent replaces the guess for that child. Each name is checked; a
-- dry run reports the ones it refuses, and an apply with any refused name
-- writes nothing.
--
-- The links insert policy allows one link at a time through the Data API,
-- which is why the bulk insert is a SECURITY DEFINER function. Only an admin
-- (is_admin()) or the service role may call it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCTION: both_parent_links_plan (internal)
-- One row per child linked to exactly one parent, saying what the fill-in
-- would do. Called only by fill_in_both_parent_links; no API role may run it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.both_parent_links_plan(p_named jsonb DEFAULT '[]'::jsonb)
RETURNS TABLE (
  child_id uuid,
  child_name text,
  linked_parent_id uuid,
  linked_parent_name text,
  -- 'will_link', 'needs_a_name', or 'refused_name' (a name from p_named that was refused)
  status text,
  reason text,
  other_parent_id uuid,
  other_parent_name text,
  parent_role text,
  -- 'only spouse' or 'named', for a row that will link
  source text,
  -- The linked parent's spouses: [{"id", "name", "link"}], link 'marriage' or 'divorce'
  spouses jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH person AS (
    SELECT n.id, n.gender,
      trim(coalesce(n.first_name, '') || ' ' || coalesce(n.paternal_family_cluster, '')) AS name
    FROM public.nodes n
  ),
  parent_link AS (
    SELECT l.source_node_id AS parent_id, l.target_node_id AS child_id, l.parent_role
    FROM public.links l
    WHERE l.type = 'parent'
  ),
  one_parent AS (
    SELECT pl.child_id, (array_agg(pl.parent_id))[1] AS parent_id
    FROM parent_link pl
    GROUP BY pl.child_id
    HAVING count(DISTINCT pl.parent_id) = 1
  ),
  linked AS (
    SELECT o.child_id, o.parent_id,
      -- The role the existing link has, or the one the parent's gender gives.
      coalesce(
        (SELECT pl.parent_role FROM parent_link pl
         WHERE pl.child_id = o.child_id AND pl.parent_id = o.parent_id AND pl.parent_role IS NOT NULL
         LIMIT 1),
        parent_role_for_gender(p.gender)
      ) AS role
    FROM one_parent o
    JOIN person p ON p.id = o.parent_id
  ),
  spouse_link AS (
    SELECT l.source_node_id AS person_id, l.target_node_id AS spouse_id, l.type FROM public.links l
    WHERE l.type IN ('marriage', 'divorce') AND l.source_node_id <> l.target_node_id
    UNION
    SELECT l.target_node_id, l.source_node_id, l.type FROM public.links l
    WHERE l.type IN ('marriage', 'divorce') AND l.source_node_id <> l.target_node_id
  ),
  spouses AS (
    SELECT k.child_id,
      count(DISTINCT s.spouse_id) AS spouse_count,
      bool_or(s.type = 'divorce') AS any_divorce,
      (array_agg(s.spouse_id))[1] AS only_spouse_id,
      coalesce(
        jsonb_agg(jsonb_build_object('id', s.spouse_id, 'name', sp.name, 'link', s.type) ORDER BY sp.name, s.spouse_id)
          FILTER (WHERE s.spouse_id IS NOT NULL),
        '[]'::jsonb
      ) AS list
    FROM linked k
    LEFT JOIN spouse_link s ON s.person_id = k.parent_id AND s.spouse_id <> k.child_id
    LEFT JOIN person sp ON sp.id = s.spouse_id
    GROUP BY k.child_id
  ),
  named_raw AS (
    SELECT (e ->> 'child_id') AS child_text, (e ->> 'parent_id') AS parent_text
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_named) = 'array' THEN p_named ELSE '[]'::jsonb END) AS e
  ),
  named AS (
    SELECT
      CASE WHEN child_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN child_text::uuid END AS child_id,
      CASE WHEN parent_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN parent_text::uuid END AS parent_id,
      child_text, parent_text,
      count(*) OVER (PARTITION BY lower(child_text)) AS times_named
    FROM named_raw
  ),
  named_checked AS (
    SELECT nm.*, k.parent_id AS linked_parent_id, k.role AS linked_role, np.gender AS named_gender,
      CASE
        WHEN nm.child_id IS NULL THEN format('child_id %s is not a uuid', coalesce(nm.child_text, '(missing)'))
        WHEN nm.parent_id IS NULL THEN format('parent_id %s is not a uuid', coalesce(nm.parent_text, '(missing)'))
        WHEN nm.times_named > 1 THEN 'the child is named more than once'
        WHEN NOT EXISTS (SELECT 1 FROM person WHERE id = nm.child_id) THEN 'no such child'
        WHEN k.child_id IS NULL THEN 'the child is not linked to exactly one parent'
        WHEN np.id IS NULL THEN 'no such Person to name as the parent'
        WHEN nm.parent_id = nm.child_id THEN 'a Person cannot be their own parent'
        WHEN nm.parent_id = k.parent_id THEN 'that Person is already the linked parent'
        WHEN k.role IS NULL THEN 'the linked parent has no gender recorded'
        WHEN np.gender IS NULL THEN 'the named parent has no gender recorded'
        WHEN parent_role_for_gender(np.gender) = k.role THEN format('the named parent would be a second %s', k.role)
      END AS refusal
    FROM named nm
    LEFT JOIN linked k ON k.child_id = nm.child_id
    LEFT JOIN person np ON np.id = nm.parent_id
  ),
  guessed AS (
    SELECT k.child_id, k.parent_id, k.role, s.spouse_count, s.any_divorce, s.list,
      sp.id AS spouse_id, sp.gender AS spouse_gender,
      CASE
        WHEN s.spouse_count = 0 THEN 'no spouse recorded'
        WHEN s.spouse_count > 1 THEN 'more than one spouse'
        WHEN s.any_divorce THEN 'divorced'
        WHEN k.role IS NULL THEN 'the linked parent has no gender recorded'
        WHEN sp.gender IS NULL THEN 'the spouse has no gender recorded'
        WHEN parent_role_for_gender(sp.gender) = k.role THEN format('the spouse would be a second %s', k.role)
      END AS question
    FROM linked k
    JOIN spouses s ON s.child_id = k.child_id
    LEFT JOIN person sp ON sp.id = s.only_spouse_id AND s.spouse_count = 1
  )
  -- Children the owner named, with an accepted name.
  SELECT nc.child_id, c.name, nc.linked_parent_id, lp.name, 'will_link', NULL::text,
    nc.parent_id, np.name, parent_role_for_gender(nc.named_gender), 'named', g.list
  FROM named_checked nc
  JOIN person c ON c.id = nc.child_id
  JOIN person lp ON lp.id = nc.linked_parent_id
  JOIN person np ON np.id = nc.parent_id
  JOIN guessed g ON g.child_id = nc.child_id
  WHERE nc.refusal IS NULL

  UNION ALL
  -- Names that were refused.
  SELECT nc.child_id, c.name, nc.linked_parent_id, lp.name, 'refused_name', nc.refusal,
    nc.parent_id, np.name, NULL, 'named', NULL
  FROM named_checked nc
  LEFT JOIN person c ON c.id = nc.child_id
  LEFT JOIN person lp ON lp.id = nc.linked_parent_id
  LEFT JOIN person np ON np.id = nc.parent_id
  WHERE nc.refusal IS NOT NULL

  UNION ALL
  -- Everyone else linked to one parent: the only spouse, or a question.
  SELECT g.child_id, c.name, g.parent_id, lp.name,
    CASE WHEN g.question IS NULL THEN 'will_link' ELSE 'needs_a_name' END,
    g.question,
    CASE WHEN g.question IS NULL THEN g.spouse_id END,
    CASE WHEN g.question IS NULL THEN sp.name END,
    CASE WHEN g.question IS NULL THEN parent_role_for_gender(g.spouse_gender) END,
    CASE WHEN g.question IS NULL THEN 'only spouse' END,
    g.list
  FROM guessed g
  JOIN person c ON c.id = g.child_id
  JOIN person lp ON lp.id = g.parent_id
  LEFT JOIN person sp ON sp.id = g.spouse_id
  WHERE NOT EXISTS (SELECT 1 FROM named_checked nc WHERE nc.child_id = g.child_id AND nc.refusal IS NULL)
$$;

ALTER FUNCTION public.both_parent_links_plan(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.both_parent_links_plan(jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION: fill_in_both_parent_links
-- The dry run (default) changes nothing. With p_apply it writes every
-- 'will_link' row in one transaction, or nothing if any name was refused.
--
-- Returns:
--   { applied, will_link: [...], needs_a_name: [...], refused_names: [...],
--     inserted_link_ids: [...], counts: { will_link, needs_a_name,
--     refused_names, children_with_two_or_more_parents } }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fill_in_both_parent_links(
  p_apply boolean DEFAULT false,
  p_named jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan jsonb;
  v_refused integer;
  v_inserted jsonb := '[]'::jsonb;
  v_two_or_more integer;
BEGIN
  IF NOT (is_admin() OR coalesce(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Only an administrator can fill in parent links.' USING ERRCODE = '42501';
  END IF;

  IF p_named IS NOT NULL AND jsonb_typeof(p_named) <> 'array' THEN
    RAISE EXCEPTION 'p_named must be a JSON array of {"child_id", "parent_id"}.';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.status, p.child_name, p.child_id), '[]'::jsonb)
  INTO v_plan
  FROM public.both_parent_links_plan(coalesce(p_named, '[]'::jsonb)) p;

  SELECT count(*) INTO v_refused
  FROM jsonb_array_elements(v_plan) e
  WHERE e ->> 'status' = 'refused_name';

  IF p_apply THEN
    IF v_refused > 0 THEN
      RAISE EXCEPTION '% of the named parents were refused, so nothing was written. Run the dry run to see why.', v_refused;
    END IF;

    WITH inserted AS (
      INSERT INTO public.links (source_node_id, target_node_id, type, parent_role, created_by_user_id)
      SELECT (e ->> 'other_parent_id')::uuid, (e ->> 'child_id')::uuid, 'parent', e ->> 'parent_role', auth.uid()
      FROM jsonb_array_elements(v_plan) e
      WHERE e ->> 'status' = 'will_link'
      RETURNING id
    )
    SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_inserted FROM inserted;
  END IF;

  SELECT count(*) INTO v_two_or_more
  FROM (
    SELECT target_node_id FROM public.links WHERE type = 'parent'
    GROUP BY target_node_id HAVING count(DISTINCT source_node_id) >= 2
  ) t;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'will_link', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_plan) e WHERE e ->> 'status' = 'will_link'),
    'needs_a_name', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_plan) e WHERE e ->> 'status' = 'needs_a_name'),
    'refused_names', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_plan) e WHERE e ->> 'status' = 'refused_name'),
    'inserted_link_ids', v_inserted,
    'counts', jsonb_build_object(
      'will_link', (SELECT count(*) FROM jsonb_array_elements(v_plan) e WHERE e ->> 'status' = 'will_link'),
      'needs_a_name', (SELECT count(*) FROM jsonb_array_elements(v_plan) e WHERE e ->> 'status' = 'needs_a_name'),
      'refused_names', v_refused,
      'children_with_two_or_more_parents', v_two_or_more
    )
  );
END;
$$;

ALTER FUNCTION public.fill_in_both_parent_links(boolean, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fill_in_both_parent_links(boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fill_in_both_parent_links(boolean, jsonb) TO authenticated, service_role;
