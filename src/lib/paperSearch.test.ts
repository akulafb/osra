import { describe, it, expect } from 'vitest';
import type { FamilyLink } from '../types/graph';
import type { PaperDisc, PaperLayout } from './paperLayout';
import { paperCycle } from './paperKeys';
import {
  packMatches,
  PAPER_CLUSTER_GAP,
  paperClusterView,
  paperEscape,
  paperSearchCount,
  paperSearchEmphasis,
  paperSearchLayout,
  paperSearchMotionAt,
  paperSearchMotionFrom,
  paperSearchOrder,
  PAPER_GATHER_SECONDS,
  PAPER_SHRINK_SECONDS,
  type PaperSearchMotion,
} from './paperSearch';

function disc(x: number, y: number, z: number, radius = 6): PaperDisc {
  return { x, y, z, radius };
}

function spreadLayout(count: number): PaperLayout {
  return new Map(
    Array.from({ length: count }, (_, i) => [`p${i}`, disc((i % 10) * 70, Math.floor(i / 10) * 80, (i % 3) * 50, 4 + (i % 5) * 2)])
  );
}

const parent = (source: string, target: string): FamilyLink => ({ source, target, type: 'parent' }) as FamilyLink;

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function overlaps(layout: PaperLayout, packed: ReadonlyMap<string, { x: number; y: number; z: number }>): string[] {
  const ids = [...packed.keys()];
  const found: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const gap = distance(packed.get(ids[i])!, packed.get(ids[j])!) - layout.get(ids[i])!.radius - layout.get(ids[j])!.radius;
      if (gap < PAPER_CLUSTER_GAP - 1e-6) found.push(`${ids[i]}-${ids[j]}`);
    }
  }
  return found;
}

function clusterRadius(layout: PaperLayout, packed: ReadonlyMap<string, { x: number; y: number; z: number }>): number {
  const places = [...packed.values()];
  const centre = {
    x: places.reduce((s, p) => s + p.x, 0) / places.length,
    y: places.reduce((s, p) => s + p.y, 0) / places.length,
    z: places.reduce((s, p) => s + p.z, 0) / places.length,
  };
  return Math.max(...[...packed].map(([id, p]) => distance(p, centre) + layout.get(id)!.radius));
}

/** The radius of a ball that holds this many discs of the largest size, each with its gap, packed loosely. */
function compactBound(layout: PaperLayout, ids: readonly string[]): number {
  const largest = Math.max(...ids.map((id) => layout.get(id)!.radius));
  return 2 * (largest + PAPER_CLUSTER_GAP) * Math.cbrt(ids.length) + largest;
}

describe('packMatches', () => {
  it('places only the matches, each once', () => {
    const layout = spreadLayout(30);
    const packed = packMatches(layout, new Set(['p1', 'p7', 'p22']), []);
    expect([...packed.keys()].sort()).toEqual(['p1', 'p22', 'p7']);
  });

  it('skips a match the layout does not hold', () => {
    const packed = packMatches(spreadLayout(5), new Set(['p1', 'nobody']), []);
    expect([...packed.keys()]).toEqual(['p1']);
  });

  it('gives the same cluster for the same matches, in any order', () => {
    const layout = spreadLayout(40);
    const links = [parent('p3', 'p13'), parent('p13', 'p23')];
    const a = packMatches(layout, new Set(['p3', 'p13', 'p23', 'p31', 'p9']), links);
    const b = packMatches(layout, new Set(['p9', 'p31', 'p23', 'p13', 'p3']), [...links].reverse());
    expect([...b].sort()).toEqual([...a].sort());
  });

  it('leaves the gap between every two discs', () => {
    const layout = spreadLayout(60);
    const matchIds = new Set([...layout.keys()].filter((_, i) => i % 2 === 0));
    expect(overlaps(layout, packMatches(layout, matchIds, []))).toEqual([]);
  });

  it('separates matches whose layout places are close together', () => {
    const layout: PaperLayout = new Map([
      ['a', disc(0, 0, 0, 10)],
      ['b', disc(25, 0, 0, 10)],
      ['c', disc(0, 25, 0, 10)],
      ['d', disc(400, 0, 0, 4)],
    ]);
    expect(overlaps(layout, packMatches(layout, new Set(['a', 'b', 'c', 'd']), []))).toEqual([]);
  });

  it('gathers matches from across the tree into a compact cluster', () => {
    const layout = spreadLayout(60);
    const ids = [...layout.keys()].filter((_, i) => i % 3 === 0);
    const packed = packMatches(layout, new Set(ids), []);
    const spread = clusterRadius(layout, new Map(ids.map((id) => [id, layout.get(id)!])));
    expect(clusterRadius(layout, packed)).toBeLessThan(compactBound(layout, ids));
    expect(clusterRadius(layout, packed)).toBeLessThan(spread / 2);
  });

  it('keeps a lone match where it stands', () => {
    const layout = spreadLayout(10);
    expect(packMatches(layout, new Set(['p4']), []).get('p4')).toEqual({ x: 280, y: 0, z: 50 });
  });

  it('draws a linked pair of matches together across the cluster', () => {
    const layout = spreadLayout(40);
    const ids = new Set([...layout.keys()].filter((_, i) => i % 2 === 0));
    const apart = (links: FamilyLink[]) => {
      const packed = packMatches(layout, ids, links);
      return distance(packed.get('p0')!, packed.get('p38')!);
    };
    expect(apart([parent('p0', 'p38')])).toBeLessThan(apart([]));
  });

  it('leaves the layout as it was', () => {
    const layout = spreadLayout(20);
    const before = JSON.stringify([...layout]);
    packMatches(layout, new Set(['p0', 'p5', 'p10', 'p15']), [parent('p0', 'p5')]);
    expect(JSON.stringify([...layout])).toBe(before);
  });

  it('packs a few hundred matches without overlap', () => {
    const layout = spreadLayout(300);
    const ids = new Set(layout.keys());
    const packed = packMatches(layout, ids, []);
    expect(overlaps(layout, packed)).toEqual([]);
    expect(clusterRadius(layout, packed)).toBeLessThan(compactBound(layout, [...ids]));
  });
});

