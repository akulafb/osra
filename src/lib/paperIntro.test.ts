import { describe, it, expect } from 'vitest';
import type { PaperLayout } from './paperLayout';
import { paperFlySmoothTime, PAPER_FLY_SECONDS } from './paperFocus';
import {
  paperRevealSmoothTime,
  paperHintCopy,
  paperRevealProgress,
  paperRevealShares,
  PAPER_HINT_SEEN_KEY,
  PAPER_REVEAL_SECONDS,
  readPaperHintSeen,
  writePaperHintSeen,
} from './paperIntro';

const center = { x: 10, y: 0, z: 0 };
const layout: PaperLayout = new Map([
  ['middle', { x: 10, y: 0, z: 0, radius: 5 }],
  ['near', { x: 10, y: 20, z: 0, radius: 5 }],
  ['far', { x: 10, y: 0, z: -80, radius: 5 }],
]);

describe('paperRevealShares', () => {
  it('measures each Person by their share of the way out, the farthest at 1', () => {
    const shares = paperRevealShares(layout, ['middle', 'near', 'far'], center);
    expect(shares.get('middle')).toBe(0);
    expect(shares.get('near')).toBeCloseTo(0.25);
    expect(shares.get('far')).toBe(1);
  });

  it('skips ids the layout does not place', () => {
    expect([...paperRevealShares(layout, ['near', 'ghost'], center).keys()]).toEqual(['near']);
  });

  it('puts everyone at the centre when nobody stands away from it', () => {
    expect(paperRevealShares(layout, ['middle'], center).get('middle')).toBe(0);
  });
});

describe('paperRevealProgress', () => {
  it('starts with nobody revealed', () => {
    expect(paperRevealProgress(0, 0)).toBe(0);
    expect(paperRevealProgress(1, 0)).toBe(0);
  });

  it('reveals nearer Persons sooner', () => {
    const seconds = PAPER_REVEAL_SECONDS / 3;
    const centre = paperRevealProgress(0, seconds);
    const middle = paperRevealProgress(0.5, seconds);
    const edge = paperRevealProgress(1, seconds);
    expect(centre).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThanOrEqual(edge);
    expect(edge).toBe(0);
  });

  it('only grows as time passes', () => {
    let last = 0;
    for (let s = 0; s <= PAPER_REVEAL_SECONDS; s += 0.05) {
      const p = paperRevealProgress(0.6, s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('has everyone whole once the reveal is over', () => {
    for (const share of [0, 0.3, 1]) expect(paperRevealProgress(share, PAPER_REVEAL_SECONDS)).toBe(1);
  });

  it('shows everyone whole for a time that is not a finite number (ADR 0011)', () => {
    expect(paperRevealProgress(0.5, Number.NaN)).toBe(1);
    expect(paperRevealProgress(0.5, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('paperHintCopy', () => {
  it('says pinch on a touch screen', () => {
    expect(paperHintCopy(true)).toBe('Drag to rotate · Pinch to zoom');
  });

  it('says scroll elsewhere', () => {
    expect(paperHintCopy(false)).toBe('Drag to rotate · Scroll to zoom');
  });
});

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const brokenStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('the hint seen key', () => {
  it('reads as unseen when nothing is stored', () => {
    expect(readPaperHintSeen(() => memoryStorage())).toBe(false);
  });

  it('reads as seen once written', () => {
    const storage = memoryStorage();
    writePaperHintSeen(() => storage);
    expect(storage.getItem(PAPER_HINT_SEEN_KEY)).not.toBeNull();
    expect(readPaperHintSeen(() => storage)).toBe(true);
  });

  it('reads as seen when storage cannot be read, so the hint never nags', () => {
    expect(readPaperHintSeen(() => brokenStorage)).toBe(true);
    expect(
      readPaperHintSeen(() => {
        throw new Error('no storage');
      })
    ).toBe(true);
  });

  it('writes without throwing when storage is blocked', () => {
    expect(() => writePaperHintSeen(() => brokenStorage)).not.toThrow();
  });
});

describe('paperRevealSmoothTime', () => {
  it('swings the camera in over the whole reveal', () => {
    expect(paperRevealSmoothTime(false)).toBe(paperFlySmoothTime(PAPER_REVEAL_SECONDS));
  });

  it('flies at the usual pace once a Person is picked during the reveal', () => {
    expect(paperRevealSmoothTime(true)).toBe(paperFlySmoothTime(PAPER_FLY_SECONDS));
  });
});
