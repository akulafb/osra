import { PAPER_MAX_FRAME_SECONDS } from './paperCamera';

/** A held key that moves or turns the Paper camera. */
export type PaperFlightKey = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right';

export type PaperKeyAction = 'reset' | 'cycle-next' | 'cycle-previous' | 'focus' | 'deselect';

export interface PaperKeyModifiers {
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}

/** The parts of a KeyboardEvent the keys read. */
export interface PaperKeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Where focus sits: in a text field, on the page or the scene, or on some other control. */
export type PaperKeyFocus = 'typing' | 'scene' | 'control';

export interface PaperKeyBlocks {
  actions: boolean;
  flight: boolean;
}

export type PaperKeyDown = { kind: 'hold'; key: PaperFlightKey } | { kind: 'action'; action: PaperKeyAction };

export type PaperArrival = 'loader' | 'revealing' | 'crossfade' | 'settled';

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
const FALLBACK_DISTANCE = 100;

export function paperFlightKey(key: string): PaperFlightKey | null {
  return FLIGHT_KEYS[key.toLowerCase()] ?? null;
}

export function paperKeyAction(key: string, modifiers: PaperKeyModifiers): PaperKeyAction | null {
  const lower = key.toLowerCase();
  if (lower === 'escape') return 'deselect';
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null;
  switch (lower) {
    case 'r':
      return 'reset';
    case 'tab':
      return modifiers.shift ? 'cycle-previous' : 'cycle-next';
    case 'enter':
      return 'focus';
    default:
      return null;
  }
}

/** No key acts before the intro settles, since the reveal lands on the view it started from. WASD and Q/E still fly behind the Add Relative preview, as in Cosmos. */
export function paperKeyBlocks({
  modalOpen,
  addModalOpen,
  arrival,
}: {
  modalOpen: boolean;
  addModalOpen: boolean;
  arrival: PaperArrival;
}): PaperKeyBlocks {
  const arriving = arrival !== 'settled';
  return { actions: modalOpen || arriving, flight: (modalOpen && !addModalOpen) || arriving };
}

/** What a key pressed does. Flight keys go by physical key, so a release under Option (which changes `key`) still lets go. Tab and Enter belong to a focused control. */
export function paperKeyDown(event: PaperKeyEvent, focus: PaperKeyFocus, blocked: PaperKeyBlocks): PaperKeyDown | null {
  if (focus === 'typing') return null;
  const flight = paperEventFlightKey(event);
  if (flight) {
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    return blocked.flight || modified ? null : { kind: 'hold', key: flight };
  }
  if (blocked.actions) return null;
  const action = paperKeyAction(event.key, { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey });
  if (!action) return null;
  if ((action === 'cycle-next' || action === 'cycle-previous' || action === 'focus') && focus !== 'scene') return null;
  return { kind: 'action', action };
}

export function paperEventFlightKey(event: Pick<PaperKeyEvent, 'key' | 'code'>): PaperFlightKey | null {
  return paperFlightKey(event.code ? event.code.replace(/^Key/, '') : event.key);
}

/** The camera move for `seconds` with these keys held, or null when it stands still. */
export function paperFlightStep(
  held: ReadonlySet<PaperFlightKey>,
  boost: boolean,
  seconds: number,
  viewDistance: number
): PaperFlightStep | null {
  if (!(seconds > 0)) return null;
  const dt = Math.min(seconds, PAPER_MAX_FRAME_SECONDS);
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

export function paperCycle(ids: readonly string[], selectedId: string | null, backwards: boolean): string | null {
  if (ids.length === 0) return null;
  const at = selectedId === null ? -1 : ids.indexOf(selectedId);
  if (at < 0) return backwards ? ids[ids.length - 1] : ids[0];
  return ids[(at + (backwards ? ids.length - 1 : 1)) % ids.length];
}
