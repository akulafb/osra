import { describe, it, expect } from 'vitest';
import {
  initialLifecycleState,
  lifecycleReducer,
  startLifecycleAction,
  captureGeometryAction,
  abortLifecycleAction,
  tickAction,
  lifecycleKey,
  lifecycleProgress,
  activeLifecycles,
  findLifecycle,
  nodeIdInLifecycle,
  linkInLifecycle,
  LIFECYCLE_DURATION_MS,
  LIFECYCLE_ABORT_MS,
  LifecycleState,
  LifecycleSubject,
} from './lifecycle';

const NODE: LifecycleSubject = { kind: 'node', id: 'n1' };
const OTHER: LifecycleSubject = { kind: 'node', id: 'n2' };
const LINK: LifecycleSubject = { kind: 'link', aId: 'n1', bId: 'n2' };

const start = (
  state: LifecycleState,
  kind: 'spawn' | 'dissolve',
  subject: LifecycleSubject,
  now = 0
) => lifecycleReducer(state, startLifecycleAction(kind, subject, '2d', now));

describe('lifecycle — one clock per lifecycle', () => {
  it('runs a Spawn from 0 to 1 over the view duration', () => {
    const state = start(initialLifecycleState, 'spawn', NODE);
    const lifecycle = findLifecycle(state, 'spawn', NODE)!;
    const duration = LIFECYCLE_DURATION_MS['2d'].spawn.node;

    expect(lifecycle.durationMs).toBe(duration);
    expect(lifecycleProgress(lifecycle, 0)).toBe(0);
    expect(lifecycleProgress(lifecycle, duration / 2)).toBeCloseTo(0.5);
    expect(lifecycleProgress(lifecycle, duration)).toBe(1);
  });

  it('clamps progress rather than running past 1', () => {
    const state = start(initialLifecycleState, 'dissolve', NODE);
    const lifecycle = findLifecycle(state, 'dissolve', NODE)!;
    expect(lifecycleProgress(lifecycle, 10_000)).toBe(1);
  });

  it('gives 3D its own duration for the same lifecycle', () => {
    const state = lifecycleReducer(
      initialLifecycleState,
      startLifecycleAction('spawn', NODE, '3d', 0)
    );
    expect(findLifecycle(state, 'spawn', NODE)!.durationMs).toBe(
      LIFECYCLE_DURATION_MS['3d'].spawn.node
    );
    expect(LIFECYCLE_DURATION_MS['3d'].spawn.node).not.toBe(
      LIFECYCLE_DURATION_MS['2d'].spawn.node
    );
  });

  it('drops a lifecycle once its clock runs out, and not before', () => {
    const state = start(initialLifecycleState, 'spawn', NODE);
    const duration = LIFECYCLE_DURATION_MS['2d'].spawn.node;

    expect(activeLifecycles(lifecycleReducer(state, tickAction(duration - 1)))).toHaveLength(1);
    expect(activeLifecycles(lifecycleReducer(state, tickAction(duration)))).toHaveLength(0);
  });
});

describe('lifecycle — subjects', () => {
  it('keys a Kinship Link direction-free', () => {
    expect(lifecycleKey('spawn', { kind: 'link', aId: 'a', bId: 'b' })).toBe(
      lifecycleKey('spawn', { kind: 'link', aId: 'b', bId: 'a' })
    );
  });

  it('keeps a node lifecycle and a link lifecycle apart', () => {
    let state = start(initialLifecycleState, 'spawn', NODE);
    state = start(state, 'spawn', LINK);
    expect(activeLifecycles(state)).toHaveLength(2);
  });

  it('keeps Spawn and Dissolve of the same subject apart', () => {
    let state = start(initialLifecycleState, 'spawn', NODE);
    state = start(state, 'dissolve', NODE);
    expect(activeLifecycles(state)).toHaveLength(2);
  });

  it('reports the node currently in a given lifecycle', () => {
    let state = start(initialLifecycleState, 'spawn', NODE);
    state = start(state, 'spawn', LINK);
    expect(nodeIdInLifecycle(activeLifecycles(state), 'spawn')).toBe('n1');
    expect(nodeIdInLifecycle(activeLifecycles(state), 'dissolve')).toBeNull();
    expect(linkInLifecycle(activeLifecycles(state), 'spawn')).toEqual({ aId: 'n1', bId: 'n2' });
  });
});

