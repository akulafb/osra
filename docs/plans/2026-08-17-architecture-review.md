# Architecture Review & Survey: Tree Record Write Seam (2026-08-17)

## Overview

A systematic survey was conducted across all write operations to `nodes` and `links` to evaluate interface depth, failure modes, security boundaries, and vocabulary consistency across the Osra codebase.

## Survey Findings

Prior to unification under `src/lib/treeRecord.ts`, the codebase had eight fragmented write paths across 13 call sites:

1. `createRelativeSecure` (`src/lib/familyMutations.ts`): RPC `create_relative_secure`
2. `linkExistingRelativeSecure` (`src/lib/familyMutations.ts`): RPC `link_existing_relative_secure`
3. `adminInsertNode` (`src/lib/adminSupabaseRest.ts`): REST `POST /nodes`
4. `adminInsertLink` (`src/lib/adminSupabaseRest.ts`): REST `POST /links`
5. `adminPatchLink` (`src/lib/adminSupabaseRest.ts`): REST `PATCH /links`
6. `adminDeleteLink` (`src/lib/adminSupabaseRest.ts`): REST `DELETE /links`
7. `adminDeleteNode` (`src/lib/adminSupabaseRest.ts`): RPC `admin_delete_node_secure`
8. Direct inline `fetch(PATCH /nodes)` (`src/components/modals/EditNodeModal.tsx`)

### Key Vulnerabilities and Defects Identified

1. **Connect Mode Fallthrough Defect (`FamilyTree.tsx:333`)**:
   When a non-admin picked `divorce` in Connect Mode, the mapping logic lacked a divorce case and fell through to `'child'`, quietly creating a parent link in the database.
   *Resolution*: Refuse divorce for non-admins with `TreeRecordError('refused')`, and disable the option up front in `ConnectPickerCard`.

2. **Server-Side Authorization Discrepancies (Spinoff LIN-59)**:
   The three `*_secure` RPCs are `SECURITY DEFINER` with database-level checks, but the raw REST endpoints (`/nodes`, `/links`) had incomplete RLS policies where client-side `isAdmin` was the only gate.
   *Tracking*: Spinoff issue filed as LIN-59.

3. **Invite Token Exposure (Spinoff LIN-60)**:
   Invite tokens were enumerable using the public anon key.
   *Tracking*: Spinoff issue filed as LIN-60.

4. **Product Question on Divorce (Spinoff LIN-61)**:
   Should non-admins be permitted to record divorces in a future migration?
   *Tracking*: Spinoff issue filed as LIN-61.

## Unified Architecture

Consolidated all eight write paths into `src/lib/treeRecord.ts` with six coherent operations:
- `addPerson`
- `addLink`
- `editPerson`
- `editLink`
- `removePerson`
- `removeLink`

Full architectural decisions are documented in [`docs/adr/0003-tree-record-write-seam.md`](../adr/0003-tree-record-write-seam.md).
