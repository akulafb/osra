# 0004 Direct-Manipulation State Machine Behind One Interface

We decided to consolidate selection, relative creation (Ghost Node), Connect Mode, and Dissolve confirmation behind a single pure state machine (`src/lib/directManipulation.ts`) and React controller hook (`src/hooks/useDirectManipulation.ts`), replacing fragmented component-local states and shrinking the prop interface to 2D and 3D renderings to a unified controller.

## Context & Problem

Direct-manipulation interaction states were previously duplicated across `FamilyTree.tsx`, `FamilyTree2D.tsx`, `FamilyTree3D.tsx`, and `NodeCard.tsx`. This fragmentation produced five specific architectural leaks across the seam:

1. **Escape precedence duplicated 3×**: `FamilyTree2D.tsx`, `FamilyTree3D.tsx`, and `ConnectPickerCard.tsx` independently implemented unwinding hierarchies with conflicting event listeners.
2. **Two connect modes**: An inline direct-manipulation Connect Mode in 2D/3D and an admin-only `AdminConnectLinkModal` in `FamilyTree.tsx`, duplicating connection flows.
3. **Selection split 3 ways**: `FamilyTree.tsx` stored `selectedNode`, while `FamilyTree2D.tsx` and `FamilyTree3D.tsx` intercepted and filtered clicks separately.
4. **Dissolve confirmation in a leaf card**: `NodeCard.tsx` held local `isConfirmingDissolve` state with a mouse-leave hover auto-cancel heuristic, while 3D managed `confirmingDissolveId` at the scene level.
5. **Bloated prop interface**: `FamilyTree.tsx` passed 61 props to `FamilyTree3D` and 42 props to `FamilyTree2D`, exposing the internal state implementation details of both renderings.

## Decision

1. **Pure State Machine Core (`src/lib/directManipulation.ts`)**:
   - Implemented as a pure, deterministic state machine with a tagged union state model:
     - `idle`: No active selection or interaction.
     - `selected`: A Tree Node is selected (`nodeId`). Action affordances available.
     - `creating-relative`: Ghost Node / Ghost Preview active (`anchorNodeId`, `relation`).
     - `targeting-connect`: Connect Mode active with source node chosen (`sourceNodeId`), awaiting target.
     - `choosing-kinship`: Both source and target chosen (`sourceNodeId`, `targetNodeId`), awaiting kinship type and parent role.
     - `confirming-dissolve`: A Tree Node is awaiting deletion confirmation (`nodeId`).
   - Fully testable in `environment: 'node'` without React or DOM dependencies.

2. **Single Unwinding Hierarchy**:
   - **Escape Key**: Unwinds one level per press:
     - `choosing-kinship` $\rightarrow$ `targeting-connect`
     - `targeting-connect` $\rightarrow$ `selected`
     - `creating-relative` $\rightarrow$ `selected`
     - `confirming-dissolve` $\rightarrow$ `selected`
     - `selected` $\rightarrow$ `idle`
   - **Background Click**:
     - Cancels active sub-state back to `selected` if inside an inner phase (`creating-relative`, `targeting-connect`, `choosing-kinship`, `confirming-dissolve`).
     - Deselects to `idle` if in `selected`.

3. **Unified Connect Mode**:
   - All connection intents (2D Action Handle, 3D panel Connect button, and `PersonDetailDrawer` Connect button) dispatch `START_CONNECT` to the state machine.
   - `AdminConnectLinkModal` is retired.
   - Target validity and immediate rejection feedback (`rejectedTarget: { nodeId, reason }`) are computed via `src/components/cards/connectCandidates.ts`.

4. **Centralized Dissolve Confirmation**:
   - `confirming-dissolve` is owned entirely by the state machine.
   - The fragile 2D hover auto-cancel heuristic in `NodeCard.tsx` is removed; confirmation requires explicit ✓, ✕, Escape, or backdrop dismissal in both 2D and 3D.

5. **Single `DirectManipulationController` Prop**:
   - Replaces ~15 loose direct-manipulation props in `FamilyTree2D` and `FamilyTree3D` with a single `interaction: DirectManipulationController` object containing state, candidate lookups, and action dispatchers.

6. **Separation of Synchronous State from Async Mutations**:
   - The state machine is strictly synchronous.
   - On action commitment, the machine emits typed intent callbacks (`onCommitCreateRelative`, `onCommitConnect`, `onCommitDissolve`) to `FamilyTree.tsx`, which executes `createTreeRecord` operations and coordinates animation lifecycles.

## Considered and Rejected

- **Placing async write effects and `treeRecord` inside the state machine**: Rejected to preserve pure determinism and enable 100% test coverage in the node test environment without mock database transports.
- **Putting keystroke-level name input state into the machine**: Rejected to prevent re-rendering the entire canvas graph on every character typed in the Ghost Node card or docked panel.
- **Retaining `AdminConnectLinkModal`**: Rejected because `treeRecord` already enforces unified write routing and authorization for all link operations.

## Consequences

- The seam between `FamilyTree.tsx` and 2D/3D views drops from 61/42 props to a clean controller interface.
- Escape and backdrop dismissal semantics are unified in a single, thoroughly tested module.
- 2D and 3D views remain visually independent (respecting ADR-0002) while sharing identical interaction logic and state transitions.
