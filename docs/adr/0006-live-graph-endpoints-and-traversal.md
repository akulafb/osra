# 0006 Live Graph Endpoints and Kinship Traversal Seam

We decided to type Kinship Link endpoints as a union `LinkEndpoint = string | FamilyNode` and consolidate all graph navigation, endpoint resolution, and 1-degree kinship traversal behind a single deep module (`src/lib/familyGraph.ts`).

## Context & Problem

In Osra, `FamilyLink` in `src/types/graph.ts` was historically typed as `{ source: string; target: string; ... }`. However, at runtime when graph data is handed to `react-force-graph-3d`, the underlying `d3-force-3d` simulation engine mutates `.source` and `.target` in-place, transforming string IDs into direct object references (`FamilyNode` / `LiveNodePosition`).

This mismatch produced:
1. **Proliferation of duplicate accessors**: Four separate helpers (`getNodeId`, `getSafeId`, `getId`, and ~20 inline ternary checks) attempted to extract string IDs from endpoints.
2. **Type escapes (`any`)**: Handlers across `permissions.ts`, `familyContext.ts`, `FamilyTree3D.tsx`, and `BulkInviteModal.tsx` routinely cast link objects to `any` to avoid TypeScript errors when accessing `.source` or `.target`.
3. **Duplicated kinship traversal**: `permissions.ts` and `BulkInviteModal.tsx` independently implemented algorithms to find parents, children, spouses, siblings, stepparents, stepchildren, and co-parents.
4. **Fragile property access in 3D**: `FamilyTree3D.tsx` relied on d3's in-place mutation to read `link.source.familyCluster`, which is undefined before simulation ticks.
5. **Vocabulary gap in types**: `RelativeDirection` omitted `'sibling'` in `src/types/graph.ts`, despite `CONTEXT.md` and database RPCs supporting it.

## Decision

1. **Acknowledge Runtime Reality in Types (`src/types/graph.ts`)**:
   - `export type LinkEndpoint = string | FamilyNode;`
   - `FamilyLink` endpoints are typed as `LinkEndpoint`.
   - Accessing `link.source` or `link.target` directly as a bare `string` without `getNodeId()` becomes a compile error.
   - `RelativeDirection` is widened to `'parent' | 'child' | 'spouse' | 'sibling'`.

2. **Consolidated Graph Navigation Seam (`src/lib/familyGraph.ts`)**:
   - A single deep domain module owning:
     - `getNodeId(nodeOrEndpoint: unknown): string`: Safe extraction of node ID (defaults to `''` on invalid input).
     - `getLinkEndpoints(link: FamilyLink): { sourceId: string; targetId: string }`: Canonical endpoint resolution.
     - Kinship adjacency queries: `getParents`, `getChildren`, `getSpouses`, `getSiblings`, `isDirectlyLinked`.
     - 1-Degree Kinship network computation: `get1DegreeRelatives(anchorNodeId, links)` returning typed `Degree1Relative[]` (classifying direct and blended relatives: `'parent' | 'child' | 'spouse' | 'sibling'`), and `get1DegreeNodeIds(anchorNodeId, links)`.

3. **Refactoring Call Sites**:
   - `permissions.ts`: Delegates `isWithin1Degree` and `get1DegreeNodesSync` directly to `familyGraph.ts`, removing all internal helper duplicates and `any` escapes.
   - `BulkInviteModal.tsx`: Uses `get1DegreeRelatives(userNodeId, allLinks)` directly, deleting 60 lines of ad-hoc link parsing.
   - `familyContext.ts`: Uses `familyGraph.ts` helpers for AI chat prompt construction.
   - `FamilyTree3D.tsx`: Uses `getNodeId` and a node map lookup for cluster attributes instead of reading mutated link objects.
   - `src/utils/getNodeId.ts`: Deleted; all 14 callers migrated to `src/lib/familyGraph.ts`.

4. **Domain Model (`CONTEXT.md`)**:
   - Formally documented **1-Degree Network** as a core domain entity.

## Considered and Rejected

- **Deep cloning links before 3D force simulation**: Rejected. Cloning the entire link collection on every render cycle introduces garbage collection overhead and fails to leverage the spatial relationships needed by 3D rendering.
- **Separate `StaticFamilyLink` and `LiveFamilyLink` types**: Rejected. Having parallel type hierarchies across the component tree adds cognitive load and requires manual conversion at view seams. A union type `LinkEndpoint` accurately models the data shape while enforcing accessor usage.
- **Keeping kinship traversal inside `permissions.ts`**: Rejected. Kinship topology is structural graph logic, not authorization policy. Moving traversal to `familyGraph.ts` makes it reusable for invitation management and visualization.

## Consequences

- Endpoints are always accessed via `getNodeId()`, eliminating `any` casts across the codebase.
- Kinship calculations for permissions and bulk invitations share a single, thoroughly tested implementation.
- `RelativeDirection` in TypeScript fully reflects the domain model and backend capabilities.
