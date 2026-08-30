/**
 * Spawn and Dissolve — one lifecycle, one clock (LIN-55, ADR-0007).
 *
 * `CONTEXT.md` names **Spawn** and **Dissolve** as single lifecycles rendered
 * differently per view. This module is that lifecycle: it owns the phase, the
 * clock and the abort semantics for every Lifecycle Subject, and the 2D and 3D
 * renderings are adapters that read a normalized progress out of it.
 *
 * Everything here is pure and synchronous. Time arrives as a `now` argument,
 * never from `Date.now()` or a timer, so the whole machine is testable in the
 * `node` environment without a DOM — the `directManipulation.ts` precedent
 * (ADR-0004). The async write that a lifecycle is optimistic about lives in
 * `useLifecycles.ts`, not here.
 */

/** The two lifecycles named in `CONTEXT.md`. */
export type LifecycleKind = 'spawn' | 'dissolve';

/** Which rendering is mounted. Only one view is ever on screen at a time. */
export type LifecycleView = '2d' | '3d';

/**
 * A **Lifecycle Subject** — the Tree Node or Kinship Link a Spawn or Dissolve
 * is happening to.
 *
 * A link subject is direction-free: Connect Mode may flip which end is the
 * parent, and a beam does not care.
 */
export type LifecycleSubject =
  | { kind: 'node'; id: string }
  | { kind: 'link'; aId: string; bId: string };

/**
 * Where the subject was on the 2D canvas when the lifecycle started.
 *
 * This is the snapshot that makes a Dissolve survivable. The animation used to
 * be rendered by iterating the live node list, so the node vanished out from
 * under its own particles as soon as the Working Record rebuilt without that
 * Person; holding the geometry here decouples the playing lifecycle from the
 * Tree Record changing underneath it.
 */
export interface SubjectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `playing` runs the lifecycle forwards. `aborting` unwinds it: progress runs
 * back down to zero from wherever it had reached, which re-materializes a node
 * whose delete failed instead of merely clearing a flag.
 */
export type LifecyclePhase = 'playing' | 'aborting';

export interface Lifecycle {
  /** Stable identity: one lifecycle per (kind, subject). */
  key: string;
  kind: LifecycleKind;
  subject: LifecycleSubject;
  phase: LifecyclePhase;
  /** When the current phase started, on the caller's clock. */
  startedAt: number;
  /** How long the current phase runs. */
  durationMs: number;
  /**
   * Progress at the moment of abort, so the unwind starts where the play
   * stopped rather than snapping to 1 first.
   */
  abortFrom: number;
  geometry: SubjectGeometry | null;
}

export interface LifecycleState {
  lifecycles: Record<string, Lifecycle>;
}

export const initialLifecycleState: LifecycleState = { lifecycles: {} };

/**
 * One constant per (view × lifecycle × subject). These are the only durations
 * in the system: the renderings are handed a progress and have no opinion
 * about time. 2D and 3D differ because they are visually independent
 * (ADR-0002), not because anything discovered its own clock.
 */
export const LIFECYCLE_DURATION_MS: Record<
  LifecycleView,
  Record<LifecycleKind, Record<LifecycleSubject['kind'], number>>
> = {
  '2d': {
    spawn: { node: 900, link: 900 },
    dissolve: { node: 1100, link: 700 },
  },
  '3d': {
    spawn: { node: 1400, link: 1400 },
    dissolve: { node: 1100, link: 1100 },
  },
};

/** How long an unwind takes, whichever view and whichever lifecycle. */
export const LIFECYCLE_ABORT_MS = 240;

/** Direction-free key for a link subject, so a↔b and b↔a are one lifecycle. */
export const subjectKey = (subject: LifecycleSubject): string =>
  subject.kind === 'node'
    ? `node:${subject.id}`
    : `link:${[subject.aId, subject.bId].sort().join('|')}`;

export const lifecycleKey = (kind: LifecycleKind, subject: LifecycleSubject): string =>
  `${kind}:${subjectKey(subject)}`;

export const lifecycleDuration = (
  view: LifecycleView,
  kind: LifecycleKind,
  subject: LifecycleSubject
): number => LIFECYCLE_DURATION_MS[view][kind][subject.kind];

// --- Actions ---------------------------------------------------------------

export type LifecycleAction =
  | {
      type: 'START';
      kind: LifecycleKind;
      subject: LifecycleSubject;
      view: LifecycleView;
      now: number;
      geometry?: SubjectGeometry | null;
    }
  | { type: 'CAPTURE_GEOMETRY'; key: string; geometry: SubjectGeometry }
  | { type: 'ABORT'; key: string; now: number }
  | { type: 'TICK'; now: number };

export const startLifecycleAction = (
  kind: LifecycleKind,
  subject: LifecycleSubject,
  view: LifecycleView,
  now: number,
  geometry?: SubjectGeometry | null
): LifecycleAction => ({ type: 'START', kind, subject, view, now, geometry });

