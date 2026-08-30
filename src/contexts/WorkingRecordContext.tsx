// src/contexts/WorkingRecordContext.tsx

import React, { createContext, useContext } from 'react';
import { useWorkingRecordOwner, type WorkingRecordController } from '../hooks/useWorkingRecord';

const WorkingRecordContext = createContext<WorkingRecordController | undefined>(undefined);

/**
 * The one owner of the Working Record in memory (LIN-63, ADR-0009).
 *
 * This was a hook, and two components called it: `FamilyTree` and, through
 * `useFamilyChat`, the unconditionally mounted `FamilyChat`. That is two
 * independent copies of the same family tree — six requests per page load —
 * and only the tree's copy was ever refetched, so a Person Spawned after load
 * stayed invisible to every answer the chat gave for the rest of the session.
 * A provider makes the second copy unreachable rather than merely absent.
 *
 * Since LIN-58 it also carries `write`, so the four modals that used to be
 * handed `onSuccess={refetch}` reach the sequencer through the same owner
 * instead of through four props.
 */
export function WorkingRecordProvider({ children }: { children: React.ReactNode }) {
  const controller = useWorkingRecordOwner();

  return (
    <WorkingRecordContext.Provider value={controller}>{children}</WorkingRecordContext.Provider>
  );
}

/**
 * Read the owner's Working Record. Throws rather than quietly handing back an
 * empty graph, because a missing provider is a wiring mistake and the symptom —
 * a tree that renders nothing — looks exactly like an empty family.
 */
export function useWorkingRecord(): WorkingRecordController {
  const context = useContext(WorkingRecordContext);
  if (context === undefined) {
    throw new Error('useWorkingRecord must be used within a WorkingRecordProvider');
  }
  return context;
}
