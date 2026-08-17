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
A typed genealogical edge connecting two Persons (`parent`, `marriage`, or `divorce`, with an optional `parent_role` for mother/father). Expressed as an absolute edge between two IDs.
_Avoid_: Edge, Connection, Wire, Branch

**Tree Record**:
The persisted set of Persons and Kinship Links — the authoritative family tree, as distinct from the Tree Nodes drawn on a canvas.
_Avoid_: Family tree (already names three view components), Graph, Store, Database

**Relative Direction**:
The direction an Action Handle points — Parent, Child, Spouse or Sibling — expressed relative to an anchor Person. It is not a Kinship Link type: Parent and Child both resolve to a `parent` link with the endpoints reversed, Spouse resolves to `marriage`, Sibling resolves to a `parent` link from the anchor's own parents, and `divorce` has no Relative Direction at all.
_Avoid_: Relation type, Link type, Relationship

### Direct Interaction

**Action Handle**:
A trigger that initiates an immediate inline action on a Tree Node (Parent, Child, Spouse, Connect, Dissolve). Positioned directionally on the card's edges in the 2D view, and in a screen-docked panel in the 3D view.
_Avoid_: Modal button, Menu item, Gizmo

**Ghost Node**:
A transient, unpersisted node placeholder anchored at a directional offset while the user types a name or selects an existing match.
_Avoid_: Dummy card, Draft node, Preview modal

**Connect Mode**:
A two-click targeting state where selecting a source node and a target node interactively creates a Kinship Link on the canvas.
_Avoid_: Linking modal, Wire mode

**Ghost Preview**:
A translucent, non-interactive marker occupying the position a new Tree Node will take, tethered to its anchor and labelled with the name as it is typed. Shows *where* a relative will land; the Ghost Node is where the name is entered.
_Avoid_: Ghost node (that is the input card), Placeholder planet, Phantom

### Animation Lifecycles

**Spawn**:
The celebratory entry animation when a Tree Node or Kinship Link is created on the canvas — a spring-loaded pop with path growth in 2D, a supernova burst in 3D. One lifecycle, rendered differently per view.
_Avoid_: Fade-in, Render, Pop-up; naming the 3D rendering ("Supernova") as a separate lifecycle

**Dissolve**:
The disintegration exit animation when a Tree Node or Kinship Link is removed following inline confirmation — particle fraying in 2D, a black hole collapse in 3D. One lifecycle, rendered differently per view.
_Avoid_: Hard delete, Disappear, Wipe; naming the 3D rendering ("Black Hole") as a separate lifecycle
