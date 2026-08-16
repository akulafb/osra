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
Screen-relative directional triggers on a Tree Node (up: Parent, down: Child, lateral: Spouse, Pill: Connect / Dissolve) that initiate immediate inline actions. Direction is read against the viewer's screen rather than a world axis, so it holds in both the 2D and 3D views.
_Avoid_: Modal button, Menu item, Gizmo

**Ghost Node**:
A transient, unpersisted node placeholder anchored at a directional offset while the user types a name or selects an existing match.
_Avoid_: Dummy card, Draft node, Preview modal

**Connect Mode**:
A two-click targeting state where selecting a source node and a target node interactively creates a Kinship Link on the canvas.
_Avoid_: Linking modal, Wire mode

**Manipulation Freeze**:
The suspension of tree movement and camera motion for the duration of an inline action, holding the anchor still while the user types a name or picks a target. Concerns the 3D view, whose layout is otherwise in continuous motion.
_Avoid_: Pause, Lock, Freeze frame

### Animation Lifecycles

**Spawn**:
The celebratory entry animation when a Tree Node or Kinship Link is created on the canvas — a spring-loaded pop with path growth in 2D, a supernova burst in 3D. One lifecycle, rendered differently per view.
_Avoid_: Fade-in, Render, Pop-up; naming the 3D rendering ("Supernova") as a separate lifecycle

**Dissolve**:
The disintegration exit animation when a Tree Node or Kinship Link is removed following inline confirmation — particle fraying in 2D, a black hole collapse in 3D. One lifecycle, rendered differently per view.
_Avoid_: Hard delete, Disappear, Wipe; naming the 3D rendering ("Black Hole") as a separate lifecycle
