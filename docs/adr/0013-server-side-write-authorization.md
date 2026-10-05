# 0004 Server-Side Write Authorization

We decided to enforce database-level Row Level Security (RLS) policies, triggers, and RPC constraints on `nodes` and `links`, establishing true server-side authorization boundaries that back up the client-side `treeRecord` seam (LIN-59, LIN-61).

## Context & Problem

ADR-0003 unified all mutations behind `src/lib/treeRecord.ts` and established a clean client-side interface. However, client-side checks are UI affordances and are forgeable by anyone issuing HTTP requests directly with an authenticated user JWT.

Prior to this decision:
1. `POST /nodes`: `nodes_insert_by_bound_users` allowed any bound user to insert arbitrary standalone Person rows directly.
2. `POST /links` & `PATCH /links`: `links_insert_1degree_or_admin` and `links_update_1degree_or_admin` allowed any link mutation as long as *at least one* endpoint was 1-degree (`is_admin() OR is_within_1_degree(source) OR is_within_1_degree(target)`). This allowed non-admins to link their nodes to arbitrary stranger nodes and create/update `divorce` links.
3. `PATCH /nodes`: Non-admins could overwrite `paternal_family_cluster` and `maternal_family_cluster` on any 1-degree Person via direct REST calls.
4. `link_existing_relative_secure`: Checked 1-degree on `target_node_id` but not on `existing_node_id`, allowing attachment to foreign trees.
5. Product Rule (LIN-61): Recording a divorce is strictly admin-only.

## Decision

1. **Admin-Only Standalone Node Creation**:
   - Dropped permissive `nodes_insert_by_bound_users` and replaced with `nodes_insert_admin_only` (`WITH CHECK (is_admin())`).
   - Ordinary users create Persons exclusively via the atomic `create_relative_secure` RPC.

2. **Admin-Only Divorce Enforcement**:
   - `links_insert_1degree_or_admin` and `links_update_1degree_or_admin` explicitly reject `type = 'divorce'` for non-admin users.
   - Non-admins can only insert or update `marriage` or `parent` links.

3. **Both-Endpoints 1-Degree Perimeter Requirement**:
   - Both `links_insert_1degree_or_admin` and `links_update_1degree_or_admin` require `is_within_1_degree(source_node_id) AND is_within_1_degree(target_node_id)` for non-admins.
   - `link_existing_relative_secure` enforces `is_admin() OR (is_within_1_degree(v_target) AND is_within_1_degree(v_existing))`.

4. **Cluster Modification Guard Trigger**:
   - Created `trg_guard_node_cluster_updates` on `public.nodes` executing `check_node_update_cluster_guard()`.
   - Non-admins attempting to modify `paternal_family_cluster` or `maternal_family_cluster` raise an exception. Non-admins can only modify `first_name` on 1-degree nodes.

5. **Full 1-Degree Kinship Perimeter**:
   - Updated `is_within_1_degree(p_target_node_id uuid)` to resolve self, direct links, siblings, parents' spouses, child's other parent, and spouses' children using robust auth UID resolution (`COALESCE(auth.jwt() ->> 'sub', auth.uid()::text)`).

## Consequences

- The database is now self-protecting: forged client requests or direct PostgREST calls cannot bypass admin gating or link outside the caller's 1-degree network.
- Divorce creation is strictly protected at the database tier as decided in LIN-61.
- Cluster fields cannot be forged or modified by non-admins.