describe('paperSearchLayout', () => {
  it('moves the matches to their cluster places and keeps everyone else, without changing the layout', () => {
    const layout = spreadLayout(4);
    const before = JSON.stringify([...layout]);
    const placed = paperSearchLayout(layout, new Map([['p1', { x: 1, y: 2, z: 3 }]]));
    expect(placed.get('p1')).toEqual({ x: 1, y: 2, z: 3, radius: layout.get('p1')!.radius });
    expect(placed.get('p2')).toBe(layout.get('p2'));
    expect(JSON.stringify([...layout])).toBe(before);
  });
});

describe('paperClusterView', () => {
  it('leaves room around the cluster for its names', () => {
    expect(paperClusterView(100)).toBeGreaterThan(100);
  });

  it('keeps a lone match from filling the screen', () => {
    expect(paperClusterView(6)).toBeGreaterThanOrEqual(60);
  });
});

describe('paperSearchEmphasis', () => {
  const ids = ['mum', 'dad', 'kid', 'aunt'];
  const links = [parent('mum', 'kid'), parent('dad', 'kid')];

  it('hides everyone who does not match while searching', () => {
    const emphasis = paperSearchEmphasis({ ids, links, hoveredId: null, selectedId: null, matchIds: new Set(['mum', 'kid']) });
    expect(Object.fromEntries(emphasis)).toEqual({ mum: 'normal', dad: 'hidden', kid: 'normal', aunt: 'hidden' });
  });

  it('dims the other matches around a hovered match and keeps its matched relatives', () => {
    const emphasis = paperSearchEmphasis({ ids, links, hoveredId: 'kid', selectedId: null, matchIds: new Set(['mum', 'kid', 'aunt']) });
    expect(Object.fromEntries(emphasis)).toEqual({ mum: 'relative', dad: 'hidden', kid: 'hovered', aunt: 'dimmed' });
  });

  it('ignores a selected Person who does not match, so the matches stay whole', () => {
    const emphasis = paperSearchEmphasis({ ids, links, hoveredId: null, selectedId: 'dad', matchIds: new Set(['mum', 'kid']) });
    expect(Object.fromEntries(emphasis)).toEqual({ mum: 'normal', dad: 'hidden', kid: 'normal', aunt: 'hidden' });
  });

  it('focuses a selected match', () => {
    const emphasis = paperSearchEmphasis({ ids, links, hoveredId: 'mum', selectedId: 'kid', matchIds: new Set(['mum', 'kid', 'aunt']) });
    expect(Object.fromEntries(emphasis)).toEqual({ mum: 'relative', dad: 'hidden', kid: 'focused', aunt: 'ghost' });
  });

  it('is the usual focus emphasis outside a search', () => {
    const emphasis = paperSearchEmphasis({ ids, links, hoveredId: null, selectedId: 'kid', matchIds: null });
    expect(Object.fromEntries(emphasis)).toEqual({ mum: 'relative', dad: 'relative', kid: 'focused', aunt: 'ghost' });
  });
});

