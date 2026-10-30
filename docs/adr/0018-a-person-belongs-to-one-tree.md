# 0018 A Person Belongs to One Tree

Each Person belongs to exactly one Tree, and each Tree sees only its own Persons (LIN-85). Someone who is a Person on one Tree can be a Member of it and also start their own, empty at launch, and from a copied branch once copying exists. One account can be a Member of many Trees, as a different Person in each, so the binding of an account to a Person moves from the account to its membership of a Tree. This amends ADR 0008's `isClaimed`, which reads `users.node_id`.

Edits do not cross between Trees, and Members of one Tree see nothing of another. A copied Person remembers where it was copied from, which keeps later linking possible. Linking itself is not planned: it is a question for the far future.

## Considered Options

- **One shared graph, with Trees as views of it.** No duplicates, but someone has to decide who edits a shared grandmother, one bad edit reaches several families, and sharing is very hard to undo.
- **Refuse a second Tree.** No duplicates, but a cousin could not add their in-laws' side.
- **Linked Trees now.** Rejected for now: nothing needs it yet, and it can be added later on top of copies that remember their source.

## Consequences

- Copies of the same Person drift apart, and we accept that.
- Trees start empty at launch. Copying a branch and GEDCOM import come later as upgrades.
- Copying a branch can copy living relatives' data into a Tree they are not on, and Persons have no field marking them as living, so a copy can't leave them out. Copying therefore needs approval from the source Tree's Master Admin or an Admin.
