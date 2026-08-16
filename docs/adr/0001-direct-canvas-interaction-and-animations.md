# 0001 Direct Canvas Interaction and Spring/Particle Animation Pipeline

We decided to prioritize in-tree direct manipulation (Directional Action Handles, transient Ghost Nodes, Two-Click Connect Mode) and playful spring/particle dissolve animations over modal dialogs for tree CRUD in the 2D view. 

## Context & Decision

- **Action Handles & Ghost Nodes**: Hovering/selecting an authorized Tree Node exposes directional badges (`+ Parent` on top, `+ Child` on bottom, `+ Spouse` on side). Clicking one anchors a lightweight Ghost Node with a dashed guide line, allowing instant creation with just a first name and Enter key, accompanied by inline duplicate candidate autocomplete.
- **Two-Click Connect Mode**: Connecting existing nodes uses a two-click targeting state across cards instead of an administrative modal.
- **Animation Lifecycles**: Spawning triggers an optimistic spring pop (`scale: [0, 1.15, 1]`) and SVG stroke path growth. Deletions prompt an inline card shake confirmation followed by a particle disintegration dissolve.
- **Permissions**: Action Handles strictly obey `canEdit` permissions.
- **Modals**: Traditional dialog modals are relegated to a secondary fallback for bulk operations and advanced administration.
