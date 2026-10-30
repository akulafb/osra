# Turn Osra into a platform

The wayfinder map for LIN-85. It lives here because the Linear workspace has hit its free issue limit. Nothing here has been resolved yet.

**To move it to Linear:** follow "Wayfinding operations" in `docs/agents/issue-tracker.md`. Create the map as one issue labelled `wayfinder:map`, in the Osra project and related to LIN-85. Create each ticket below as a child issue in the Osra project, labelled with its `Type`. Add the blocking edges in a second pass, once every issue has an id. Each ticket's description is its Question and Findings. Then delete this file.

## Destination

Specs and tickets ready for the fb-mode Spec lane, for everything the launch gate needs (ADR 0024). Nothing is built on this map.

## Notes

Engineering planning for Osra. The Owner's decisions are in ADR 0017 to 0025 and `GLOSSARY.md`: read them before working any ticket, and use the glossary's terms.

Work each `grilling` ticket with the Owner, using `grilling` and `domain-modeling`, then write its spec with `to-spec` and its tickets with `to-tickets`. There is no legal research ticket and no lawyer review (ADR 0023).

## Decisions so far

None yet.

## Not yet specified

- The per-Tree paid plan. It comes after launch (ADR 0021, ADR 0024).

## Out of scope

- Building the macOS and Android apps. No decision on this map should rule them out.
- Copying a branch and GEDCOM import. They come after launch (ADR 0024).

## Tickets

### What does one chat message cost?

- **Type:** `wayfinder:research`
- **Blocked by:** nothing
- **Findings:** `docs/research/chat-cost.md` on branch `research/chat-cost`

**Question:** What do one `family-chat` message and one `spelling-matches` call cost today, with the models and prompts they use now? What would a day and a month cost at 5 messages per account per day, for 100, 1,000 and 10,000 active accounts? The Owner sets the monthly cap's dollar amount from this (ADR 0021).

### Which payment provider fits a per-Tree plan?

- **Type:** `wayfinder:research`
- **Blocked by:** nothing
- **Findings:** `docs/research/payment-provider.md` on branch `research/payment-provider`

**Question:** Which payment provider best fits one recurring plan, bought per Tree by its Master Admin, for an Owner working alone with no legal review? Compare a merchant of record with a plain payment processor on fees, who handles sales tax and VAT, refunds and chargebacks, and how a subscription ties to one Tree. The plan itself comes after launch (ADR 0021).

### How should Osra send notification email?

- **Type:** `wayfinder:research`
- **Blocked by:** nothing
- **Findings:** `docs/research/notification-email.md` on branch `research/notification-email`

**Question:** How should Osra send email such as the 90-day absent Master Admin notice (ADR 0023)? Sign-in is Google only, so nothing sends email today. Compare the options that work with a Supabase project on cost at low volume, deliverability setup on the Osra domain, and how a Supabase edge function or scheduled job would call them.

### Can the canvas handle 5,000 Persons?

- **Type:** `wayfinder:research`
- **Blocked by:** nothing
- **Findings:** `docs/research/canvas-5000.md` on branch `research/canvas-5000`

**Question:** A Tree can hold 5,000 Persons (ADR 0022), and the browser loads all of a Tree's Persons and Kinship Links and walks them there (ADR 0019). Where do load, layout and rendering break down at 1,000, 2,500 and 5,000 made-up Persons, in the 2D and Paper 3D views? What would have to change, or does the limit have to come down?

### Spec: separating Trees in the database

- **Type:** `wayfinder:grilling`
- **Blocked by:** nothing

**Question:** What is the schema and access model for many Trees? It covers the Tree and membership tables, the binding of an account to a Person moving onto its membership (ADR 0018), roles per Tree in place of `users.role` (ADR 0020), the Tree on every table, RPC and write gate, and a Tree-isolation test for each policy (ADR 0019).

### Spec: moving the first Tree in

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: separating Trees in the database

**Question:** What are the steps, checks and way back for moving the first Tree in during a short planned outage, rehearsed first on a copy in dev (ADR 0024)? Afterwards every account bound to a Person is a Member, today's admins are Admins, the Owner is Master Admin, and unused invite links still work. What happens to an account with no Person (ADR 0024 leaves this open)?

### Spec: sign-up, first run and invites

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: separating Trees in the database

**Question:** What does a new account see and do, with and without an invite (ADR 0022)? It covers giving a name, the first Person and renamable Tree, landing on the canvas, "Start your own Tree", the Tree switcher, the invite rules, and enforcing the limits of one Tree as Master Admin and 5,000 Persons per Tree, which the Owner can lift.

### Spec: chat limits and cap

- **Type:** `wayfinder:grilling`
- **Blocked by:** What does one chat message cost?; Spec: separating Trees in the database

**Question:** How do the daily allowance of 5 `family-chat` messages across all Trees, the Owner's per-account lift, the monthly cap across `family-chat` and `spelling-matches`, which stops both while saving a Person still works, and the Master Admin's off switch work (ADR 0021)? What do users see when a limit or the cap stops chat, and when spelling suggestions go missing? How does the Owner raise the cap?

### Spec: export, deletion and absent Master Admins

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: separating Trees in the database; How should Osra send notification email?

**Question:** How do GEDCOM export by the Master Admin and Admins, account deletion, handing over a Tree, Tree deletion with 30 days to recover, and an Admin taking the role after 90 days and an email notice work (ADR 0023)?

### Spec: terms and privacy pages

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: sign-up, first run and invites

**Question:** What do the terms and privacy policy say, where are they accepted at sign-up, and how is acceptance recorded (ADR 0023)? They are written in-house from a standard template. They state that the Owner is not liable for anything, that use of a Tree is entirely up to the user, that an ignored removal request is between the person and the Master Admin, that accounts are for ages 18 and up and children can be Persons but not account holders, and the one contact address, listed only there and in `security.txt`.

### Spec: families per Tree, and family data out of the code

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: separating Trees in the database

**Question:** How does each Tree hold its own families and colours, with Paper Pairs assigned automatically and the first Tree keeping its colours (ADR 0025)? What replaces or removes the real family data listed under "Reference" in LIN-85, in every file there, including migrations and `supabase/reference/`?

### Spec: taking the repo private at launch

- **Type:** `wayfinder:grilling`
- **Blocked by:** Spec: families per Tree, and family data out of the code

**Question:** What are the steps and checks for taking `akulafb/osra` private at launch (ADR 0024)? It covers what depends on the repo being public today, such as deploys, CI and Linear's GitHub integration, and how to confirm that no real family data remains on `main`. Git history keeps the deleted files and old names: ADR 0024 rejects rewriting it, so going private is what ends public access to them.