export const captureGeometryAction = (
  key: string,
  geometry: SubjectGeometry
): LifecycleAction => ({ type: 'CAPTURE_GEOMETRY', key, geometry });

export const abortLifecycleAction = (key: string, now: number): LifecycleAction => ({
  type: 'ABORT',
  key,
  now,
});

export const tickAction = (now: number): LifecycleAction => ({ type: 'TICK', now });

// --- Progress --------------------------------------------------------------

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Where the lifecycle has got to, 0 → 1 while playing and abortFrom → 0 while
 * aborting. This is the single number every rendering draws from.
 */
export const lifecycleProgress = (lifecycle: Lifecycle, now: number): number => {
  const elapsed = clamp01((now - lifecycle.startedAt) / lifecycle.durationMs);
  return lifecycle.phase === 'playing' ? elapsed : lifecycle.abortFrom * (1 - elapsed);
};

/** A lifecycle is finished once its current phase has run its duration out. */
export const isLifecycleFinished = (lifecycle: Lifecycle, now: number): boolean =>
  now - lifecycle.startedAt >= lifecycle.durationMs;

// --- Reducer ---------------------------------------------------------------

export const lifecycleReducer = (
  state: LifecycleState,
  action: LifecycleAction
): LifecycleState => {
  switch (action.type) {
    case 'START': {
      // Restarting an in-flight lifecycle for the same subject supersedes it —
      // rapid repeat Spawns are a normal thing to do, and a second one must
      // not inherit the first one's elapsed time.
      const key = lifecycleKey(action.kind, action.subject);
      const lifecycle: Lifecycle = {
        key,
        kind: action.kind,
        subject: action.subject,
        phase: 'playing',
        startedAt: action.now,
        durationMs: lifecycleDuration(action.view, action.kind, action.subject),
        abortFrom: 0,
        geometry: action.geometry ?? null,
      };
      return { lifecycles: { ...state.lifecycles, [key]: lifecycle } };
    }

    case 'CAPTURE_GEOMETRY': {
      const existing = state.lifecycles[action.key];
      // First capture wins: the point of the snapshot is that later layouts —
      // in particular the rebuild a write triggers — cannot move a lifecycle.
      if (!existing || existing.geometry) return state;
      return {
        lifecycles: {
          ...state.lifecycles,
          [action.key]: { ...existing, geometry: action.geometry },
        },
      };
    }

    case 'ABORT': {
      const existing = state.lifecycles[action.key];
      if (!existing || existing.phase === 'aborting') return state;
      return {
        lifecycles: {
          ...state.lifecycles,
          [action.key]: {
            ...existing,
            phase: 'aborting',
            abortFrom: lifecycleProgress(existing, action.now),
            startedAt: action.now,
            durationMs: LIFECYCLE_ABORT_MS,
          },
        },
      };
    }

    case 'TICK': {
      const survivors: Record<string, Lifecycle> = {};
      let changed = false;
      for (const [key, lifecycle] of Object.entries(state.lifecycles)) {
        if (isLifecycleFinished(lifecycle, action.now)) {
          changed = true;
        } else {
          survivors[key] = lifecycle;
        }
      }
      return changed ? { lifecycles: survivors } : state;
    }

    default:
      return state;
  }
};

// --- Selectors -------------------------------------------------------------

export const activeLifecycles = (state: LifecycleState): Lifecycle[] =>
  Object.values(state.lifecycles);

export const findLifecycle = (
  state: LifecycleState,
  kind: LifecycleKind,
  subject: LifecycleSubject
): Lifecycle | null => state.lifecycles[lifecycleKey(kind, subject)] ?? null;

/**
 * The node currently spawning or dissolving, for renderings that address a
 * lifecycle by node id rather than by subject.
 */
export const nodeIdInLifecycle = (
  lifecycles: Lifecycle[],
  kind: LifecycleKind
): string | null => {
  for (const lifecycle of lifecycles) {
    if (lifecycle.kind === kind && lifecycle.subject.kind === 'node') {
      return lifecycle.subject.id;
    }
  }
  return null;
};

/** The Kinship Link currently spawning or dissolving, direction-free. */
export const linkInLifecycle = (
  lifecycles: Lifecycle[],
  kind: LifecycleKind
): { aId: string; bId: string } | null => {
  for (const lifecycle of lifecycles) {
    if (lifecycle.kind === kind && lifecycle.subject.kind === 'link') {
      return { aId: lifecycle.subject.aId, bId: lifecycle.subject.bId };
    }
  }
  return null;
};

/** Lifecycles of one kind, in start order — what a rendering iterates. */
export const lifecyclesOfKind = (lifecycles: Lifecycle[], kind: LifecycleKind): Lifecycle[] =>
  lifecycles.filter((lifecycle) => lifecycle.kind === kind);
