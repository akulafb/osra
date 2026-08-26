import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Lifecycle,
  LifecycleKind,
  LifecycleState,
  LifecycleSubject,
  LifecycleView,
  SubjectGeometry,
  abortLifecycleAction,
  activeLifecycles,
  captureGeometryAction,
  initialLifecycleState,
  lifecycleKey,
  lifecycleProgress,
  lifecycleReducer,
  nodeIdInLifecycle,
  startLifecycleAction,
  tickAction,
  LifecycleAction,
} from '../lib/lifecycle';

/**
 * The one clock for Spawn and Dissolve (LIN-55, ADR-0007).
 *
 * The pure machine in `src/lib/lifecycle.ts` owns phases; this hook owns the
 * single `requestAnimationFrame` that drives them and the sequencing of the
 * write a lifecycle is optimistic about. Nothing else in the app may schedule
 * animation time — the fragmentation this replaces was four fragments on three
 * timers, none of which agreed.
 *
 * Per-frame progress is deliberately *not* React state. The set of active
 * lifecycles is (it mounts and unmounts effects), but progress is read through
 * `subscribe`, so a playing animation re-renders the handful of leaves drawing
 * it rather than the whole canvas sixty times a second.
 */
export interface LifecycleController {
  /** Which rendering is mounted; fixes the duration a lifecycle starts with. */
  view: LifecycleView;
  /** Active lifecycles. Changes identity only when one starts, aborts or ends. */
  lifecycles: Lifecycle[];
  /** Current progress, or null once the lifecycle is over. */
  progressOf: (key: string) => number | null;
  /** Notified every frame while anything is playing. */
  subscribe: (listener: () => void) => () => void;
  /** Play a lifecycle with no write behind it. */
  start: (
    kind: LifecycleKind,
    subject: LifecycleSubject,
    geometry?: SubjectGeometry | null
  ) => void;
  /**
   * Play a lifecycle optimistically over a write: the animation starts now,
   * and unwinds if the write rejects. Rethrows, so callers still handle the
   * failure — the lifecycle only owns the visual half of the rollback.
   */
  run: <T>(params: {
    kind: LifecycleKind;
    subject: LifecycleSubject;
    commit: () => Promise<T>;
    geometry?: SubjectGeometry | null;
  }) => Promise<T>;
  abort: (kind: LifecycleKind, subject: LifecycleSubject) => void;
  /** Pin where the subject was, once, so a relayout cannot move it. */
  captureGeometry: (key: string, geometry: SubjectGeometry) => void;
  /** The node currently in a Spawn or a Dissolve, for id-addressed renderings. */
  nodeIdIn: (kind: LifecycleKind) => string | null;
}

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Whether the *set* of lifecycles changed, as opposed to only their clocks. */
const isStructuralChange = (before: LifecycleState, after: LifecycleState): boolean => {
  const beforeKeys = Object.keys(before.lifecycles);
  const afterKeys = Object.keys(after.lifecycles);
  if (beforeKeys.length !== afterKeys.length) return true;
  return afterKeys.some((key) => {
    const a = before.lifecycles[key];
    const b = after.lifecycles[key];
    return !a || a.phase !== b.phase || a.startedAt !== b.startedAt || a.geometry !== b.geometry;
  });
};

export function useLifecycles(view: LifecycleView): LifecycleController {
  const stateRef = useRef<LifecycleState>(initialLifecycleState);
  const [lifecycles, setLifecycles] = useState<Lifecycle[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const frameRef = useRef<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const pump = useRef<() => void>(() => {});

  const dispatch = useCallback((action: LifecycleAction) => {
    const before = stateRef.current;
    const after = lifecycleReducer(before, action);
    stateRef.current = after;
    if (isStructuralChange(before, after)) {
      setLifecycles(activeLifecycles(after));
    }
    listenersRef.current.forEach((listener) => listener());
    pump.current();
  }, []);

  // The one clock. It runs only while something is playing, so an idle canvas
  // is not holding a frame loop open.
  pump.current = useCallback(() => {
    if (frameRef.current !== null) return;
    if (Object.keys(stateRef.current.lifecycles).length === 0) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      dispatch(tickAction(now()));
    });
  }, [dispatch]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    },
    []
  );

  const start = useCallback(
    (kind: LifecycleKind, subject: LifecycleSubject, geometry?: SubjectGeometry | null) => {
      dispatch(startLifecycleAction(kind, subject, viewRef.current, now(), geometry));
    },
    [dispatch]
  );

  const abort = useCallback(
    (kind: LifecycleKind, subject: LifecycleSubject) => {
      dispatch(abortLifecycleAction(lifecycleKey(kind, subject), now()));
    },
    [dispatch]
  );

  const run = useCallback(
    async <T,>(params: {
      kind: LifecycleKind;
      subject: LifecycleSubject;
      commit: () => Promise<T>;
      geometry?: SubjectGeometry | null;
    }): Promise<T> => {
      start(params.kind, params.subject, params.geometry);
      try {
        return await params.commit();
      } catch (error) {
        abort(params.kind, params.subject);
        throw error;
      }
    },
    [start, abort]
  );

  const controller = useMemo<LifecycleController>(
    () => ({
      view,
      lifecycles,
      progressOf: (key: string) => {
        const lifecycle = stateRef.current.lifecycles[key];
        return lifecycle ? lifecycleProgress(lifecycle, now()) : null;
      },
      subscribe: (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      start,
      run,
      abort,
      captureGeometry: (key: string, geometry: SubjectGeometry) => {
        dispatch(captureGeometryAction(key, geometry));
      },
      nodeIdIn: (kind: LifecycleKind) => nodeIdInLifecycle(activeLifecycles(stateRef.current), kind),
    }),
    [view, lifecycles, start, run, abort, dispatch]
  );

  return controller;
}

/**
 * Progress for one lifecycle, re-rendering only this leaf.
 *
 * Returns null when the lifecycle is not playing, which is also how a
 * rendering learns it is finished — no `onComplete`, and so no completion
 * signal that can be made unreachable by a node unmounting early.
 */
export function useLifecycleProgress(
  controller: LifecycleController,
  kind: LifecycleKind,
  subject: LifecycleSubject | null
): number | null {
  const key = subject ? lifecycleKey(kind, subject) : null;
  const [progress, setProgress] = useState<number | null>(() =>
    key ? controller.progressOf(key) : null
  );

  useEffect(() => {
    if (!key) {
      setProgress(null);
      return;
    }
    setProgress(controller.progressOf(key));
    return controller.subscribe(() => setProgress(controller.progressOf(key)));
  }, [controller, key]);

  return key ? progress : null;
}