describe('paper search motion', () => {
  const full: PaperLayout = new Map([
    ['a', disc(0, 0, 0)],
    ['b', disc(100, 0, 0)],
  ]);
  const gathered: PaperLayout = new Map([
    ['a', disc(40, 0, 0)],
    ['b', disc(100, 0, 0)],
  ]);
  const still: PaperSearchMotion = { since: 0, offsets: new Map(), sizes: new Map(), targetSizes: new Map() };

  it('starts each moved Person where it was drawn, and each hidden Person whole', () => {
    const motion = paperSearchMotionFrom(still, full, gathered, new Set(['a']), 5);
    const now = paperSearchMotionAt(motion, 5);
    expect(now.offsets.get('a')).toEqual({ x: -40, y: 0, z: 0 });
    expect(now.offsets.has('b')).toBe(false);
    expect(now.sizes.get('b')).toBe(1);
  });

  it('arrives in the cluster with the non-matches shrunk away, within its time', () => {
    const motion = paperSearchMotionFrom(still, full, gathered, new Set(['a']), 5);
    const end = paperSearchMotionAt(motion, 5 + Math.max(PAPER_GATHER_SECONDS, PAPER_SHRINK_SECONDS));
    expect(end.offsets.size).toBe(0);
    expect(end.sizes.get('b')).toBe(0);
    expect(end.sizes.has('a')).toBe(false);
    expect(end.done).toBe(true);
  });

  it('moves part of the way, and shrinks part of the way, in between', () => {
    const motion = paperSearchMotionFrom(still, full, gathered, new Set(['a']), 0);
    const mid = paperSearchMotionAt(motion, PAPER_SHRINK_SECONDS / 2);
    const x = mid.offsets.get('a')!.x;
    expect(x).toBeGreaterThan(-40);
    expect(x).toBeLessThan(0);
    expect(mid.sizes.get('b')).toBeGreaterThan(0);
    expect(mid.sizes.get('b')).toBeLessThan(1);
    expect(mid.done).toBe(false);
  });

  it('turns back from wherever it is when the search changes midway', () => {
    const out = paperSearchMotionFrom(still, full, gathered, new Set(['a']), 0);
    const t = PAPER_SHRINK_SECONDS / 2;
    const midway = paperSearchMotionAt(out, t);
    const drawnA = 40 + midway.offsets.get('a')!.x;
    const back = paperSearchMotionFrom(out, gathered, full, null, t);
    const now = paperSearchMotionAt(back, t);
    expect(0 + now.offsets.get('a')!.x).toBeCloseTo(drawnA);
    expect(now.sizes.get('b')).toBeCloseTo(midway.sizes.get('b')!);
    const end = paperSearchMotionAt(back, t + Math.max(PAPER_GATHER_SECONDS, PAPER_SHRINK_SECONDS));
    expect(end.offsets.size).toBe(0);
    expect(end.sizes.size).toBe(0);
  });

  it('ends at once when the time is not a finite number (ADR 0011)', () => {
    const motion = paperSearchMotionFrom(still, full, gathered, new Set(['a']), 0);
    expect(paperSearchMotionAt(motion, NaN).done).toBe(true);
  });
});

describe('paperSearchCount', () => {
  it('counts no matches as people', () => {
    expect(paperSearchCount(0)).toBe('0 PEOPLE');
  });

  it('counts one match as a person', () => {
    expect(paperSearchCount(1)).toBe('1 PERSON');
  });

  it('counts many matches as people', () => {
    expect(paperSearchCount(32)).toBe('32 PEOPLE');
  });
});

describe('paperEscape', () => {
  it('clears the selected Person before the search', () => {
    expect(paperEscape({ interactionIdle: false, searchQuery: 'Zabalawi' })).toBe('interaction');
  });

  it('clears the search once nobody is selected', () => {
    expect(paperEscape({ interactionIdle: true, searchQuery: 'Zabalawi' })).toBe('search');
  });

  it('leaves a selection to the interaction when there is no search', () => {
    expect(paperEscape({ interactionIdle: false, searchQuery: '' })).toBe('interaction');
  });

  it('does nothing with no selection and no search', () => {
    expect(paperEscape({ interactionIdle: true, searchQuery: '' })).toBeNull();
  });
});

describe('Prev/Next over the search cluster', () => {
  const matches = [{ id: 'c' }, { id: 'a' }, { id: 'hidden' }, { id: 'b' }];
  const order = paperSearchOrder(matches, new Set(['a', 'b', 'c'])).map((m) => m.id);

  it('steps in the order the search found the matches, skipping any not in the cluster', () => {
    expect(order).toEqual(['c', 'a', 'b']);
  });

  it('starts at the first match going forward and the last going back', () => {
    expect(paperCycle(order, null, false)).toBe('c');
    expect(paperCycle(order, null, true)).toBe('b');
  });

  it('visits every match once before coming round again', () => {
    const visited: string[] = [];
    let at: string | null = null;
    for (let i = 0; i < 4; i++) visited.push((at = paperCycle(order, at, false))!);
    expect(visited).toEqual(['c', 'a', 'b', 'c']);
  });

  it('steps back the other way round', () => {
    expect(paperCycle(order, 'a', true)).toBe('c');
    expect(paperCycle(order, 'c', true)).toBe('b');
  });

  it('starts from the first match when a non-match is selected', () => {
    expect(paperCycle(order, 'hidden', false)).toBe('c');
  });
});
