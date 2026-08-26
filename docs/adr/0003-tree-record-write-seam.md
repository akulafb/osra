# 0003 Tree Record Write Seam

We decided to consolidate every write to `nodes` and `links` behind a single deep write module (`src/lib/treeRecord.ts`) exposing six coherent operations (`addPerson`, `addLink`, `editPerson`, `editLink`, `removePerson`, `removeLink`), retiring eight fragmented mutation paths and eliminating a live defect in Connect Mode.

## Context & Problem

Prior to this decision, write operations to the family tree archive were scattered across eight distinct write paths in `src/lib/familyMutations.ts`, `src/lib/adminSupabaseRest.ts`, and direct inline `fetch()` calls in components and modals. 

This fragmentation produced:
- **Live defects**: In `FamilyTree.tsx`, a non-admin picking `divorce` in Connect Mode was coerced into a `child` relation due to fallthrough, quietly writing a parent link instead.
- **Inconsistent permission gating**: Some paths relied entirely on client-side booleans, while RPC paths (`create_relative_secure`, `link_existing_relative_secure`, `admin_delete_node_secure`) performed database-side security checks.
- **Vocabulary mismatch**: Components mixed **Relative Direction** (`parent`, `child`, `spouse`, `sibling` relative to an anchor) with **Kinship Link** (absolute source/target graph edges with role annotations).

## Decision

1. **Singular Write Seam (`src/lib/treeRecord.ts`)**:
   - Every mutation to `nodes` and `links` routes through `createTreeRecord(identity, config)`.
   - Invites (`node_invites`, `claim_invite_secure`) are deliberately excluded and will form their own module.

2. **Six Consolidated Operations**:
   - `addPerson({ firstName, paternalCluster?, maternalCluster?, link? })`:
     - If `link` is present, atomically routes to `create_relative_secure` RPC.
     - If `link` is absent, routes to REST `POST /nodes` (admin only; refused for non-admins).
   - `addLink({ sourceId, targetId, type, parentRole? })`:
     - For admins, routes to REST `POST /links`.
     - For non-admins, routes `marriage` and `parent` to `link_existing_relative_secure` RPC.
     - For non-admins, `divorce` is **refused, never coerced**.
   - `editPerson({ id, firstName?, paternalCluster?, maternalCluster? })`:
     - Routes to REST `PATCH /nodes?id=eq.<id>`. Cluster fields are only sent for admins.
   - `editLink({ id, sourceId?, targetId?, type?, parentRole? })`:
     - Admin only; routes to REST `PATCH /links?id=eq.<id>`.
   - `removePerson({ id })`:
     - Admin only; routes to `admin_delete_node_secure` RPC.
   - `removeLink({ id })`:
     - Admin only; routes to REST `DELETE /links?id=eq.<id>`.

3. **Refusal Over Coercion**:
   - When a requested operation cannot be represented by the available transport/permissions (e.g. non-admin recording a divorce), the module throws a typed `TreeRecordError('refused', ...)` rather than silently coercing the intent into a different mutation.

4. **Explicit Edge Conversion**:
   - The module interface speaks **Kinship Link** (absolute edges).
   - A single named edge helper `relativeToKinshipLink(anchorTargetId, otherNodeId, relation, parentRole)` converts user-facing **Relative Direction** into absolute Kinship Links at component boundaries.

5. **Structured Error Hierarchy**:
   - `TreeRecordError` with typed discriminant `kind: 'refused' | 'not-authorized' | 'network' | 'conflict' | 'unknown'`.

6. **Permissions & Strangler Migration**:
   - Removed obsolete `canCreateLink` from `permissions.ts` (which had 0 call sites).
   - Retained `canEdit` for UI render gating.
   - Replaced all 13 call sites and deleted `familyMutations.ts` and `adminSupabaseRest.ts`.

## The division of authorization labour

The module checks **admin-ness**. It does not check **1-degree kinship**, and it deliberately does not receive the Kinship Links needed to compute it. This looks wrong — `canEdit` is sitting right there in `permissions.ts` — so the reasoning is recorded here.

The split follows what each side can actually enforce:

- The three `*_secure` RPCs are `SECURITY DEFINER` and self-authorizing — they verify `auth.uid() = creator_id` and then `is_admin() OR is_within_1_degree()`. The database does 1-degree well; duplicating it client-side would be decoration.
- The four raw REST paths are **not** admin-gated by the database. `POST /nodes` is satisfied by `nodes_insert_by_bound_users` for any bound user; `POST /links` and `PATCH /links` treat `is_admin()` as one disjunct of three; `PATCH /nodes` allows any 1-degree update. Only `DELETE /links` genuinely requires admin. For those four paths a client-side boolean was the *only* gate, distributed across React props.

So the module checks the thing the database doesn't, and leaves the database the thing it already enforces.

**The module's check is a UI affordance, not a security boundary.** It runs in the browser and is forgeable. It exists so the gate is singular and visible rather than scattered, not because it protects anything. The real fix is DB-side and is tracked in LIN-59.

## Considered and rejected

- **Passing the full `{ userId, isAdmin, userNodeId, links }` so the module could run `canEdit` properly.** Rejected: `canEdit` needs the entire Kinship Link array, which would drag the Tree Record's read model into the interface of a module that exists to narrow it. Depth is a property of the interface; this would have widened it.
- **Two adapters, admin and non-admin, chosen by the caller.** Rejected: caller-chosen routing is what produced the Connect Mode defect. The caller should not need to know which transport its write takes.
- **Leaving the raw REST writes outside the module and absorbing only the RPC-backed paths.** Rejected: that leaves precisely the four ungated paths outside the seam.
- **An in-memory fake as the test double.** Rejected: the drift that actually occurred was in *request bodies* — `familyMutations.ts` and `AddRelativeModal.tsx` built the same RPC body with different trims and different error text. A fake at the module interface cannot see that; an injected `fetch` can.

## Consequences

- All tree writes now share uniform error handling, telemetry potential, and identity routing.
- The defect where non-admins could create faulty parent links via divorce is closed at both the UI picker level and module level.
- Server-side RLS gates and divorce restrictions are fully enforced by the database (LIN-59 / ADR-0004).
- **Recording a divorce is admin-only.** This was previously an accident — the non-admin RPC takes a Relative Direction, and `divorce` has none — but it is now a deliberate product rule (LIN-61). Connect Mode disables the option for non-admins rather than letting the module refuse after the fact, and the module refuses as a backstop. Expect this to be re-proposed: `marriage` is unrestricted for the same users, so "why can they record the marriage but not the divorce?" is the obvious question. The answer is that a divorce is a claim about two living relatives that the tree should not let an arbitrary 1-degree relative assert unilaterally. Reversing it means a migration, not a client change.
- That rule is **enforced by the database** via `links_insert_1degree_or_admin`, `links_update_1degree_or_admin`, and `link_existing_relative_secure` (ADR-0004).
- The interface is the test surface. Six operations behind one injected `fetch`.
- **Return values were not specified here, and that was an omission rather than a decision.** All
  six operations returned nothing usable, so no caller could confirm an optimistic write from a
  response. Completed in [ADR-0010](0010-write-seam-return-contract.md) (LIN-64): every operation
  returns the rows it wrote.

