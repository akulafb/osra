import { describe, it, expect } from 'vitest';
import { depthFade, isTap, paperFrame, paperLabelSize, paperLineSegments, TAP_SLOP_PX } from './paperScene';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';

const layout: PaperLayout = new Map([
  ['a', { x: -10, y: 0, z: 0, radius: 2 }],
  ['b', { x: 10, y: 0, z: 0, radius: 4 }],
  ['c', { x: 0, y: 6, z: 0, radius: 1 }],
]);

function line(sourceId: string, targetId: string, type: PaperLine['type']): PaperLine {
  return { sourceId, targetId, type, link: { source: sourceId, target: targetId, type } };
}

describe('paperFrame', () => {
  it('centres on the middle of the discs and reaches the outer edge of the farthest one', () => {
    const frame = paperFrame(layout, ['a', 'b', 'c']);
    expect(frame.center).toEqual({ x: 0, y: 3, z: 0 });
    expect(frame.radius).toBeCloseTo(Math.hypot(10, 3) + 4);
  });

  it('frames only the Persons it is given, and skips ids with no disc', () => {
    const frame = paperFrame(layout, ['a', 'missing']);
    expect(frame.center).toEqual({ x: -10, y: 0, z: 0 });
    expect(frame.radius).toBe(2);
  });

  it('has a small radius rather than none when nobody is shown', () => {
    const frame = paperFrame(layout, []);
    expect(frame.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(frame.radius).toBeGreaterThan(0);
  });
});

describe('depthFade', () => {
  it('is full ink up to where the fade starts', () => {
    expect(depthFade(5, 10, 20)).toBe(1);
    expect(depthFade(10, 10, 20)).toBe(1);
  });

  it('is gone from where the fade ends', () => {
    expect(depthFade(20, 10, 20)).toBe(0);
    expect(depthFade(99, 10, 20)).toBe(0);
  });

  it('fades evenly in between', () => {
    expect(depthFade(15, 10, 20)).toBeCloseTo(0.5);
    expect(depthFade(17.5, 10, 20)).toBeCloseTo(0.25);
  });

  it('steps at the start when the window is empty', () => {
    expect(depthFade(9, 10, 10)).toBe(1);
    expect(depthFade(11, 10, 10)).toBe(0);
  });
});

describe('isTap', () => {
  it('counts a small pointer movement as a click', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 104 })).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: TAP_SLOP_PX, y: 0 })).toBe(true);
  });

  it('counts a longer movement as a drag', () => {
    expect(isTap({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
    expect(isTap({ x: 0, y: 0 }, { x: 0, y: 30 })).toBe(false);
  });

  it('counts a release with no recorded press as a click', () => {
    expect(isTap(null, { x: 0, y: 30 })).toBe(true);
  });
});

describe('paperLabelSize', () => {
  it('draws the labels of larger discs bigger and bolder', () => {
    const small = paperLabelSize(4);
    const large = paperLabelSize(14);
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
    expect(large.weight).toBeGreaterThan(small.weight);
  });

  it('keeps the weight between regular and bold', () => {
    expect(paperLabelSize(0).weight).toBeGreaterThanOrEqual(0);
    expect(paperLabelSize(100).weight).toBeLessThanOrEqual(1);
  });
});

describe('paperLineSegments', () => {
  it('groups the lines by kind as start and end points', () => {
    const segments = paperLineSegments(
      [line('a', 'b', 'marriage'), line('a', 'c', 'parent'), line('b', 'c', 'divorce'), line('c', 'b', 'parent')],
      layout
    );
    expect(segments.marriage).toEqual([[-10, 0, 0], [10, 0, 0]]);
    expect(segments.divorce).toEqual([[10, 0, 0], [0, 6, 0]]);
    expect(segments.parent).toEqual([[-10, 0, 0], [0, 6, 0], [0, 6, 0], [10, 0, 0]]);
  });

  it('leaves out a line whose Person has no disc', () => {
    const segments = paperLineSegments([line('a', 'missing', 'parent')], layout);
    expect(segments.parent).toEqual([]);
  });
});