describe('lifecycle — concurrency', () => {
  it('runs lifecycles for different subjects concurrently', () => {
    let state = start(initialLifecycleState, 'spawn', NODE, 0);
    state = start(state, 'spawn', OTHER, 300);

    expect(activeLifecycles(state)).toHaveLength(2);
    // The second Spawn does not inherit the first one's elapsed time.
    expect(lifecycleProgress(findLifecycle(state, 'spawn', OTHER)!, 300)).toBe(0);
    expect(lifecycleProgress(findLifecycle(state, 'spawn', NODE)!, 300)).toBeGreaterThan(0);
  });

  it('supersedes an in-flight lifecycle for the same subject', () => {
    let state = start(initialLifecycleState, 'spawn', NODE, 0);
    state = start(state, 'spawn', NODE, 500);

    expect(activeLifecycles(state)).toHaveLength(1);
    expect(lifecycleProgress(findLifecycle(state, 'spawn', NODE)!, 500)).toBe(0);
  });

  it('does not let a finished Dissolve shadow the next Spawn', () => {
    // The bug the old single `dissolvingNodeId` + fudge timer existed to dodge.
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    state = lifecycleReducer(state, tickAction(LIFECYCLE_DURATION_MS['2d'].dissolve.node));
    state = start(state, 'spawn', OTHER, 1200);

    expect(activeLifecycles(state)).toHaveLength(1);
    expect(findLifecycle(state, 'spawn', OTHER)).not.toBeNull();
  });
});

describe('lifecycle — geometry snapshot', () => {
  const geometry = { x: 10, y: 20, width: 100, height: 40 };

  it('survives the subject disappearing from the Tree Record', () => {
    // The regression this module exists for: a Dissolve starts, the change
    // applies, the Working Record rebuilds without the Person — and the
    // lifecycle still plays out because it holds its own snapshot rather than
    // reading the node list.
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    const key = lifecycleKey('dissolve', NODE);
    state = lifecycleReducer(state, captureGeometryAction(key, geometry));

    const half = LIFECYCLE_DURATION_MS['2d'].dissolve.node / 2;
    state = lifecycleReducer(state, tickAction(half));

    const lifecycle = findLifecycle(state, 'dissolve', NODE)!;
    expect(lifecycle.geometry).toEqual(geometry);
    expect(lifecycleProgress(lifecycle, half)).toBeCloseTo(0.5);
  });

  it('ignores a later capture, so a relayout cannot move a playing lifecycle', () => {
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    const key = lifecycleKey('dissolve', NODE);
    state = lifecycleReducer(state, captureGeometryAction(key, geometry));
    state = lifecycleReducer(
      state,
      captureGeometryAction(key, { x: 999, y: 999, width: 1, height: 1 })
    );

    expect(findLifecycle(state, 'dissolve', NODE)!.geometry).toEqual(geometry);
  });

  it('ignores geometry for a lifecycle that has already finished', () => {
    const state = lifecycleReducer(
      initialLifecycleState,
      captureGeometryAction(lifecycleKey('dissolve', NODE), geometry)
    );
    expect(activeLifecycles(state)).toHaveLength(0);
  });
});

describe('lifecycle — abort', () => {
  it('unwinds from where it had reached back to zero', () => {
    const duration = LIFECYCLE_DURATION_MS['2d'].dissolve.node;
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    const abortAt = duration * 0.4;
    state = lifecycleReducer(state, abortLifecycleAction(lifecycleKey('dissolve', NODE), abortAt));

    const lifecycle = findLifecycle(state, 'dissolve', NODE)!;
    expect(lifecycle.phase).toBe('aborting');
    expect(lifecycleProgress(lifecycle, abortAt)).toBeCloseTo(0.4);
    expect(lifecycleProgress(lifecycle, abortAt + LIFECYCLE_ABORT_MS / 2)).toBeCloseTo(0.2);
    expect(lifecycleProgress(lifecycle, abortAt + LIFECYCLE_ABORT_MS)).toBe(0);
  });

  it('clears the aborted lifecycle once the unwind is done', () => {
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    state = lifecycleReducer(state, abortLifecycleAction(lifecycleKey('dissolve', NODE), 100));
    state = lifecycleReducer(state, tickAction(100 + LIFECYCLE_ABORT_MS));
    expect(activeLifecycles(state)).toHaveLength(0);
  });

  it('is idempotent, so a retry cannot restart the unwind', () => {
    const key = lifecycleKey('dissolve', NODE);
    let state = start(initialLifecycleState, 'dissolve', NODE, 0);
    state = lifecycleReducer(state, abortLifecycleAction(key, 100));
    const once = findLifecycle(state, 'dissolve', NODE)!;
    state = lifecycleReducer(state, abortLifecycleAction(key, 180));
    expect(findLifecycle(state, 'dissolve', NODE)).toBe(once);
  });

  it('ignores an abort for a lifecycle that never started', () => {
    const state = lifecycleReducer(
      initialLifecycleState,
      abortLifecycleAction(lifecycleKey('dissolve', NODE), 0)
    );
    expect(activeLifecycles(state)).toHaveLength(0);
  });
});
