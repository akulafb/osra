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

## Consequences

- All tree writes now share uniform error handling, telemetry potential, and identity routing.
- The defect where non-admins could create faulty parent links via divorce is closed at both the UI picker level and module level.
- Server-side RLS gaps for raw REST endpoints remain documented under LIN-59.
