# Osra verification map

The maintained source for verifying Osra's user-facing behaviour. Read this index, then use the matching feature file as the recipe. Commands assume `S=.claude/skills/verify-osra/scripts` and a `RUN_DIR` from `launch.sh` (see `../SKILL.md`).

## Baseline preconditions

- `launch.sh` printed `READY http://localhost:5173 ... Supabase: djwqamcfllqziqiyvyjj`, and `open-tab.sh` recorded the run's tab.
- `doctor.sh "$RUN_DIR"` passes, including `tab ... has a dev Supabase session` for signed-in features.
- The tab starts at `http://localhost:5173/` showing the tree (2D: "Select a family above to explore, or try the 3D view."; 3D: the starfield). Record which with `orca eval --page "$(cat $RUN_DIR/state/page)" --expression "localStorage.getItem('family-tree-view-mode')" --json`.

## Driving conventions

- Drive through `ui.sh` by role and accessible name; fall back to `orca ... --page` only for what `ui.sh` lacks.
- Open a panel, let it settle, then act inside it. `pick` for items in a scrollable menu, `click` for everything else.
- Re-run `ui.sh tree` after anything that changes the page; refs are not stable across snapshots.
- Every recipe is read-only. Write controls are listed in `../SKILL.md` Guardrails; a write acceptance goes to the owner as steps.
- Before cleanup, restore the starting view mode.

## Proof and skip reporting

- `capture.sh` before and after each action that changes what the user sees; read the PNG back.
- Name the feature ID and entry point used with every artifact.
- Pair the screen with a second view of the data when the feature shows data (dev DB `SELECT`, chat usage row).
- An entry point you could not reach is reported as skipped, with the command tried and the unmet precondition, never as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behaviour, then exactly four H2s in order: `Sub-features` (short IDs), `How to get to it (user POV)`, `Driving it with ui.sh` (starting with `Preconditions:`, then labeled bullets pairing an action, an exact command and the observable result), and `Gotchas`.

## Features

- [Landing page](./landing.md): the signed-out page, public metrics and the Google sign-in entry.
- [Tree views](./tree-views.md): family picker, 2D/3D switch, 3D toggles and the INSTRUMENTS panel.
- [Paper mode](./paper-mode.md): the COSMOS ⇄ PAPER switch, Paper 2D in ink on paper, and the Paper panels.
- [Tree search](./tree-search.md): finding people by name, stepping through matches, keyboard entry.
- [Person details](./person-details.md): selecting a person and the details drawer.
- [Family chat](./family-chat.md): the 🤖 assistant, its answers and the daily message limit.
- [Add relative](./add-relative.md): adding a child links both parents (owner performs the writes; the agent checks the dev DB).

Not yet mapped: the invite claim page (`/invite/:token`; a bogus token shows heading "Invalid Invite"), FIND ME, the "See who's new!" modal, and the other write flows (edit, delete, invites; adding anything but a child).
