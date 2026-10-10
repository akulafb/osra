import { describe, it, expect } from 'vitest';
import { layoutPaperTree, placeNewcomer } from './paperLayout';
import { paperFrame } from '../components/paper/paperScene';
import { KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';
import { SPREAD_MAX, SPREAD_MIN, spreadCentre, spreadFollow, spreadFrame, spreadLayout, spreadOffsets, spreadPoint, toSpread, type Spread } from './paperSpread';

const at = (n: number) => n as Spread;

describe('spreadPoint', () => {
  it('moves a point away from the centre by the Spread, keeping its direction', () => {
    expect(spreadPoint({ x: 10, y: 0, z: -5 }, { x: 20, y: 4, z: -5 }, at(2))).toEqual({ x: 30, y: 8, z: -5 });
  });

  it('leaves every point exactly where the layout put it at 1x, with no rounding drift', () => {
    expect(spreadPoint({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0.3, y: 0.7, z: -0.3 }, at(1))).toEqual({ x: 0.3, y: 0.7, z: -0.3 });
  });
});

describe('toSpread', () => {
  it('runs from today\'s layout at 1x to 3x', () => {
    expect(SPREAD_MIN).toBe(1);
    expect(SPREAD_MAX).toBe(3);
  });

  it('keeps any value between the ends as it is, so the slider is continuous', () => {
    expect(toSpread(1.37)).toBe(1.37);
    expect(toSpread(2.999)).toBe(2.999);
  });

  it('clamps a value outside the range to the nearer end', () => {
    expect(toSpread(0.4)).toBe(1);
    expect(toSpread(-2)).toBe(1);
    expect(toSpread(7)).toBe(3);
    expect(toSpread(Infinity)).toBe(3);
  });

  it('falls back to 1x for a value that is not a number', () => {
    expect(toSpread(NaN)).toBe(1);
  });
});

describe('spreadFollow', () => {
  const centre = { x: 5, y: 0, z: 0 };
  const person = { x: 15, y: -4, z: 2 };

  it('moves the camera by exactly as far as the focused Person moved, so they stay put on screen', () => {
    expect(spreadFollow(person, { centre, factor: at(1) }, { centre, factor: at(2) })).toEqual({ x: 10, y: -4, z: 2 });
    expect(spreadFollow(person, { centre, factor: at(2) }, { centre, factor: at(1.5) })).toEqual({ x: -5, y: 2, z: -1 });
  });

  it('does not move the camera for a Person at the centre, who never moves', () => {
    expect(spreadFollow(centre, { centre, factor: at(1) }, { centre, factor: at(3) })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('follows a new centre too, at the same Spread', () => {
    expect(spreadFollow(person, { centre, factor: at(2) }, { centre: { x: 7, y: 0, z: 0 }, factor: at(2) })).toEqual({ x: -2, y: 0, z: 0 });
  });
});

describe('spreadFrame', () => {
  const layout = layoutPaperTree(KINSHIP_FIXTURE_TREE);
  const frame = paperFrame(layout, layout.keys());
  const centre = frame.center;

  it('is the still frame at 1x', () => {
    expect(spreadFrame(frame, { centre, factor: at(1) })).toEqual(frame);
  });

  it('keeps the whole tree on its own centre and grows it, so RESET VIEWPORT frames it at any Spread', () => {
    const spread = spreadFrame(frame, { centre, factor: at(2.5) });
    expect(spread.center).toEqual(frame.center);
    expect(spread.radius).toBeCloseTo(frame.radius * 2.5);
  });

  it('holds every spread disc whole', () => {
    for (const factor of [at(1.5), at(2), at(3)]) {
      const { center, radius } = spreadFrame(frame, { centre, factor });
      for (const disc of layout.values()) {
        const place = spreadPoint(centre, disc, factor);
        expect(Math.hypot(place.x - center.x, place.y - center.y, place.z - center.z) + disc.radius).toBeLessThanOrEqual(radius + 1e-9);
      }
    }
  });

  it('moves a frame off the centre out with its Persons, as a search cluster does', () => {
    expect(spreadFrame({ center: { x: 10, y: 0, z: 0 }, radius: 4 }, { centre: { x: 0, y: 0, z: 0 }, factor: at(2) })).toEqual({
      center: { x: 20, y: 0, z: 0 },
      radius: 8,
    });
  });
});

describe('spreadOffsets', () => {
  it('grows a move measured in the layout, such as a search match travelling to its cluster, so it starts where the Person is drawn', () => {
    const centre = { x: 0, y: 0, z: 0 };
    const was = { x: 40, y: 10, z: 0 };
    const cluster = { x: 5, y: 5, z: 0 };
    const offsets = new Map([['a', { x: was.x - cluster.x, y: was.y - cluster.y, z: was.z - cluster.z }]]);
    const travel = spreadOffsets(offsets, at(2)).get('a')!;
    const drawn = spreadPoint(centre, cluster, at(2));
    expect({ x: drawn.x + travel.x, y: drawn.y + travel.y, z: drawn.z + travel.z }).toEqual(spreadPoint(centre, was, at(2)));
  });

  it('hands back the same map at 1x, so nothing redraws', () => {
    const offsets = new Map([['a', { x: 1, y: 2, z: 3 }]]);
    expect(spreadOffsets(offsets, at(1))).toBe(offsets);
  });
});

describe('spreadLayout', () => {
  const layout = new Map([
    ['a', { x: 10, y: 0, z: 0, radius: 6 }],
    ['b', { x: -2, y: 4, z: 1, radius: 3 }],
  ]);
  const centre = { x: 2, y: 0, z: 0 };

  it('spreads every place and keeps every disc its size', () => {
    expect([...spreadLayout(layout, { centre, factor: at(3) })]).toEqual([
      ['a', { x: 26, y: 0, z: 0, radius: 6 }],
      ['b', { x: -10, y: 12, z: 3, radius: 3 }],
    ]);
  });

  it('is the still layout itself at 1x', () => {
    expect(spreadLayout(layout, { centre, factor: at(1) })).toBe(layout);
  });
});

describe('spreadCentre', () => {
  const loaded = layoutPaperTree(KINSHIP_FIXTURE_TREE);
  const outermost = [...loaded].reduce((far, next) => (next[1].x > far[1].x ? next : far))[0];
  const withNewcomer = placeNewcomer(loaded, 'newcomer', [{ source: outermost, target: 'newcomer', type: 'parent' }]);

  it('is the middle of the full layout made at load', () => {
    expect(spreadCentre(loaded, new Set())).toEqual(paperFrame(loaded, loaded.keys()).center);
  });

  it('stays where it was when a newcomer is placed at the edge of the tree', () => {
    expect(paperFrame(withNewcomer, withNewcomer.keys()).center).not.toEqual(paperFrame(loaded, loaded.keys()).center);
    expect(spreadCentre(withNewcomer, new Set(['newcomer']))).toEqual(spreadCentre(loaded, new Set()));
  });

  it('leaves every other Person where they were drawn when a newcomer arrives at 3x', () => {
    const before = spreadLayout(loaded, { centre: spreadCentre(loaded, new Set()), factor: at(3) });
    const after = spreadLayout(withNewcomer, { centre: spreadCentre(withNewcomer, new Set(['newcomer'])), factor: at(3) });
    for (const [id, disc] of before) expect(after.get(id), id).toEqual(disc);
  });
});
