---
name: verify-osra
description: Drive the real Osra web app (Vite dev server on the dev Supabase project, owner's signed-in session in Orca's built-in browser) to prove a user-facing change and capture evidence. Use when a ticket's acceptance needs a browser check of the landing page, the family tree (2D/3D, family picker, search, person drawer), or the family chat.
---

# Verify Osra

Osra is a single-page React app. A signed-out visitor sees the landing page; a signed-in, bound user sees the family tree with the family chat. Proof means driving that UI in Orca's built-in browser and capturing what it shows. Unit tests (`npm test`) are a different job.

Helpers live in `.claude/skills/verify-osra/scripts/` (run them from anywhere inside the repo checkout you are verifying). Every run gets a **run dir** under `/tmp/osra-verify/<timestamp>-<sha>/`: `state/` (pid, tab id, HEAD) is scratch, `evidence/` is the proof and outlives cleanup. Evidence stays outside the checkout because Orca's "Create PR" commits untracked files.

## Guardrails

- **Dev only.** `launch.sh` refuses unless `.env.local` points at dev (`djwqamcfllqziqiyvyjj`). The dev database holds real family names: evidence stays local, never in a commit, ticket, or artifact link.
- **Read-only drives.** The owner's account is an admin. Drive only controls that read: family picker, search, selecting a person, view toggles, opening the chat. Leave the Tree Record writes alone (`Edit Registry`, `+ Add Relative`, `Invite to Tree`, `Connect Nodes...`, `Manage Links`, `Delete Entry`, `+ ADD PERSON`, and the `+ Parent` / `+ Spouse` / `+ Child` / `Delete` pills around a selected 2D node). When a ticket's acceptance is a write, stop and hand the owner exact steps instead.
- **Keep the session.** Leave `Sign Out` untouched: the owner signed in with Google in Orca's browser and an agent cannot sign back in. For signed-out pages use the `127.0.0.1` origin (see [landing](features/landing.md)).
- **One instance, in turn.** The session and Google redirect URLs are bound to port 5173, so only one verification server can run at a time, across all worktrees. When 5173 is taken, `launch.sh` prints `WAIT` lines and starts once the port frees, for up to 20 minutes (`OSRA_WAIT_SECS`). After that it refuses: ask the owner rather than driving or killing a server you did not start. Run `cleanup.sh` as soon as your check is done, because the next run waits on it.

## Launch

```bash
S=.claude/skills/verify-osra/scripts
$S/launch.sh                       # last line: RUN_DIR=/tmp/osra-verify/...
RUN_DIR=/tmp/osra-verify/...       # copy it from the output
$S/open-tab.sh "$RUN_DIR"          # opens http://localhost:5173/ in Orca, records the page id
```

Ready means `launch.sh` printed `READY http://localhost:5173 ... Supabase: djwqamcfllqziqiyvyjj`. It runs `npm ci` first when `node_modules` is missing. Vite hot-reloads, so edits after launch show up without a restart. A new worktree has no `.env.local` (it is gitignored), and then `launch.sh` exits 1 without printing anything: copy the file from the main checkout first.

## Doctor

```bash
$S/doctor.sh "$RUN_DIR"
```

Read-only. Checks: our vite pid is alive, it owns port 5173, it announced the dev Supabase ref, the page serves Osra, HEAD vs launch, Orca is reachable, and the run's tab holds a dev Supabase session. Run it first, and again whenever anything looks off. A `WARN ... no dev Supabase session` means the signed-in features will show the landing page: the owner must sign in with Google in that Orca tab.

## Drive

`ui.sh` drives the run's tab by accessible role and name, resolving fresh refs from an Orca snapshot on every call:

```bash
$S/ui.sh "$RUN_DIR" tree                                   # print the accessibility tree
$S/ui.sh "$RUN_DIR" click button "INSTRUMENTS ▾"           # click a control that is on screen
$S/ui.sh "$RUN_DIR" pick button "Badran"                   # item in an open scrollable menu
$S/ui.sh "$RUN_DIR" fill textbox "Search family tree" "Zabalawi"
$S/ui.sh "$RUN_DIR" person <Given> Badran                  # click a person node in the 2D tree
$S/ui.sh "$RUN_DIR" tap 250 650                             # click empty space (CSS pixels; viewport ~885x812)
$S/ui.sh "$RUN_DIR" key Escape
$S/ui.sh "$RUN_DIR" goto /invite/some-token                # path on http://localhost:5173
$S/ui.sh "$RUN_DIR" wait-text "Invalid Invite"
```

