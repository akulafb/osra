# Landing page

A signed-out visitor to Osra sees a scroll-driven landing page: the "Meet Osra" hero over a 3D node graph, live counts of people and families on Osra, three How It Works steps, and Google sign-in buttons.

## Sub-features

- `landing-hero` shows "Welcome to Osra", "Meet Osra" and the tagline over the hero canvas.
- `landing-metrics` shows "On Osra so far" with Individuals and Families counts from the database.
- `landing-steps` shows the three steps: "Receive an Invite", "Claim Your Place", "Explore, find your name, and expand the tree!".
- `landing-signin` starts Google sign-in from "Returning? Sign in" (hero) and "Sign in with Google" (closing CTA).

## How to get to it (user POV)

- Open the site while signed out.
- Sign out from the tree (not available to the agent; see Gotchas).

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold.
- The tab is on the `127.0.0.1` origin, which has no session: `orca goto --page "$(cat $RUN_DIR/state/page)" --url http://127.0.0.1:5173/ --json`.

- **Confirm signed out.** Run `orca eval --page "$(cat $RUN_DIR/state/page)" --expression "String(!!localStorage.getItem('sb-djwqamcfllqziqiyvyjj-auth-token'))" --json`. The result is `"false"`.
- **Hero.** Run `$S/ui.sh "$RUN_DIR" wait-text "Meet Osra"` and `$S/ui.sh "$RUN_DIR" find button "Returning? Sign in"`. Both succeed.
- **Metrics.** Run `$S/ui.sh "$RUN_DIR" tree | grep -A6 'On Osra so far'`. A heading "On Osra so far" is followed by a number with "Individuals" and a number with "Families". Cross-check with Supabase MCP `execute_sql` on `djwqamcfllqziqiyvyjj`: `SELECT * FROM get_public_metrics();` returns `{"individuals": …, "families": …}` with the same two numbers.
- **Steps and CTA.** `ui.sh tree` shows headings "Receive an Invite", "Claim Your Place", "Explore, find your name, and expand the tree!", "Ready to Explore Your Family Tree?" and a button "Sign in with Google".
- **Proof.** Run `$S/capture.sh "$RUN_DIR" landing top`, then `orca scroll --page "$(cat $RUN_DIR/state/page)" --direction down --json` a few times and `$S/capture.sh "$RUN_DIR" landing cta`.
- **Return.** Run `$S/ui.sh "$RUN_DIR" goto /` before driving any signed-in feature.

## Gotchas

- `localhost` and `127.0.0.1` are separate origins with separate storage: the owner's session lives on `localhost:5173` only. Never press `Sign Out` to reach this page.
- The hero is driven by scroll position; the screenshot right after load shows only the hero. Scroll before capturing the steps and CTA.
- The sign-in buttons leave the app for Google. Prove `landing-signin` by its presence unless the ticket changes sign-in, and then hand the click-through to the owner.
