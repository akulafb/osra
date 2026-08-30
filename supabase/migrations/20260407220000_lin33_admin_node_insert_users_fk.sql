-- LIN-33: Admin can insert nodes without being bound; users.node_id references nodes with ON DELETE SET NULL.

-- -----------------------------------------------------------------------------
-- Clean dangling node_id before adding FK (existing rows may reference deleted nodes)
-- -----------------------------------------------------------------------------
UPDATE public.users u
SET node_id = NULL
WHERE u.node_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = u.node_id);

-- -----------------------------------------------------------------------------
-- FK: when a node is deleted, clear users.node_id instead of dangling UUIDs
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD CONSTRAINT users_node_id_fkey
  FOREIGN KEY (node_id)
  REFERENCES public.nodes(id)
  ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- RLS: allow admins to insert nodes (e.g. orphan person) without bound node_id
-- -----------------------------------------------------------------------------
-- created_by_user_id is text on some environments and uuid on others, so both
-- sides are cast to text rather than assuming the column's type.
CREATE POLICY nodes_insert_admin ON public.nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    AND (created_by_user_id::text = (select auth.uid()::text))
  );
