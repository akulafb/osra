# Person details

Selecting a person opens a details drawer on the right with their given name, family, ID and the actions the signed-in user may take on them; in 2D the node also grows action pills.

## Sub-features

- `person-select` clicking a node outlines it and opens the drawer.
- `person-drawer` the drawer shows the given name as a heading, "<FAMILY> FAMILY", and "ID: <uuid>".
- `person-actions` the drawer lists Edit Registry, + Add Relative, Invite to Tree and, for admins, ADMINISTRATIVE TOOLS (Connect Nodes..., Manage Links, Delete Entry).
- `person-close` clicking empty tree space deselects the person and closes the drawer.

## How to get to it (user POV)

- Click a person in the 2D tree.
- In 3D, click a planet, or Tab through people and press Enter.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold; 2D with a family selected (e.g. Badran).

- **Select.** Take any person from `ui.sh tree` (a node group's two text lines: given name, then family) and run `$S/ui.sh "$RUN_DIR" person <Given> Badran`. `ui.sh tree` starts with `heading "<Given>" [level=4]` followed by buttons "Edit Registry", "+ Add Relative", "Invite to Tree"; the screenshot shows the node outlined in white with + Parent / + Spouse / + Child pills, and the drawer reads "BADRAN FAMILY".
- **Cross-check.** The drawer's `ID:` value matches the person in the dev DB: Supabase MCP `execute_sql` on `djwqamcfllqziqiyvyjj`, `SELECT first_name, paternal_family_cluster FROM nodes WHERE id = '<id from the screenshot>';`.
- **Close.** Click empty tree space: run `$S/ui.sh "$RUN_DIR" tap 250 650` (left half, below the first row; check the screenshot that the spot is empty). `ui.sh tree` no longer contains `heading "<Given>"`.
- **Proof.** `capture.sh "$RUN_DIR" person-details open` after selecting and `capture.sh "$RUN_DIR" person-details closed` after closing.

## Gotchas

- Every action button here writes to the Tree Record. Assert the buttons exist; leave them unclicked.
- The drawer's own close icon (the unnamed `button` after the heading) sits under the INSTRUMENTS button, so clicking it does nothing. Escape does not close the drawer either. Close by tapping empty space.
- `person` needs the exact given and family names as shown in the node; Arabic names work as written.
- 3D picking has no accessibility handle; reach a person there through search (a search match selects it) or Tab/Enter, and prove by the drawer heading.
