import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkingRecord } from '../contexts/WorkingRecordContext';
import { createRecorder, type Recorder } from '../lib/recorder';
import type { LifecycleController } from './useLifecycles';

/**
 * The Recorder for this session (ADR-0016): who is signed in, the one Working
 * Record, and the one lifecycle clock, wired together. It changes only when the
 * identity does.
 */
export function useRecorder({ start, abort }: Pick<LifecycleController, 'start' | 'abort'>): Recorder {
  const { user, isAdmin, session } = useAuth();
  const { latest, write } = useWorkingRecord();
  const userId = user?.id;
  const sessionToken = session?.access_token;

  return useMemo(
    () =>
      createRecorder({
        identity: userId ? { userId, isAdmin, sessionToken } : null,
        graph: latest,
        write,
        lifecycles: { start, abort },
      }),
    [userId, isAdmin, sessionToken, latest, write, start, abort]
  );
}
