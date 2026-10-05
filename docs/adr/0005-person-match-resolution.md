# 0005 Person Match Resolution

We decided to answer "is this Person already in the Tree Record?" in one module
(`src/lib/personMatch.ts`), to trigger a hard block only on an exact given-name
match, and to keep matching against the whole Tree Record while labelling
matches the active filter is hiding.

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
  *(LIN-64 closed the second half: `addLink` now returns `alreadyConnected`, and the flag turned
  out to be unreachable rather than merely unread — `link_existing_relative_secure` raised
  `column reference "target_node_id" is ambiguous` before it could ever be returned. See
  [ADR-0010](0010-write-seam-return-contract.md).)*

## Addendum: Spelling Matches (LIN-68)

A substring compare cannot see that "Mohamed" and "Mohammed" are one name, so the
same Person could be added twice under two spellings. The `spelling-matches` Edge
Function (LIN-67) scores each distinct given name in the Tree Record against the
typed name with TypeSafe Jev; a score of **0.5 or more** is a **Spelling Match**.

5. **A Spelling Match is part of the Person Match answer, and only advice.** Each
   `PersonMatch` carries `isSpellingVariant`, and `matchExistingPersons` alone
   applies the threshold (`SPELLING_MATCH_THRESHOLD`). A Spelling Match alone gives
   `candidates`, never `must-confirm`, and does not disable the Ghost Node's ↵.
   At the threshold used, the prototype had 17 wrong extras in 63 lookups; a block
   that fires that often on the wrong Person is the click-through obstacle
   decision 2 exists to avoid. An exact given-name match still gives `must-confirm`
   whatever the scores say, and is never also labelled a Spelling Match. Nor is a
   given name that already contains the query: "Moham" is Mohammed half-typed, not
   spelled differently, so it stays an ordinary substring match.

6. **Order: exact, then Spelling Matches, then other substring matches**, each
   alphabetical. The cap of 4, the hidden-match count and the `isVisible` /
   `isAlreadyConnected` labels apply to Spelling Matches unchanged, and the lookup
   uses the whole Tree Record (decision 3): one request per query, each distinct
   given name sent once, the score mapped back to every Person with that name.

7. **The network never holds up typing, and never breaks it.** The substring match
   is computed synchronously; Spelling Matches join the list when the function
   answers. The timing rules live in one place (`src/lib/spellingMatchLookup.ts`,
   used through `src/hooks/usePersonMatch.ts`): a 300 ms debounce, no lookup below
   the minimum query length, a 5 s timeout, and a reply for an old query is never
   reported. Scores also carry the query they answer, and `matchExistingPersons`
   ignores scores for any other query, so a stale reply cannot show even if a
   caller holds on to it. If the function is slow, failing, signed out or offline,
   the answer is exactly the substring match and no error is shown — a missing
   suggestion is not something the user can act on.

### Consequences

- Every Person Match caller that matches while typing should use `usePersonMatch`,
  not `matchExistingPersons` directly, or it silently loses Spelling Matches. The
  Ghost Node (2D and 3D), the Add Relative modal and the Edit Node modal all do
  (LIN-69), and all three take the "different spelling" label from
  `SPELLING_MATCH_LABEL`. In both modals a Spelling Match alone never blocks
  Submit or Save; an unchanged name in Edit Node sends no lookup.
- Each pause in typing costs one function call (and one TypeSafe request) for a
  signed-in editor. The list may reshuffle when Spelling Matches arrive; that is
  accepted, and the timeout bounds how late it can happen.
