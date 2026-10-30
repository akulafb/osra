// src/lib/writeSequencer.ts

import {
  applyPending,
  confirmPending,
  dropPending,
  revertPending,
  type RecordChange,
  type WorkingRecordState,
} from './workingRecord';
import type { ConfirmedRows } from './treeRecord';

/**
 * What a write reported back. A rejection throws `TreeRecordError` instead of
 * arriving here, because a caller has to be told about it; `empty` is the
 * server accepting a write and doing nothing (`already_connected`), which is
 * not a failure and has nothing to tell (D10).
 */
export type WriteOutcome =
  | { kind: 'confirmed'; rows: ConfirmedRows }
  | { kind: 'empty' };

/** apply → commit → confirm | revert | drop (D9). Rethrows a rejection after reverting. */
export type WriteSequencer = (changes: RecordChange[], commit: () => Promise<WriteOutcome>) => Promise<void>;

/**
 * The sequencer for every write (LIN-58). Two Pending Changes can be held at once,
 * and each one has to confirm or revert against whatever the *other* has done
 * since, so it reads `current()` at each step rather than holding a copy.
 */
export function createWriteSequencer(working: {
  current: () => WorkingRecordState;
  advance: (next: WorkingRecordState) => void;
}): WriteSequencer {
  let changeCounter = 0;

  return async (changes, commit) => {
    const changeId = `change-${(changeCounter += 1)}`;
    working.advance(applyPending(working.current(), changeId, changes));
    let outcome: WriteOutcome;
    try {
      outcome = await commit();
    } catch (err) {
      working.advance(revertPending(working.current(), changeId));
      throw err;
    }
    working.advance(
      outcome.kind === 'confirmed'
        ? confirmPending(working.current(), changeId, outcome.rows)
        : dropPending(working.current(), changeId)
    );
  };
}
