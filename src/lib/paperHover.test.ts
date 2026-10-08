import { describe, expect, it } from 'vitest';
import type { Emphasis } from './focusEmphasis';
import type { FamilyLink } from '../types/graph';
import type { PaperLayout, PaperLine } from './paperLayout';
import { easeDrift, linesOf, nearestDiscAt, paperDrift, paperScreenRadius } from './paperHover';

describe('nearestDiscAt', () => {
  const discs = [
    { id: 'a', x: 100, y: 100, radius: 10 },
    { id: 'b', x: 112, y: 100, radius: 10 },
    { id: 'c', x: 300, y: 300, radius: 4 },
  ];

  it('returns the disc whose centre is nearest the pointer when several cover it', () => {
    expect(nearestDiscAt({ x: 104, y: 100 }, discs)).toBe('a');
    expect(nearestDiscAt({ x: 108, y: 100 }, discs)).toBe('b');
  });

  it('returns a disc when the pointer is on its rim', () => {
    expect(nearestDiscAt({ x: 304, y: 300 }, discs)).toBe('c');
  });

  it('returns none when the pointer is outside every disc', () => {
    expect(nearestDiscAt({ x: 305, y: 300 }, discs)).toBeNull();
    expect(nearestDiscAt({ x: 100, y: 200 }, discs)).toBeNull();
  });

  it('returns none for no discs', () => {
    expect(nearestDiscAt({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe('paperScreenRadius', () => {
  it('is the world radius over the half-height the view covers at that depth, in pixels', () => {
    // A 90 degree view covers 100 units above and below the axis at depth 100, drawn in 400 px.
    expect(paperScreenRadius(10, 100, 90, 800)).toBeCloseTo(40);
  });

  it('halves when the depth doubles', () => {
    expect(paperScreenRadius(10, 200, 90, 800)).toBeCloseTo(20);
  });

  it('is zero for a disc at or behind the camera', () => {
    expect(paperScreenRadius(10, 0, 90, 800)).toBe(0);
    expect(paperScreenRadius(10, -5, 90, 800)).toBe(0);
  });
});

describe('paperDrift', () => {
  const layout: PaperLayout = new Map([
    ['hovered', { x: 0, y: 0, z: 0, radius: 4 }],
    ['far', { x: 200, y: 0, z: 0, radius: 4 }],
    ['near', { x: 0, y: 14, z: 0, radius: 4 }],
    ['mid', { x: 0, y: 0, z: -40, radius: 4 }],
    ['other', { x: 50, y: 50, z: 0, radius: 4 }],
  ]);
  const hover = new Map<string, Emphasis>([
    ['hovered', 'hovered'],
    ['far', 'relative'],
    ['near', 'relative'],
    ['mid', 'relative'],
    ['other', 'dimmed'],
  ]);

  it('moves only relatives', () => {
    expect([...paperDrift(layout, hover).keys()].sort()).toEqual(['far', 'mid', 'near']);
  });

  it('moves each relative straight toward the hovered Person', () => {
    const drift = paperDrift(layout, hover);
    expect(drift.get('far')!.x).toBeLessThan(0);
    expect(drift.get('far')!.y).toBeCloseTo(0);
    expect(drift.get('mid')!.z).toBeGreaterThan(0);
    expect(drift.get('near')!.y).toBeLessThan(0);
  });

  it('moves a relative by a small share of the distance, and never more than 6 units', () => {
    const drift = paperDrift(layout, hover);
    expect(length(drift.get('mid')!)).toBeCloseTo(6);
    expect(length(drift.get('far')!)).toBeCloseTo(6);
  });

  it('stops a close relative short of the gap discs keep between them', () => {
    // 14 apart, radii 4 and 4, gap 4: 2 units of room.
    expect(length(paperDrift(layout, hover).get('near')!)).toBeCloseTo(2);
  });

  it('leaves the layout as it was', () => {
    const before = structuredClone([...layout]);
    paperDrift(layout, hover);
    expect([...layout]).toEqual(before);
  });

  it('moves nobody when nobody is hovered, as when a Person is focused', () => {
    const focus = new Map<string, Emphasis>([
      ['hovered', 'focused'],
      ['far', 'relative'],
      ['other', 'ghost'],
    ]);
    expect(paperDrift(layout, focus).size).toBe(0);
  });
});

function length(p: { x: number; y: number; z: number }): number {
  return Math.hypot(p.x, p.y, p.z);
}

describe('easeDrift', () => {
  const target = new Map([['a', { x: 6, y: 0, z: 0 }]]);

  it('moves part of the way toward the target in one frame', () => {
    const x = easeDrift(new Map(), target, 1 / 60).get('a')!.x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(6);
  });

  it('arrives at the target given time', () => {
    expect(easeDrift(new Map(), target, 5).get('a')).toEqual({ x: 6, y: 0, z: 0 });
  });

  it('eases a Person back to their layout place once the hover ends, then drops them', () => {
    const current = new Map([['a', { x: 6, y: 0, z: 0 }]]);
    expect(easeDrift(current, new Map(), 1 / 60).get('a')!.x).toBeLessThan(6);
    expect(easeDrift(current, new Map(), 5).size).toBe(0);
  });

  it('leaves its inputs as they were', () => {
    const current = new Map([['a', { x: 1, y: 0, z: 0 }]]);
    easeDrift(current, target, 1 / 60);
    expect(current.get('a')).toEqual({ x: 1, y: 0, z: 0 });
    expect(target.get('a')).toEqual({ x: 6, y: 0, z: 0 });
  });
});

describe('linesOf', () => {
  const line = (sourceId: string, targetId: string, type: FamilyLink['type'] = 'parent'): PaperLine => ({
    sourceId,
    targetId,
    type,
    link: { source: sourceId, target: targetId, type } as FamilyLink,
  });
  const lines = [line('dad', 'kid'), line('mum', 'kid'), line('dad', 'mum', 'marriage'), line('kid', 'grandkid'), line('x', 'y')];

  it("picks exactly the lines that end at the Person, either end", () => {
    expect(linesOf(lines, 'kid')).toEqual([lines[0], lines[1], lines[3]]);
    expect(linesOf(lines, 'mum')).toEqual([lines[1], lines[2]]);
  });

  it('picks none for nobody', () => {
    expect(linesOf(lines, null)).toEqual([]);
  });
});
