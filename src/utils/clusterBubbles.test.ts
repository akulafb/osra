import { describe, it, expect } from 'vitest';
import {
  computeVisibleBounds,
  computeClusterCentroids,
  bubbleRadius,
  capRadiiToNeighbors,
  detailFactor,
  apparentDiameterFraction,
  ramp01,
  type LiveNode,
  ENTER_MULT,
  EXIT_MULT,
  MIN_BUBBLE_RADIUS_FRAC,
  MAX_BUBBLE_RADIUS_FRAC,
  BUBBLE_NEIGHBOR_FRACTION,
} from './clusterBubbles';

describe('computeVisibleBounds', () => {
  it('returns origin/zero for no positioned nodes', () => {
    expect(computeVisibleBounds([])).toEqual({ centroid: { x: 0, y: 0, z: 0 }, radius: 0 });
    expect(computeVisibleBounds([{ familyCluster: 'A' }])).toEqual({
      centroid: { x: 0, y: 0, z: 0 },
      radius: 0,
    });
  });

  it('computes centroid and bounding radius from positions', () => {
    const nodes: LiveNode[] = [
      { x: -10, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const { centroid, radius } = computeVisibleBounds(nodes);
    expect(centroid).toEqual({ x: 0, y: 0, z: 0 });
    expect(radius).toBeCloseTo(10);
  });

  it('ignores nodes with non-finite positions', () => {
    const nodes: LiveNode[] = [
      { x: 0, y: 0, z: 0 },
      { x: NaN, y: 5, z: 5 },
      { x: 6, y: 0, z: 0 },
    ];
    const { centroid } = computeVisibleBounds(nodes);
    expect(centroid).toEqual({ x: 3, y: 0, z: 0 });
  });
});

describe('computeClusterCentroids', () => {
  it('groups by familyCluster and counts members', () => {
    const nodes: LiveNode[] = [
      { x: 0, y: 0, z: 0, familyCluster: 'Badran' },
      { x: 10, y: 0, z: 0, familyCluster: 'Badran' },
      { x: 100, y: 100, z: 100, familyCluster: 'Kutob' },
    ];
    const result = computeClusterCentroids(nodes);
    expect(result.size).toBe(2);
    expect(result.get('Badran')).toEqual({ centroid: { x: 5, y: 0, z: 0 }, count: 2 });
    expect(result.get('Kutob')).toEqual({
      centroid: { x: 100, y: 100, z: 100 },
      count: 1,
    });
  });

  it('skips nodes without a cluster and trims names', () => {
    const nodes: LiveNode[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1, familyCluster: '   ' },
      { x: 4, y: 0, z: 0, familyCluster: ' Badran ' },
    ];
    const result = computeClusterCentroids(nodes);
    expect(result.size).toBe(1);
    expect(result.get('Badran')?.count).toBe(1);
  });

  it('counts a member even if unpositioned, but centroids only over positioned ones', () => {
    const nodes: LiveNode[] = [
      { x: 0, y: 0, z: 0, familyCluster: 'Badran' },
      { x: 10, y: 0, z: 0, familyCluster: 'Badran' },
      { familyCluster: 'Badran' },
    ];
    const result = computeClusterCentroids(nodes);
    expect(result.get('Badran')).toEqual({ centroid: { x: 5, y: 0, z: 0 }, count: 3 });
  });

  it('omits clusters with no positioned members', () => {
    const nodes: LiveNode[] = [{ familyCluster: 'Ghosts' }];
    expect(computeClusterCentroids(nodes).size).toBe(0);
  });
});

describe('bubbleRadius', () => {
  const R = 1000; // graph bounding radius

  it('sizes the largest cluster as the full "sun" (fraction of graph radius)', () => {
    expect(bubbleRadius(405, 405, R)).toBeCloseTo(MAX_BUBBLE_RADIUS_FRAC * R);
    expect(bubbleRadius(7, 7, R)).toBeCloseTo(MAX_BUBBLE_RADIUS_FRAC * R);
  });

  it('floors tiny / empty clusters at the minimum fraction', () => {
    expect(bubbleRadius(1, 405, R)).toBeCloseTo(MIN_BUBBLE_RADIUS_FRAC * R);
    expect(bubbleRadius(0, 405, R)).toBeCloseTo(MIN_BUBBLE_RADIUS_FRAC * R);
  });

  it('scales with the graph radius (so few-node and many-node trees look alike)', () => {
    expect(bubbleRadius(405, 405, 2000)).toBeCloseTo(2 * bubbleRadius(405, 405, 1000));
    expect(bubbleRadius(0, 405, 0)).toBe(0); // degenerate graph → no bubble
  });

  it('grows monotonically with member count for a fixed max', () => {
    expect(bubbleRadius(200, 405, R)).toBeGreaterThan(bubbleRadius(20, 405, R));
    expect(bubbleRadius(20, 405, R)).toBeGreaterThanOrEqual(bubbleRadius(5, 405, R));
  });

  it('gives the dominant family a strong size lead ("sun vs planets")', () => {
    // A 405-member family should dwarf a singleton, unlike the old ~2.4x.
    expect(bubbleRadius(405, 405, R)).toBeGreaterThanOrEqual(bubbleRadius(1, 405, R) * 5);
  });

  it('is area-proportional: 4x the members ≈ 2x the radius', () => {
    // radius ∝ √count, so quadrupling members doubles the radius (above the floor).
    expect(bubbleRadius(400, 400, R)).toBeCloseTo(bubbleRadius(100, 400, R) * 2);
  });
});

describe('capRadiiToNeighbors', () => {
  const O = { x: 0, y: 0, z: 0 };

  it('leaves bubbles that are already comfortably apart untouched', () => {
    const centroids = [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }];
    const desired = [50, 50]; // 50 + 50 << 1000 apart → no overlap
    expect(capRadiiToNeighbors(centroids, desired, 5)).toEqual([50, 50]);
  });

  it('shrinks overlapping bubbles so the pair no longer meshes', () => {
    const centroids = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
    const desired = [400, 400]; // would massively overlap
    const [a, b] = capRadiiToNeighbors(centroids, desired, 1);
    expect(a).toBeCloseTo(BUBBLE_NEIGHBOR_FRACTION * 100);
    expect(a + b).toBeLessThan(100); // sum < centre distance ⇒ a real gap
  });

  it('never lets any pair overlap, even in a close cluster of families', () => {
    const centroids = [
      { x: 0, y: 0, z: 0 },
      { x: 60, y: 0, z: 0 },
      { x: 0, y: 80, z: 0 },
      { x: 50, y: 50, z: 0 },
    ];
    const desired = [300, 300, 300, 300];
    const r = capRadiiToNeighbors(centroids, desired, 1);
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const dx = centroids[i].x - centroids[j].x;
        const dy = centroids[i].y - centroids[j].y;
        const d = Math.hypot(dx, dy);
        expect(r[i] + r[j]).toBeLessThanOrEqual(d + 1e-9);
      }
    }
  });

  it('keeps near-coincident clusters visible via the min floor', () => {
    const centroids = [O, { x: 1, y: 0, z: 0 }];
    expect(capRadiiToNeighbors(centroids, [300, 300], 20)).toEqual([20, 20]);
  });

  it('does not cap a lone bubble (no neighbours)', () => {
    expect(capRadiiToNeighbors([O], [123], 5)).toEqual([123]);
  });
});