Names match exactly; prefix with `~` for a substring (`click button "~SELECT FAMILY"`). Anything else goes through `orca <command> --page "$(cat $RUN_DIR/state/page)"` (`orca eval`, `orca scroll`, `orca reload`; see `orca skills get orca-cli --reference references/browser.md`).

Osra-specific traps:

- The snapshot lists controls inside collapsed panels (INSTRUMENTS, SELECT FAMILY) as if visible. Open the panel first (its button's arrow flips `▾` → `▴`) and let it settle about 1.5 s and pump one `orca screenshot` before clicking; otherwise a click can land on the canvas behind the panel and select a Person; a click on a hidden control does nothing. `pick` waits for you.
- Reserve `pick` for items of an open scrollable menu. Scrolling a control inside a collapsed panel pans the whole app off-screen; `orca reload` recovers.
- Person nodes exist in the snapshot only in 2D with a family selected. The 3D view is a WebGL canvas: its nodes have no accessibility handles, so prove 3D with screenshots plus the side panels. The canvas has no `preserveDrawingBuffer`, so `toDataURL` crops come out blank: crop an `orca screenshot` (its base64 `data`) with PIL instead.
- View mode (`family-tree-view-mode`), Canvas Mode (`family-tree-canvas-mode`, written only by the COSMOS ⇄ PAPER switch; absent means Paper), Paper colour (`family-tree-paper-colour`), the Paper 3D hint (`family-tree-paper-hint-seen`) and the "who's new" acknowledgement persist in the owner's localStorage. The retired `family-tree-background-theme` key may still be there; nothing reads it. Note the starting values and put them back before cleanup (remove any of these keys that was absent). The selected family resets on reload.
- An off-screen Orca tab is throttled: springs stall, screenshots go stale and clicks on INSTRUMENTS items miss. Bring it forward with `orca tab switch --page "$(cat $RUN_DIR/state/page)" --focus`, re-read state after each step, and check motion and timing only in a visible tab, or report them as unverified for the owner.
- Clicks during a loader are swallowed in a slow tab: pump `orca screenshot`s until the loader leaves the DOM.
- `ui.sh person`, `ui.sh tap` and DOM clicks can drop the tab to 1 fps for several seconds, while `ui.sh key` keeps frames coming. Drive motion checks with keys where you can.

The [feature map](features/README.md) holds the per-feature recipes. Read the index, then the feature's file; cover every entry point it lists.

## Evidence

```bash
$S/capture.sh "$RUN_DIR" <feature-id> <step>   # writes <step>.aria.txt and <step>.png under evidence/<feature-id>/
```

Read the PNG back (the Read tool shows it) and check it shows what you claim. Screenshots are the main context cost: about 10 full captures used most of a 250k budget, so read a PIL crop of the region that matters. Proof standards:

- Drive the real user path: clicks, typing and keys through the UI. Setting React state, localStorage, or calling Supabase directly is setup at most, never the proof.
- Capture before and after each action that matters, not only the final screen.
- Verify side effects alongside the screen. Reads: compare a count or name with the dev database (Supabase MCP `execute_sql`, `project_id: djwqamcfllqziqiyvyjj`, `SELECT` only, one statement per call: only the last statement's rows come back). Save the query and its result to `evidence/<feature-id>/db.txt`. Chat: a new `chat_message_usage` row (see [family chat](features/family-chat.md)).
- `evidence/vite.log` is part of the proof: it shows the commit's dev server started on dev and any compile errors.
- Report each entry point as verified, or as skipped with the command tried and the unmet precondition. Check one live line at a time and write its verdict before the next; one long runner script for many checks hides progress and can stall.

## Cleanup

```bash
$S/cleanup.sh "$RUN_DIR"
```

Closes the Orca tab this run opened, stops the vite pid this run started (only if that pid is still vite), deletes `state/`, and lists the surviving `evidence/`. Run it after every run, including failed ones. It never kills by process name, and it leaves other tabs and servers alone.
