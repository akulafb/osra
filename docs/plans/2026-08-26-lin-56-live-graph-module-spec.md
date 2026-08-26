# LIN-56 — Make the Live Graph a Module

**Status**: spec, awaiting implementation  
**Issue**: [LIN-56](https://linear.app/linearfb/issue/LIN-56) — Arch 04, from `docs/plans/2026-08-17-architecture-review.md`  
**Branch**: `akulafb/lin-56-arch-04-live-graph-module`  

Produced by grilling the issue with docs. Every decision below was put to the maintainer and answered.

---

## Problem

In Osra, `FamilyLink` in `src/types/graph.ts` is typed as `{ source: string; target: string; ... }`. However, when passed to 3D force simulation (`react-force-graph-3d` / `d3-force`), d3 rewrites `.source` and `.target` in-place into object references (`FamilyNode` / `LiveNodePosition`).

This causes widespread defensive re-implementations and type escapes:
1. **Four duplicate accessors**:
   - `src/utils/getNodeId.ts` (`getNodeId`)
   - `src/lib/permissions.ts` (`getSafeId`, `any`-typed)
   - `src/utils/familyContext.ts` (`getId`, `any`-typed)
   - `FamilyTree3D.tsx` & `BulkInviteModal.tsx` (~20 inline `typeof l.source === 'object' ? l.source.id : l.source` checks)
2. **Duplicated Kinship Graph Traversal**:
   - `permissions.ts` and `BulkInviteModal.tsx` independently implement 1-degree kinship traversal (parents, children, spouses, siblings, stepparents, stepchildren, co-parents) using differing algorithms and `any` escapes.
3. **Type Mismatches**:
   - `RelativeDirection` in `graph.ts:30` omits `'sibling'`, despite `CONTEXT.md` and database RPCs supporting it, requiring inline type widening in `treeRecord.ts`.
4. **Hackish Node Attribute Access**:
   - `FamilyTree3D.tsx` exploits d3's in-place object replacement to read `link.source.familyCluster`, which fails or is unreliable before the simulation ticks.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | `FamilyLink.source` and `FamilyLink.target` are typed as `LinkEndpoint = string \| FamilyNode` | Acknowledges runtime reality without adding cloning overhead or brittle type duplication. Makes reading raw strings without an accessor a compiler error. |
| D2 | All graph navigation and endpoint access lives in `src/lib/familyGraph.ts` | Elevates ad-hoc utilities into a deep domain module alongside `treeRecord.ts` and `personMatch.ts`. |
| D3 | `getNodeId(nodeOrEndpoint: unknown): string` returns `''` on invalid input | Safe string comparison without null guards; matches existing `getNodeId` convention. |
| D4 | 1-degree kinship traversal and relationship classification unified into `familyGraph.ts` | Graph traversal is structural domain logic, not authorization policy. `permissions.ts` becomes a thin policy wrapper, and `BulkInviteModal.tsx` drops 60 lines of duplicate traversal. |
| D5 | `RelativeDirection` in `src/types/graph.ts` widened to `'parent' \| 'child' \| 'spouse' \| 'sibling'` | Aligns TypeScript definitions with `CONTEXT.md` and database RPC `create_relative_secure`. |
| D6 | Delete `src/utils/getNodeId.ts` and migrate all 14 callers to `src/lib/familyGraph.ts` | Leaves no legacy wrappers behind. |
| D7 | Refactor `src/utils/familyContext.ts` to use `src/lib/familyGraph.ts` | Eliminates custom `getId` and manual link traversal in AI chat context generation. |
| D8 | 3D cluster lookups use canonical node map lookups via `getNodeId` | Deterministic node property resolution that does not depend on simulation tick state. |
| D9 | Add **1-Degree Network** to `CONTEXT.md` and record **ADR-0006** | Captures domain vocabulary and the architectural trade-off of the d3-force live graph seam. |

---

## Module Contract: `src/lib/familyGraph.ts`

```ts
// src/lib/familyGraph.ts

import type { FamilyNode, FamilyLink, LinkEndpoint } from '../types/graph';

/**
 * Safely extracts a node ID from a string, a FamilyNode, a LiveNodePosition,
 * or any object containing an `id` property. Returns empty string if invalid.
 */
export function getNodeId(nodeOrEndpoint: unknown): string;

/**
 * Normalizes link endpoints into resolved string IDs.
 */
export function getLinkEndpoints(link: FamilyLink): { sourceId: string; targetId: string };

/**
 * Checks if two nodes are directly connected by a link of a given type (or any type if omitted).
 */
export function isDirectlyLinked(
  links: FamilyLink[],
  aId: string,
  bId: string,
  type?: FamilyLink['type']
): boolean;

/**
 * Returns the parent IDs for a given node.
 */
export function getParents(nodeId: string, links: FamilyLink[]): string[];

/**
 * Returns the child IDs for a given node.
 */
export function getChildren(nodeId: string, links: FamilyLink[]): string[];

/**
 * Returns the spouse IDs (marriage or divorce) for a given node.
 */
export function getSpouses(nodeId: string, links: FamilyLink[]): string[];

/**
 * Returns the sibling IDs (sharing at least one parent) for a given node.
 */
export function getSiblings(nodeId: string, links: FamilyLink[]): string[];

/** 1-Degree Kinship category for immediate network */
export type KinshipDegree1Category = 'parent' | 'child' | 'spouse' | 'sibling';

export interface Degree1Relative {
  nodeId: string;
  relationship: KinshipDegree1Category;
  /** True for blended family connections (stepparent, stepchild, co-parent) */
  isBlended?: boolean;
}

/**
 * Computes all 1-degree relatives for an anchor node:
 * - Direct parents and stepparents (parent's spouse) -> 'parent'
 * - Direct children and stepchildren (spouse's child) -> 'child'
 * - Direct spouses and co-parents (child's other parent) -> 'spouse'
 * - Siblings (shared parent) -> 'sibling'
 */
export function get1DegreeRelatives(
  anchorNodeId: string,
  links: FamilyLink[]
): Degree1Relative[];

/**
 * Returns the set of node IDs in the anchor's 1-degree network (including the anchor).
 */
export function get1DegreeNodeIds(
  anchorNodeId: string | null | undefined,
  links: FamilyLink[]
): string[];
```

---

## Type Updates: `src/types/graph.ts`

```ts
export type LinkEndpoint = string | FamilyNode;

export interface FamilyLink {
  id?: string;
  source: LinkEndpoint;
  target: LinkEndpoint;
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
}

export type RelativeDirection = 'parent' | 'child' | 'spouse' | 'sibling';
```

---

## Call Site Refactorings

### 1. `src/lib/permissions.ts`
- Replace internal `getSafeId`, `getParents`, `getChildren` with imports from `src/lib/familyGraph.ts`.
- `isWithin1Degree` delegates to `get1DegreeNodeIds(userNodeId, links).includes(targetNodeId)`.
- `get1DegreeNodesSync` delegates to `get1DegreeNodeIds(userNodeId, links)`.
- Removes all `(link: any)` casts.

### 2. `src/components/modals/BulkInviteModal.tsx`
- Replace lines 63–124 with a call to `get1DegreeRelatives(userNodeId, allLinks)`.
- Map each `Degree1Relative` to the modal's display item.
- Removes ~60 lines of redundant link parsing and all `as any` casts.

### 3. `src/utils/familyContext.ts`
- Refactor to use `getNodeId`, `getParents`, `getSpouses`, `getChildren`, `getSiblings`.
- Delete local `getId` function.

### 4. `src/components/FamilyTree3D.tsx`
- Replace `typeof link.source === 'object' ? ...` with `getNodeId(link.source)`.
- Replace inline cluster lookups (`(link.source as any).familyCluster`) with `nodeMap.get(getNodeId(link.source))?.familyCluster`.

### 5. `src/utils/getNodeId.ts` Migration
- Migrate all 14 callers (`filterGraphData.ts`, `layoutEngine.ts`, `adminGraphValidation.ts`, `AdminManageLinksModal.tsx`, `FamilyTree.tsx`, `FamilyTree2D.tsx`, `Manipulation3DPanel.tsx`, `treeRecord.ts`, etc.) to import `getNodeId` from `src/lib/familyGraph.ts`.
- Delete `src/utils/getNodeId.ts`.

---

## Testing Plan

`src/lib/familyGraph.test.ts`:
- **Endpoint resolution**:
  - String ID resolution
  - Object with `.id` resolution (FamilyNode / LiveNodePosition)
  - Null, undefined, empty string, and malformed objects returning `''`
- **Link navigation**:
  - `getParents`, `getChildren`, `getSpouses`, `getSiblings` across various link topologies
  - Both string and object endpoint inputs
- **1-Degree Network computation**:
  - Direct links (parent, child, spouse)
  - Siblings sharing a parent
  - Stepparents (parent's spouse)
  - Stepchildren (spouse's child)
  - Co-parents (child's other parent)
  - Blended family flag verification
- **Existing test suites**:
  - Verify all 204 existing test cases continue to pass without regression.

---

## Documentation Plan

1. **`CONTEXT.md`**:
   - Add under **Core Entities**:
     - **1-Degree Network**: The immediate family boundary around an anchor Person — self, parents, children, spouses, siblings, and blended family equivalents (stepparents, stepchildren, co-parents) — used for permission scopes and invite management. _Avoid_: Immediate family, Close relatives, Permission group.
2. **`docs/adr/0006-live-graph-endpoints-and-traversal.md`**:
   - Document decision D1 (typing `LinkEndpoint` as union to acknowledge d3-force in-place mutation) and D4 (unifying kinship traversal in `familyGraph.ts`).
