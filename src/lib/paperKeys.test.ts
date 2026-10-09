import { describe, it, expect } from 'vitest';
import {
  paperCycle,
  paperFlightKey,
  paperFlightStep,
  paperKeyAction,
  paperKeyBlocks,
  paperKeyDown,
  type PaperFlightKey,
  type PaperKeyEvent,
} from './paperKeys';

const plain = { shift: false, ctrl: false, meta: false, alt: false };

describe('NAV CONTROLS keys', () => {
  it('maps WASD and the arrow keys to moving, and Q and E to turning', () => {
    expect(['w', 'W', 'ArrowUp'].map(paperFlightKey)).toEqual(['forward', 'forward', 'forward']);
    expect(['s', 'ArrowDown'].map(paperFlightKey)).toEqual(['back', 'back']);
    expect(['a', 'ArrowLeft'].map(paperFlightKey)).toEqual(['left', 'left']);
    expect(['d', 'ArrowRight'].map(paperFlightKey)).toEqual(['right', 'right']);
    expect(['q', 'E'].map(paperFlightKey)).toEqual(['turn-left', 'turn-right']);
  });

  it('leaves other keys alone', () => {
    expect(['r', 'Tab', 'x', ' '].map(paperFlightKey)).toEqual([null, null, null, null]);
  });

  it('maps R to reset, Tab to cycle, Enter to focus and Esc to deselect', () => {
    expect(paperKeyAction('r', plain)).toBe('reset');
    expect(paperKeyAction('R', { ...plain, shift: true })).toBe('reset');
    expect(paperKeyAction('Tab', plain)).toBe('cycle-next');
    expect(paperKeyAction('Tab', { ...plain, shift: true })).toBe('cycle-previous');
    expect(paperKeyAction('Enter', plain)).toBe('focus');
    expect(paperKeyAction('Escape', plain)).toBe('deselect');
  });

  it('ignores a key held with Ctrl, Cmd or Alt, so browser shortcuts like reload keep working, but Esc still deselects', () => {
    for (const mod of ['ctrl', 'meta', 'alt'] as const) {
      expect(paperKeyAction('r', { ...plain, [mod]: true })).toBeNull();
      expect(paperKeyAction('Tab', { ...plain, [mod]: true })).toBeNull();
      expect(paperKeyAction('Escape', { ...plain, [mod]: true })).toBe('deselect');
    }
  });

  it('gives flight keys no action', () => {
    expect(['w', 'a', 's', 'd', 'q', 'e'].map((k) => paperKeyAction(k, plain))).toEqual([null, null, null, null, null, null]);
  });
});

describe('a flight step', () => {
  const step = (keys: PaperFlightKey[], boost = false, seconds = 0.1, distance = 100) =>
    paperFlightStep(new Set(keys), boost, seconds, distance);

  it('stands still with nothing held', () => {
    expect(step([])).toBeNull();
  });

  it('moves forward on W and back on S, scaled by the time and the view distance', () => {
    const forward = step(['forward'])!;
    expect(forward.forward).toBeGreaterThan(0);
    expect(forward.truck).toBe(0);
    expect(forward.azimuth).toBe(0);
    expect(step(['back'])!.forward).toBeCloseTo(-forward.forward, 9);
    expect(step(['forward'], false, 0.05)!.forward).toBeCloseTo(forward.forward / 2, 9);
    expect(step(['forward'], false, 0.1, 200)!.forward).toBeCloseTo(2 * forward.forward, 9);
  });

  it('slides right on D and left on A', () => {
    const right = step(['right'])!;
    expect(right.truck).toBeGreaterThan(0);
    expect(step(['left'])!.truck).toBeCloseTo(-right.truck, 9);
  });

  it('turns left on Q and right on E, at a speed that does not depend on the distance', () => {
    const left = step(['turn-left'])!;
    expect(left.azimuth).toBeGreaterThan(0);
    expect(step(['turn-right'])!.azimuth).toBeCloseTo(-left.azimuth, 9);
    expect(step(['turn-left'], false, 0.1, 400)!.azimuth).toBeCloseTo(left.azimuth, 9);
  });

  it('cancels opposite keys', () => {
    expect(step(['forward', 'back'])).toBeNull();
    expect(step(['left', 'right', 'turn-left', 'turn-right'])).toBeNull();
  });

  it('moves no faster on a diagonal', () => {
    const straight = step(['forward'])!.forward;
    const diagonal = step(['forward', 'right'])!;
    expect(Math.hypot(diagonal.forward, diagonal.truck)).toBeCloseTo(straight, 9);
  });

  it('moves four times as fast with Shift, but turns at the same speed', () => {
    expect(step(['forward'], true)!.forward).toBeCloseTo(4 * step(['forward'])!.forward, 9);
    expect(step(['turn-left'], true)!.azimuth).toBeCloseTo(step(['turn-left'])!.azimuth, 9);
  });

  it('takes no more than a tenth of a second from a stalled frame', () => {
    expect(step(['forward'], false, 5)!.forward).toBeCloseTo(step(['forward'], false, 0.1)!.forward, 9);
  });

  it('stands still for a frame of no time or a bad distance', () => {
    expect(step(['forward'], false, 0)).toBeNull();
    expect(step(['forward'], false, Number.NaN)).toBeNull();
    expect(step(['forward'], false, 0.1, Number.NaN)!.forward).toBeGreaterThan(0);
  });
});

