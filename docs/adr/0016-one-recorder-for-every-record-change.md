# 0016 One Recorder turns an intent into what is drawn, written and played

## Context

Recording a relative took one intent and implemented it four ways: the Ghost Node's handlers in `FamilyTree.tsx`, `AddRelativeModal`, `AdminAddPersonModal` and the edit modals each built their own Pending Change, called `createTreeRecord` and decided what played. `createTreeRecord` had ten call sites, and the paths had drifted. The Ghost Node sent no parent role where the modal did, only the canvas played a Spawn, and only the canvas refused to connect an existing Person as a sibling. The modal's "approximation" of that connect wrote the anchor as the existing Person's parent, which ADR-0003 decision 3 forbids. The sequence that makes a write optimistic lived inside `useWorkingRecord`, so no test could run the real one.

## Decision

This amends ADR-0003 decision 4, ADR-0004 decision 6, ADR-0007 decision 4 and the consequence in ADR-0009 that has `write` reach the modals through the context.

1. `src/lib/recorder.ts` is the one module that turns an intent into the Pending Change, the write and the Spawn or Dissolve. Every surface that changes the Tree Record states an intent to it: `addRelative`, `connectRelative`, `connectPersons`, `addStandalonePerson`, `editPerson`, `editLink`, `removePerson`, `removeLink`. `treeRecord` stays the write seam, and the Recorder is its only caller outside its definition. The Recorder, not the components, now converts a Relative Direction into Kinship Links.
2. `src/lib/writeSequencer.ts` holds the apply, commit, then confirm, revert or drop sequence, moved out of `useWorkingRecord`. Neither the Recorder nor the sequencer has React in it, so their tests run the real sequencer, the real `treeRecord` and the real lifecycle reducer, faking only `fetch`.
3. `src/hooks/useRecorder.ts` is the thin React adapter. `FamilyTree` calls it, passes `recorder` to the modals as a prop, and keeps only handlers that catch and alert. It is a prop because it needs the lifecycle clock, which `FamilyTree` owns and no provider holds. The state machine still emits its intents to `FamilyTree`; `FamilyTree` no longer executes them.
4. `useLifecycles.run` is gone: it had no callers left once the Recorder started every lifecycle over `start` and `abort`. A rejection has reverted the Pending Change and unwound the lifecycle before it reaches the caller.
5. One intent gives one result, whichever surface states it:
   - **Add Relative and Add Person Spawn**, as the Ghost Node already did, because the glossary defines Spawn as the animation for anything created on the canvas. The modal stays open until the write returns, so part of the animation plays behind it.
   - **The Ghost Node sends the parent role too**, by the modal's rule: `parent` takes the relative's gender; `child` takes the anchor's gender, then the pick. `connectPersons` keeps the picker's role as given, since there the user named it.
   - **Connecting an existing Person as a sibling is refused everywhere**, as a sibling is several Kinship Links, not one (ADR-0003 decision 3).
   - **A blank name or a signed-out user is refused** before anything is drawn. Signing out used to be a silent return. The forms still disable submit on a blank name, and the Dissolve handle still stays hidden from anyone who cannot use it (ADR-0007 decision 9).
   - **A name has one length cap**, the Tree Record's 200. The Ghost Node used to stop at 100.

## Consequences

- A new way to change the Tree Record goes in the Recorder and is tested through its interface.
- The Ghost Node now sends `p_parent_role` when the parent's gender is recorded: the anchor's for `child`, the new or existing relative's for `parent`. If the browser's gender data is stale, the server can refuse a write it used to accept; the modal always had this risk.
- Past sibling connects from the modal may have written wrong parent links. They look the same as real parent links in the data, so this change cannot find or repair them.
- An already-connected write leaves its Spawn playing. The canvas always did; the modal now does too, so it can replay a Spawn on a Kinship Link that already existed.
- `useRecorder` and the modals' wiring have no tests, because vitest here runs in `node` on `*.test.ts` only.