describe('detailFactor', () => {
  const R = 100;

  it('is 0 when zoomed in (below exit distance)', () => {
    expect(detailFactor(EXIT_MULT * R - 1, R)).toBe(0);
    expect(detailFactor(0, R)).toBe(0);
  });

  it('is 1 when zoomed out (beyond enter distance)', () => {
    expect(detailFactor(ENTER_MULT * R + 1, R)).toBe(1);
  });

  it('ramps smoothly between exit and enter', () => {
    const mid = ((EXIT_MULT + ENTER_MULT) / 2) * R;
    const t = detailFactor(mid, R);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(t).toBeCloseTo(0.5);
  });

  it('returns 0 for a degenerate (zero-radius) graph', () => {
    expect(detailFactor(5000, 0)).toBe(0);
  });
});

describe('apparentDiameterFraction', () => {
  // 90° vertical FOV => tan(fov/2) = 1, so fraction = radius / distance.
  const FOV_90 = Math.PI / 2;

  it('shrinks as the camera moves away (∝ 1/distance)', () => {
    const near = apparentDiameterFraction(100, 1000, FOV_90);
    const far = apparentDiameterFraction(100, 2000, FOV_90);
    expect(near).toBeCloseTo(0.1);
    expect(far).toBeCloseTo(0.05);
  });

  it('grows with bubble radius (a "sun" stays visible far longer than a "planet")', () => {
    expect(apparentDiameterFraction(600, 8000, FOV_90)).toBeGreaterThan(
      apparentDiameterFraction(50, 8000, FOV_90)
    );
  });

  it('returns Infinity at zero distance / bad inputs (always visible)', () => {
    expect(apparentDiameterFraction(100, 0, FOV_90)).toBe(Infinity);
    expect(apparentDiameterFraction(100, 1000, 0)).toBe(Infinity);
  });
});

describe('ramp01', () => {
  it('clamps below lo and above hi', () => {
    expect(ramp01(-5, 0, 10)).toBe(0);
    expect(ramp01(0, 0, 10)).toBe(0);
    expect(ramp01(10, 0, 10)).toBe(1);
    expect(ramp01(99, 0, 10)).toBe(1);
  });

  it('ramps linearly between lo and hi', () => {
    expect(ramp01(5, 0, 10)).toBeCloseTo(0.5);
    expect(ramp01(2.5, 0, 10)).toBeCloseTo(0.25);
  });

  it('treats a degenerate band as a hard step', () => {
    expect(ramp01(4, 5, 5)).toBe(0);
    expect(ramp01(5, 5, 5)).toBe(1);
  });
});
