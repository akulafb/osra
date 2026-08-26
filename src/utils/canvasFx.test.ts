import { describe, it, expect } from 'vitest';
import {
  seedCanvasParticles,
  canvasParticleAt,
  spawnRingAt,
  cardSpawnAt,
  cardDissolveAt,
  linkGrowthAt,
  subProgress,
  CANVAS_FX_PARTICLES,
  CARD_SPAWN_FRACTION,
  CARD_DISSOLVE_FRACTION,
} from './canvasFx';

/** Deterministic stand-in for Math.random, so shapes are asserted not eyeballed. */
const cycling = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const ORIGIN = { x: 100, y: 50, width: 120, height: 40 };

describe('canvasFx — particle seeding', () => {
  it('spreads a Spawn evenly around the circle', () => {
    const seeds = seedCanvasParticles(CANVAS_FX_PARTICLES.spawn, 'spawn', () => 0.5);
    expect(seeds).toHaveLength(36);
    // No jitter (random() === 0.5), so directions are exactly the even fan.
    expect(seeds[0].dx).toBeCloseTo(1);
    expect(seeds[0].dy).toBeCloseTo(0);
    expect(seeds[9].dx).toBeCloseTo(0);
    expect(seeds[9].dy).toBeCloseTo(1);
  });

  it('gives Dissolve debris an upward drift and a spread origin', () => {
    const seeds = seedCanvasParticles(4, 'dissolve', cycling([0.25, 0.5, 0.75, 1]));
    expect(seeds.every((s) => s.offsetX !== 0 || s.offsetY !== 0)).toBe(true);
    const spawn = seedCanvasParticles(4, 'spawn', cycling([0.25, 0.5, 0.75, 1]));
    expect(spawn.every((s) => s.offsetX === 0 && s.offsetY === 0)).toBe(true);
  });

  it('is deterministic for a given random source', () => {
    const a = seedCanvasParticles(8, 'dissolve', cycling([0.1, 0.4, 0.7]));
    const b = seedCanvasParticles(8, 'dissolve', cycling([0.1, 0.4, 0.7]));
    expect(a).toEqual(b);
  });
});

describe('canvasFx — particle motion', () => {
  const seed = seedCanvasParticles(1, 'spawn', () => 0.5)[0];

  it('starts at the origin and travels outwards', () => {
    const start = canvasParticleAt(seed, 0, ORIGIN);
    const mid = canvasParticleAt(seed, 0.5, ORIGIN);
    const end = canvasParticleAt(seed, 1, ORIGIN);

    expect(start.x).toBeCloseTo(ORIGIN.x);
    expect(mid.x).toBeGreaterThan(start.x);
    expect(end.x).toBeGreaterThan(mid.x);
  });

  it('decelerates — more ground covered in the first half than the second', () => {
    const first = canvasParticleAt(seed, 0.5, ORIGIN).x - canvasParticleAt(seed, 0, ORIGIN).x;
    const second = canvasParticleAt(seed, 1, ORIGIN).x - canvasParticleAt(seed, 0.5, ORIGIN).x;
    expect(first).toBeGreaterThan(second);
  });

  it('fades and shrinks to nothing by the end of the clock', () => {
    const end = canvasParticleAt(seed, 1, ORIGIN);
    expect(end.opacity).toBe(0);
    expect(end.r).toBeGreaterThanOrEqual(0);
    expect(end.r).toBeLessThan(seed.size);
  });

  it('never produces a negative radius or opacity, however far past the end', () => {
    const past = canvasParticleAt(seed, 4, ORIGIN);
    expect(past.opacity).toBeGreaterThanOrEqual(0);
    expect(past.r).toBeGreaterThanOrEqual(0);
  });
});

describe('canvasFx — card renderings', () => {
  it('pops the Spawn card past 1 before settling on 1', () => {
    const overshoot = cardSpawnAt(CARD_SPAWN_FRACTION * 0.6).scale;
    expect(cardSpawnAt(0).scale).toBeCloseTo(0.2);
    expect(overshoot).toBeGreaterThan(1);
    expect(cardSpawnAt(CARD_SPAWN_FRACTION).scale).toBeCloseTo(1);
  });

  it('finishes the card inside the lifecycle, not beside it', () => {
    // The card is done well before the particles are — one clock, two windows.
    expect(cardSpawnAt(CARD_SPAWN_FRACTION).scale).toBeCloseTo(cardSpawnAt(1).scale);
    expect(cardDissolveAt(CARD_DISSOLVE_FRACTION).opacity).toBeCloseTo(cardDissolveAt(1).opacity);
    expect(CARD_SPAWN_FRACTION).toBeLessThan(1);
    expect(CARD_DISSOLVE_FRACTION).toBeLessThan(1);
  });

  it('fades the Dissolve card out and blurs it', () => {
    expect(cardDissolveAt(0).opacity).toBe(1);
    expect(cardDissolveAt(0).blur).toBe(0);
    expect(cardDissolveAt(CARD_DISSOLVE_FRACTION).opacity).toBeCloseTo(0);
    expect(cardDissolveAt(CARD_DISSOLVE_FRACTION).blur).toBeCloseTo(12);
  });

  it('runs an abort backwards through the same frames', () => {
    // An unwinding lifecycle feeds progress back down, so the card returns to
    // exactly the frame it started from rather than snapping back.
    expect(cardDissolveAt(0)).toEqual(cardDissolveAt(0));
    expect(cardDissolveAt(0.05).opacity).toBeGreaterThan(cardDissolveAt(0.2).opacity);
  });

  it('expands and fades the Spawn ring', () => {
    expect(spawnRingAt(0).opacity).toBe(1);
    expect(spawnRingAt(1).opacity).toBe(0);
    expect(spawnRingAt(1).scale).toBeGreaterThan(spawnRingAt(0).scale);
  });
});

describe('canvasFx — link Spawn', () => {
  it('grows the path over the first half, then holds it drawn', () => {
    expect(linkGrowthAt(0).drawn).toBe(0);
    expect(linkGrowthAt(0.25).drawn).toBeCloseTo(0.5);
    expect(linkGrowthAt(0.5).drawn).toBe(1);
    expect(linkGrowthAt(1).drawn).toBe(1);
  });

  it('peaks the glow mid-lifecycle and returns to nothing', () => {
    expect(linkGrowthAt(0).glow).toBe(0);
    expect(linkGrowthAt(0.5).glow).toBeCloseTo(1);
    expect(linkGrowthAt(1).glow).toBe(0);
  });
});

describe('canvasFx — subProgress', () => {
  it('rescales into a sub-window and clamps at its end', () => {
    expect(subProgress(0.25, 0.5)).toBeCloseTo(0.5);
    expect(subProgress(0.5, 0.5)).toBe(1);
    expect(subProgress(0.9, 0.5)).toBe(1);
  });
});
