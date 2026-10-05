# 0012 Store both parent links, draw one

A child has a `parent` Kinship Link to each biological parent the family knows, mother and father, but the tree draws only one line to the child (2D and 3D use the same rule to pick it). Before this, most children were linked to the father only, and code read the mother off the father's spouse; that made the family chat name a sister's son as her husband's stepson, and breaks for remarriages and divorces. Storing both links lets kinship code read the Tree Record as it is, while the drawing stays as uncluttered as before.

## Considered Options

- **Infer the mother from the father's spouse** at read time: no data change, but wrong whenever the father married more than once, and every reader of the Tree Record has to repeat the inference.
- **Store both and draw both**: exact, but doubles the lines into every child and clutters the tree.

## Consequences

- Adding a child links the other parent too, asking only when the parent has had more than one spouse. (Not built yet: LIN-79. Until then the app links the chosen parent only; existing children were filled in once by LIN-78.)
- In the 1-Degree Network a father's spouse becomes a parent, not a stepparent; half-siblings and "mother's side" start to work.
