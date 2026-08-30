-- =============================================================================
-- Restore the nodes foreign keys, and clear the orphan Kinship Links they left
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- `20260101_initial_schema.sql` declares three foreign keys onto public.nodes,
-- all of them ON DELETE CASCADE:
--
--   links.source_node_id      uuid NOT NULL REFERENCES public.nodes(id)  (:32)
--   links.target_node_id      uuid NOT NULL REFERENCES public.nodes(id)  (:33)
--   node_invites.node_id      uuid NOT NULL REFERENCES public.nodes(id)  (:42)
--
-- Dev has all three. Production has none of them, which is further evidence
-- that production's schema was never built by applying that file. The columns,
-- their NOT NULL, and the supporting indexes are all present on both; only the
-- referential constraints are missing.
--
-- This is not cosmetic. `admin_delete_node_secure` deletes a Person with a
-- single statement and never touches public.links:
--
--   SELECT array_agg(id) INTO v_link_ids FROM public.links
--   WHERE source_node_id = p_node_id OR target_node_id = p_node_id;
--   DELETE FROM public.nodes WHERE id = p_node_id;
--   RETURN json_build_object('success', true, 'removed_link_ids', v_link_ids);
--
-- It collects the link ids, deletes the Person, and reports those ids as
-- removed. The cascade is the entire mechanism that makes the claim true, and
-- `20260826120000_lin64_write_seam_return_contract.sql` (:353-356) says so in
-- as many words. Without the foreign key the function still returns success and
-- still names the link ids, but the rows stay in the table. The Write Outcome
-- is confirmed, the Confirmed Snapshot drops those Kinship Links, and the
-- database quietly disagrees.
--
-- Nothing was visibly broken because `dropOrphanLinks`
-- (src/lib/sanitizeFamilyGraph.ts, called from both the fetch path in
-- useWorkingRecord.ts:246 and the projection in workingRecord.ts:133) filters
-- any Kinship Link whose endpoints are not present. Two independent safety nets
-- masked a false server contract for a fortnight.
--
-- Production carried five such rows, all type 'parent' with a live source
-- Person and a deleted target, written 2026-08-17 and 2026-08-18. They are
-- archived verbatim at
-- supabase/reference/orphan-links-before-delete-2026-08-30.json. The target
-- Persons are gone from public.nodes, so no facts about them survive anywhere
-- and there is nothing to restore; the rows assert a parent relationship to
-- somebody who does not exist. They are deleted here.
--
-- ORDER MATTERS
--
-- The delete must precede the ADD CONSTRAINT. A foreign key is validated
-- against existing rows on creation, so with the orphans still present
-- production would fail with
-- `23503: insert or update on table "links" violates foreign key constraint`.
--
-- IDEMPOTENCE
--
-- Every step is guarded on the catalogue or on the data, so this file is a
-- no-op against dev (which already holds all three constraints and has zero
-- orphans) and on any second application.
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Clear Kinship Links pointing at a Person who no longer exists.
--    Both endpoints are checked, not just the target: source_node_id can dangle
--    by the same mechanism, and a constraint on it is being added below.
-- -----------------------------------------------------------------------------

DELETE FROM public.links l
WHERE NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = l.source_node_id)
   OR NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = l.target_node_id);

-- Invites are covered by the same missing cascade.
DELETE FROM public.node_invites i
WHERE NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = i.node_id);

-- -----------------------------------------------------------------------------
-- 2. Restore the three foreign keys in the shape the initial schema declares.
-- -----------------------------------------------------------------------------

DO $restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'links_source_node_id_fkey'
      AND conrelid = 'public.links'::regclass
  ) THEN
    ALTER TABLE public.links
      ADD CONSTRAINT links_source_node_id_fkey
      FOREIGN KEY (source_node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'links_target_node_id_fkey'
      AND conrelid = 'public.links'::regclass
  ) THEN
    ALTER TABLE public.links
      ADD CONSTRAINT links_target_node_id_fkey
      FOREIGN KEY (target_node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'node_invites_node_id_fkey'
      AND conrelid = 'public.node_invites'::regclass
  ) THEN
    ALTER TABLE public.node_invites
      ADD CONSTRAINT node_invites_node_id_fkey
      FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;
  END IF;
END
$restore$;

-- -----------------------------------------------------------------------------
-- 3. Abort unless the database now matches the committed schema.
-- -----------------------------------------------------------------------------

DO $verify$
DECLARE
  v_cascading int;
  v_orphan_links int;
  v_orphan_invites int;
  v_null_endpoints int;
BEGIN
  -- All three constraints exist, and all three cascade ('c'). A constraint that
  -- came back as NO ACTION would satisfy a name check while leaving
  -- admin_delete_node_secure's contract broken in the opposite direction: the
  -- DELETE would raise instead of silently orphaning.
  SELECT count(*) INTO v_cascading
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.nodes'::regclass
    AND confdeltype = 'c'
    AND conname IN (
      'links_source_node_id_fkey',
      'links_target_node_id_fkey',
      'node_invites_node_id_fkey'
    );
  IF v_cascading <> 3 THEN
    RAISE EXCEPTION 'expected 3 cascading FKs onto public.nodes, found %', v_cascading;
  END IF;

  SELECT count(*) INTO v_orphan_links
  FROM public.links l
  WHERE NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = l.source_node_id)
     OR NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = l.target_node_id);
  IF v_orphan_links <> 0 THEN
    RAISE EXCEPTION 'orphan links survived: %', v_orphan_links;
  END IF;

  SELECT count(*) INTO v_orphan_invites
  FROM public.node_invites i
  WHERE NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = i.node_id);
  IF v_orphan_invites <> 0 THEN
    RAISE EXCEPTION 'orphan invites survived: %', v_orphan_invites;
  END IF;

  -- The endpoints stay mandatory. A cascade plus a nullable endpoint would let a
  -- Kinship Link outlive its Person as a half-edge instead of being removed.
  SELECT count(*) INTO v_null_endpoints
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'links' AND column_name IN ('source_node_id', 'target_node_id'))
      OR (table_name = 'node_invites' AND column_name = 'node_id'))
    AND is_nullable = 'YES';
  IF v_null_endpoints <> 0 THEN
    RAISE EXCEPTION 'endpoint columns became nullable: %', v_null_endpoints;
  END IF;
END
$verify$;

COMMIT;
