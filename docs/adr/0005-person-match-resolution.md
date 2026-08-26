# 0005 Person Match Resolution

We decided to answer "is this Person already in the Tree Record?" in one module
(`src/lib/personMatch.ts`), to trigger a hard block only on an exact given-name
match, and to keep matching against the whole Tree Record while labelling
matches the active filter is hiding.

> Numbering note: `docs/adr/` already contains two files numbered 0004
> (`0004-direct-manipulation-state-machine.md`, `0004-server-side-write-authorization.md`),
> pre-existing on `main`. Renumbering is left to a separate housekeeping change so
> it does not muddy this behaviour diff.

## Context & Problem

Three implementations answered the question with three different rules:

| Implementation | Min chars | Matches on | Cap | Sorted | Blocks submit |
|---|---|---|---|---|---|
| `cards/ghostNodeCandidates.ts` (Ghost Node, 2D + 3D) | 2 | full haystack | 4 | no | no |
| `modals/AddRelativeModal.tsx` | 3 | full haystack | none | yes | yes |
| `modals/EditNodeModal.tsx` | 3 | `firstName` only | none | no | n/a |

The strictest of the three guarded the path ADR-0001 demoted, and the primary
creation path — the Ghost Node — did not guard at all. Two further problems:

- **`AddRelativeModal`'s guard was not a duplicate guard.** It fired on
  `candidates.length > 0` over a substring match of the whole haystack, so typing
  "Bad" was unsubmittable against everyone in the Badran cluster.
- **All five call sites matched against the unfiltered node list while rendering
  from a filtered one.** Whether that was a bug depended on which way you read it.

## Decision

1. **One module, one `intent`.** Creation ("does this Person exist?") and renaming
   ("am I colliding with one?") differ in resolution, not in matching, so `intent`
   selects the rename skip and nothing else. All five call sites use it, and the
   minimum query length is 2 everywhere.

2. **`must-confirm` fires only on an exact, case-insensitive given-name match.**
   Everything else is `candidates` — advisory. A noisy dropdown is ignorable; a
   guard that fires on every substring reads as an obstacle and gets clicked
   through. Exactness is judged *before* the cap, so an exact match past the
   fourth result still blocks.

3. **The pool is the whole Tree Record; visibility is a label.** Narrowing the
   pool to the filtered graph would *create* duplicates whenever a preset or a
   collapsed subtree is on — the person you would have matched is simply not
   there. Each match instead carries `isVisible`, and callers render "hidden by
   filter". The same reasoning makes already-linked people marked rather than
   excluded: "Ahmad, already your parent" answers the confused user's question,
   silence does not.

4. **Both creation paths block identically.** The Ghost Node's ↵ is disabled on
   `must-confirm`, with a `title` naming who it collided with and a "Different
   person" control that clears it. `EditNodeModal` blocks Save behind the same
   single confirm. If any caller may ignore the resolution, policy is back at the
   call site, which is the failure this module exists to end.

## Consequences

- **Against ADR-0001.** The Ghost Node exists because the modal interrupts, and a
  hard block puts an interruption back on it. Accepted because decision 2 makes
  the block rare and decision 4 makes it explicable. If it proves annoying in
  use, two-step Enter is the fallback and needs no module change.
- **`EditNodeModal` gains friction on a path nobody complained about**, and its
  matching widens from `firstName` to the full haystack. Both are deliberate: it
  was getting the worst answer of the three, missing cluster matches entirely.
- **Same-name relatives are common in this tree**, so the exact-name trigger will
  fire more often here than in a typical address book. That is the intent, and it
  is the first thing to watch.
- **Duplicate Kinship Links remain writable by admins** (`public.links` has no
  unique constraint) and `already_connected` is still read by nothing. The
  `isAlreadyConnected` marking hides both in the UI without fixing either; they
  are write-path bugs and are tracked separately.
