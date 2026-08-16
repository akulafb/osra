# Osra

An interactive visual family tree platform enabling collaborative genealogy exploration and playful direct-manipulation tree construction.

## Language

### Core Entities

**Person**:
A family member record in the database identified by `first_name` and optional cluster affiliations.
_Avoid_: User, Member, Profile (when referring to family nodes)

**Tree Node**:
The visual representation and interactive card of a Person positioned on the tree canvas.
_Avoid_: Box, Vertex, Bubble

**Kinship Link**:
A typed genealogical edge connecting two Persons (`parent`, `marriage`, or `divorce`, with an optional `parent_role` for mother/father).
_Avoid_: Edge, Connection, Wire, Branch

### Direct Interaction

**Action Handle**:
Directional triggers on a Tree Node (Top: Parent, Bottom: Child, Side: Spouse, Pill: Connect / Dissolve) that initiate immediate inline actions.
_Avoid_: Modal button, Menu item, Gizmo

**Ghost Node**:
A transient, unpersisted node placeholder anchored at a directional offset while the user types a name or selects an existing match.
_Avoid_: Dummy card, Draft node, Preview modal

**Connect Mode**:
A two-click targeting state where selecting a source node and a target node interactively creates a Kinship Link on the canvas.
_Avoid_: Linking modal, Wire mode

### Animation Lifecycles

**Spawn**:
The spring-loaded, celebratory entry animation and SVG path growth when a Tree Node or Kinship Link is created on the canvas.
_Avoid_: Fade-in, Render, Pop-up

**Dissolve**:
The particle disintegration and fraying exit animation when a Tree Node or Kinship Link is removed following inline confirmation.
_Avoid_: Hard delete, Disappear, Wipe
