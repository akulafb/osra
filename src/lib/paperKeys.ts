/** A held key that moves or turns the Paper camera (product decision 6). */
export type PaperFlightKey = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right';

/** A pressed key that does one thing: R resets the view, Tab cycles the shown Persons, Enter refocuses, Esc deselects. */
export type PaperKeyAction = 'reset' | 'cycle-next' | 'cycle-previous' | 'focus' | 'deselect';

export interface PaperKeyModifiers {
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}

/** One frame's camera move, in CameraControls' terms: `truck` slides right, `forward` moves ahead, `azimuth` turns left, in radians. */
export interface PaperFlightStep {
  truck: number;
  forward: number;
  azimuth: number;
}

const FLIGHT_KEYS: Record<string, PaperFlightKey> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
  q: 'turn-left',
  e: 'turn-right',
};

/** View distances a second the camera moves; it covers ground at the same pace on screen however far out it stands. */
const MOVE_DISTANCES_PER_SECOND = 0.8;
const BOOST = 4;
const TURN_RADIANS_PER_SECOND = 0.8;
/** A frame after a stalled tab moves the camera no further than this. */
const MAX_FRAME_SECONDS = 0.1;
const FALLBACK_DISTANCE = 100;

export function paperFlightKey(key: string): PaperFlightKey | null {
  return FLIGHT_KEYS[key.toLowerCase()] ?? null;
}

export function paperKeyAction(key: string, modifiers: PaperKeyModifiers): PaperKeyAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null;
  switch (key.toLowerCase()) {
    case 'r':
      return 'reset';
    case 'tab':
      return modifiers.shift ? 'cycle-previous' : 'cycle-next';
    case 'enter':
      return 'focus';
    case 'escape':
      return 'deselect';
    default:
      return null;
  }
}

/** The camera move for `seconds` with these keys held, or null when it stands still. */
export function paperFlightStep(
  held: ReadonlySet<PaperFlightKey>,
  boost: boolean,
  seconds: number,
  viewDistance: number
): PaperFlightStep | null {
  if (!(seconds > 0)) return null;
  const dt = Math.min(seconds, MAX_FRAME_SECONDS);
  const axis = (plus: PaperFlightKey, minus: PaperFlightKey) => Number(held.has(plus)) - Number(held.has(minus));
  const ahead = axis('forward', 'back');
  const across = axis('right', 'left');
  const turn = axis('turn-left', 'turn-right');
  if (ahead === 0 && across === 0 && turn === 0) return null;

  const distance = Number.isFinite(viewDistance) && viewDistance > 0 ? viewDistance : FALLBACK_DISTANCE;
  const reach = distance * MOVE_DISTANCES_PER_SECOND * (boost ? BOOST : 1) * dt;
  const length = Math.hypot(ahead, across) || 1;
  return {
    truck: (across / length) * reach,
    forward: (ahead / length) * reach,
    azimuth: turn * TURN_RADIANS_PER_SECOND * dt,
  };
}

/** The Person Tab selects next among the shown `ids`, or the one before with `backwards`. */
export function paperCycle(ids: readonly string[], selectedId: string | null, backwards: boolean): string | null {
  if (ids.length === 0) return null;
  const at = selectedId === null ? -1 : ids.indexOf(selectedId);
  if (at < 0) return backwards ? ids[ids.length - 1] : ids[0];
  return ids[(at + (backwards ? ids.length - 1 : 1)) % ids.length];
}
