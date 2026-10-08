import { describe, it, expect } from 'vitest';
import { contrastRatio } from './colourBlend';
import { drawOverviewPair, mixPair, pairAt, pairForFamily, PAIR_FADE_MS } from './paperPairs';
import { GRAYSCALE_PAIR, PAPER_PAIRS, pairCssValues, pairVar } from '../theme/paperPair';

const [green, indigo, red] = PAPER_PAIRS;

describe('pairForFamily', () => {
  it('gives a family the same pair every time', () => {
    expect(pairForFamily('Badran')).toBe(pairForFamily('Badran'));
    expect(pairForFamily('بدران')).toBe(pairForFamily('بدران'));
  });

  it('only ever hands out pairs from the table', () => {
    for (const family of ['Badran', 'Kutob', 'Hajjaj', 'Zabalawi', 'Malhis', 'Shawa', 'x', 'بدران']) {
      expect(PAPER_PAIRS).toContain(pairForFamily(family));
    }
  });

  it('spreads families across more than one pair', () => {
    const families = ['Badran', 'Kutob', 'Hajjaj', 'Zabalawi', 'Malhis', 'Shawa', 'Dajani', 'Masri'];
    expect(new Set(families.map(pairForFamily)).size).toBeGreaterThan(1);
  });
});

describe('pair table', () => {
  it.each([['grayscale', GRAYSCALE_PAIR] as const, ...PAPER_PAIRS.map((p) => [p.paper, p] as const)])(
    '%s keeps ink and accent at least 3:1 against its paper',
    (_, pair) => {
      expect(contrastRatio(pair.paper, pair.ink)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(pair.paper, pair.accent)).toBeGreaterThanOrEqual(3);
    }
  );

  it('holds seven colour pairs', () => {
    expect(PAPER_PAIRS).toHaveLength(7);
  });
});

describe('drawOverviewPair', () => {
  it('never repeats the previous pair', () => {
    for (const previous of PAPER_PAIRS) {
      for (const roll of [0, 0.2, 0.5, 0.8, 0.9999]) {
        expect(drawOverviewPair(previous, () => roll)).not.toBe(previous);
      }
    }
  });

  it('can reach every pair on a first draw', () => {
    const drawn = new Set(PAPER_PAIRS.map((_, i) => drawOverviewPair(null, () => i / PAPER_PAIRS.length)));
    expect(drawn.size).toBe(PAPER_PAIRS.length);
  });
});

describe('mixPair', () => {
  it('returns the endpoints at 0 and 1', () => {
    expect(mixPair(green, red, 0)).toEqual(green);
    expect(mixPair(green, red, 1)).toEqual(red);
  });
});

describe('pairAt', () => {
  const fade = { from: indigo, to: red, startedAt: 1000 };

  it('starts on the old pair and lands exactly on the new one after the fade', () => {
    expect(pairAt(fade, 1000)).toEqual(indigo);
    expect(pairAt(fade, 1000 + PAIR_FADE_MS)).toEqual(red);
    expect(pairAt(fade, 99_999)).toEqual(red);
  });

  it('is between the two pairs halfway through', () => {
    const mid = pairAt(fade, 1000 + PAIR_FADE_MS / 2);
    expect(mid.paper).not.toBe(indigo.paper);
    expect(mid.paper).not.toBe(red.paper);
    expect(mid).toEqual(mixPair(indigo, red, 0.5));
  });
});

describe('pair CSS variables', () => {
  it('writes each colour as rgb channels and reads it back with a grayscale fallback', () => {
    expect(pairCssValues(red)['--paper-pair-paper']).toBe('212 71 68');
    expect(pairVar('ink', 0.5)).toBe('rgb(var(--paper-pair-ink, 28 28 28) / 0.5)');
  });
});
