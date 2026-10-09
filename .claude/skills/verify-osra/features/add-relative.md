# Add relative

A signed-in user adds a relative to a selected person from the drawer's + Add Relative modal, from the 2D `+ Child` pill or the 3D docked panel (the Ghost Node), or by joining two people in Connect Mode. All of it works in Cosmos and Paper, 2D and 3D; Paper 3D draws the panel, the Ghost Preview and Connect Mode in ink (see [Paper 3D editing](./paper-mode.md#paper-3d-editing-lin-96-passes-96a-to-96c)). Adding a child links the parent's spouse as the child's other parent in the same write: without asking when the parent has had one spouse, with an OTHER PARENT choice (current spouse preselected, former ones marked "(former)", or "Not known") when there were several. One line is still drawn to the child.

## Sub-features

- `add-child-one-spouse` a child of a parent with one spouse, ever, gets both parent links; the modal shows "OTHER PARENT" with the spouse's name, the Ghost Node "Other parent: <name>".
- `add-child-choose` a parent with several spouses shows an OTHER PARENT select; the current spouse is preselected, and "Not known" writes one link.
- `add-child-no-spouse` a parent with no spouse writes one link, with no other-parent line.
- `add-child-existing` connecting an existing person as a child links the other parent too, unless that child already has another parent.
- `add-child-connect` Connect Mode's "<A> is parent of <B>" shows the same note or select.
- `add-child-drawn-once` the child has two parent links in the data but one line to it on screen.

## How to get to it (user POV)

- Select a person (see [person details](./person-details.md)), then + Add Relative in the drawer, "Add as child".
- Typing an existing Person's name in the modal lists MATCHES DETECTED IN ARCHIVE; picking one (no submit) previews the link as a dashed line in every view (Paper 3D: see [Paper 3D editing](./paper-mode.md#paper-3d-editing-lin-96-passes-96a-to-96c)).
- In 2D, select a person and click the `+ Child` pill; in 3D (Cosmos or Paper, desktop only), select a planet or disc and use the docked panel's child handle.
- ADMINISTRATIVE TOOLS → Connect Nodes..., click the second person, pick "<A> is parent of <B>", then Establish Link.
- In 3D, the docked panel's `🔗 Connect` enters the same Connect Mode.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold; 2D with a family selected.
- Adding a relative writes the Tree Record, so the agent does not click any of the controls above (`../SKILL.md` Guardrails). The owner performs the steps marked **Owner** on dev; the agent proves them with screenshots and read-only `SELECT`s on `djwqamcfllqziqiyvyjj` (Supabase MCP `execute_sql`).
- Pick a parent with exactly one spouse (P1), one with two or more (P2), and one with none (P0) from the dev DB, e.g. `SELECT n.id, n.first_name, count(*) FROM nodes n JOIN links l ON l.type IN ('marriage','divorce') AND n.id IN (l.source_node_id, l.target_node_id) GROUP BY n.id, n.first_name ORDER BY 3 DESC;`. Every test child is named `Zz Lin79 <case>` so it is easy to find and delete.

- **Owner: one spouse (modal).** Select P1, + Add Relative, first name `Zz Lin79 One`, "Add as child". The modal shows "OTHER PARENT" and P1's spouse; Add to tree. The agent runs `capture.sh "$RUN_DIR" add-relative one-spouse`, then `SELECT p.first_name, l.parent_role FROM links l JOIN nodes p ON p.id = l.source_node_id WHERE l.type = 'parent' AND l.target_node_id = (SELECT id FROM nodes WHERE first_name = 'Zz Lin79 One');` returns two rows, P1 and the spouse, roles `mother`/`father` from their genders.
- **Owner: several spouses (Ghost Node).** Select P2, click the `+ Child` pill, type `Zz Lin79 Choose`. The card shows "Other parent:" with a select, the current spouse preselected; press Enter. The same `SELECT` (name `Zz Lin79 Choose`) returns P2 and the preselected spouse. Repeat with "Not known" picked (`Zz Lin79 Unknown`): one row.
- **Owner: no spouse.** Select P0, + Add Relative, `Zz Lin79 None`, "Add as child". No OTHER PARENT line; the `SELECT` returns one row.
- **Owner: Connect Mode.** INSTRUMENTS → + ADD PERSON, `Zz Lin79 Connect` in P1's family. Select P1, ADMINISTRATIVE TOOLS → Connect Nodes..., click `Zz Lin79 Connect`, pick "P1 is parent of Zz Lin79 Connect". The picker shows "Other parent: <spouse>"; Establish Link. The `SELECT` (name `Zz Lin79 Connect`) returns P1 and the spouse. Picking P1 as parent of `Zz Lin79 None` instead shows no other-parent line, because that child already has a parent (P0).
- **Drawn once.** With the family showing `Zz Lin79 One`, `ui.sh tree` lists the node and the screenshot shows one parent line reaching it (from one of the two parents), not two.
- **Owner: cleanup.** For each `Zz Lin79 …` node: select it, ADMINISTRATIVE TOOLS → Delete Entry, confirm. The agent checks `SELECT count(*) FROM nodes WHERE first_name LIKE 'Zz Lin79%';` returns 0 and `SELECT count(*) FROM links l LEFT JOIN nodes n ON n.id = l.target_node_id WHERE n.id IS NULL;` returns 0.

- **Owner: Paper 3D (LIN-96).** Paper 3D at 1025 px or wider. Select P1, `+ Child`, `Zz Lin96 Child`, Enter: the newcomer's disc appears beside P1 and nobody else moves; the `SELECT` (name `Zz Lin96 Child`) returns P1 and the spouse. INSTRUMENTS → + ADD PERSON `Zz Lin96 Alone`: a disc at the edge of the cloud. Select P1, drawer Connect Nodes..., click `Zz Lin96 Alone`, pick "P1 is parent of Zz Lin96 Alone", Establish Link: the line appears. Clean up as below with `Zz Lin96%`.

## Gotchas

- The Working Record shows both links before the server answers. Prove the write with the `SELECT`, not the screen alone.
- A parent whose gender is not recorded writes the anchor's link with no role; the other parent's role still comes from their own gender.
- The other-parent choice is made from the anchor's marriage and divorce links. A spouse recorded only through a shared child does not count.
- An existing child who already has a parent besides the anchor never gets a third: no line is shown and one link is written.
- Delete Entry removes the Person's links with it; there is no separate link cleanup.