describe('Tab cycling', () => {
  const ids = ['a', 'b', 'c'];

  it('starts at the first Person with nobody selected, and at the last going back', () => {
    expect(paperCycle(ids, null, false)).toBe('a');
    expect(paperCycle(ids, null, true)).toBe('c');
  });

  it('steps to the next and previous Person, wrapping at the ends', () => {
    expect(paperCycle(ids, 'a', false)).toBe('b');
    expect(paperCycle(ids, 'c', false)).toBe('a');
    expect(paperCycle(ids, 'b', true)).toBe('a');
    expect(paperCycle(ids, 'a', true)).toBe('c');
  });

  it('starts over when the selected Person is not shown', () => {
    expect(paperCycle(ids, 'hidden', false)).toBe('a');
    expect(paperCycle(ids, 'hidden', true)).toBe('c');
  });

  it('selects nobody when nobody is shown', () => {
    expect(paperCycle([], 'a', false)).toBeNull();
  });
});

describe('what blocks the keys', () => {
  const open = { modalOpen: false, addModalOpen: false };

  it('blocks flying and the actions until the intro has settled, so the reveal lands where it meant to', () => {
    for (const arrival of ['loader', 'revealing', 'crossfade'] as const) {
      expect(paperKeyBlocks({ ...open, arrival })).toEqual({ actions: true, flight: true });
    }
    expect(paperKeyBlocks({ ...open, arrival: 'settled' })).toEqual({ actions: false, flight: false });
  });

  it('blocks both behind a modal, but still flies behind the Add Relative preview', () => {
    expect(paperKeyBlocks({ modalOpen: true, addModalOpen: false, arrival: 'settled' })).toEqual({ actions: true, flight: true });
    expect(paperKeyBlocks({ modalOpen: true, addModalOpen: true, arrival: 'settled' })).toEqual({ actions: true, flight: false });
  });
});

describe('a key pressed', () => {
  const press = (key: string, extra: Partial<PaperKeyEvent> = {}): PaperKeyEvent => ({
    key,
    code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  });
  const free = { actions: false, flight: false };

  it('holds a flight key, read by its physical key so Option does not change it', () => {
    expect(paperKeyDown(press('w'), 'scene', free)).toEqual({ kind: 'hold', key: 'forward' });
    expect(paperKeyDown(press('∑', { code: 'KeyW', altKey: false }), 'control', free)).toEqual({ kind: 'hold', key: 'forward' });
  });

  it('holds no flight key while flying is blocked or under Ctrl, Cmd or Alt', () => {
    expect(paperKeyDown(press('w'), 'scene', { actions: false, flight: true })).toBeNull();
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(paperKeyDown(press('w', { [mod]: true }), 'scene', free)).toBeNull();
    }
  });

  it('does nothing while typing', () => {
    expect(paperKeyDown(press('w'), 'typing', free)).toBeNull();
    expect(paperKeyDown(press('r'), 'typing', free)).toBeNull();
    expect(paperKeyDown(press('Escape'), 'typing', free)).toBeNull();
  });

  it('runs no action while the actions are blocked, but a flight key still holds', () => {
    const blocked = { actions: true, flight: false };
    expect(paperKeyDown(press('r'), 'scene', blocked)).toBeNull();
    expect(paperKeyDown(press('Escape'), 'scene', blocked)).toBeNull();
    expect(paperKeyDown(press('w'), 'scene', blocked)).toEqual({ kind: 'hold', key: 'forward' });
  });

  it('leaves Tab and Enter to a focused control, but R and Esc act wherever focus is', () => {
    expect(paperKeyDown(press('Tab'), 'control', free)).toBeNull();
    expect(paperKeyDown(press('Enter'), 'control', free)).toBeNull();
    expect(paperKeyDown(press('r'), 'control', free)).toEqual({ kind: 'action', action: 'reset' });
    expect(paperKeyDown(press('Escape'), 'control', free)).toEqual({ kind: 'action', action: 'deselect' });
    expect(paperKeyDown(press('Tab', { shiftKey: true }), 'scene', free)).toEqual({ kind: 'action', action: 'cycle-previous' });
    expect(paperKeyDown(press('Enter'), 'scene', free)).toEqual({ kind: 'action', action: 'focus' });
  });

  it('ignores other keys', () => {
    expect(paperKeyDown(press('x'), 'scene', free)).toBeNull();
  });
});
