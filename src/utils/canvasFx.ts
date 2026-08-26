/**
 * Canvas FX: the 2D renderings of the Spawn and Dissolve lifecycles (LIN-55,
 * ADR-0007). The 3D pair lives in `cosmicFx.ts`.
 *
 * Every function here takes a normalized progress and returns numbers. Nothing
 * in this file knows what time it is: the lifecycle owns the clock
 * (`src/lib/lifecycle.ts`) and hands the same progress to the card, the
 * particles and the ring, which is what stops one Dissolve running on three
 * disagreeing clocks the way it used to.
 *
 * Palettes are shared with `cosmicFx.ts` so the same lifecycle reads as the
 * same event in either view.
 */

export type CanvasEffectKind = 'spawn' | 'dissolve';

export const CANVAS_FX_PARTICLES: Record<CanvasEffectKind, number> = {
  spawn: 36,
  dissolve: 32,
};

export const CANVAS_FX_COLORS: Record<CanvasEffectKind, string[]> = {
  spawn: ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fef08a', '#4ade80'],
  dissolve: ['#f87171', '#fb923c', '#fbbf24', '#c084fc', '#60a5fa', '#ffffff'],
};

/**
 * How much of the lifecycle the card itself takes, leaving the particles to
 * play on after it. The card used to run a 0.45 s CSS animation *beside* a
 * 1.1 s particle sim; it now runs inside the same window.
 */
export const CARD_SPAWN_FRACTION = 0.61;
export const CARD_DISSOLVE_FRACTION = 0.41;

/** Particle travel in SVG user units, relative to the card's own size. */
export const CANVAS_REACH_MIN = 0.55;
export const CANVAS_REACH_MAX = 2.4;

export interface CanvasParticleSeed {
  /** Unit direction from the origin. */
  dx: number;
  dy: number;
  /** Distance travelled at full progress, as a multiple of the card width. */
  reach: number;
  /** Radius in user units at progress 0. */
  size: number;
  /** Fraction of the card the particle starts offset by, for a spread origin. */
  offsetX: number;
  offsetY: number;
}

export interface CanvasParticleFrame {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Rescale a progress into a sub-window of the lifecycle, so a rendering that
 * finishes early still shares the one clock instead of starting its own.
 */
export const subProgress = (progress: number, fraction: number): number =>
  fraction <= 0 ? 1 : clamp01(progress / fraction);

/**
 * Particle seeds on a circle. `random` is injectable so the shapes are
 * testable rather than tuned by eye, matching `seedCosmicParticles`.
 */
export function seedCanvasParticles(
  count: number,
  kind: CanvasEffectKind,
  random: () => number = Math.random
): CanvasParticleSeed[] {
  const seeds: CanvasParticleSeed[] = [];
  for (let i = 0; i < count; i++) {
    // A Spawn radiates evenly outwards — it is a shockwave, and jitter alone
    // leaves visible gaps. A Dissolve is debris, so its directions are free.
    const angle =
      kind === 'spawn'
        ? (i / count) * Math.PI * 2 + (random() - 0.5) * 0.3
        : random() * Math.PI * 2;
    seeds.push({
      dx: Math.cos(angle),
      dy: Math.sin(angle) - (kind === 'dissolve' ? 0.25 : 0), // debris drifts up
      reach: CANVAS_REACH_MIN + random() * (CANVAS_REACH_MAX - CANVAS_REACH_MIN),
      size: (kind === 'spawn' ? 3 : 2.5) + random() * 4,
      offsetX: kind === 'dissolve' ? random() - 0.5 : 0,
      offsetY: kind === 'dissolve' ? random() - 0.5 : 0,
    });
  }
  return seeds;
}

/** Where a seeded particle is, and how visible, at this progress. */
export function canvasParticleAt(
  seed: CanvasParticleSeed,
  progress: number,
  origin: { x: number; y: number; width: number; height: number }
): CanvasParticleFrame {
  const t = clamp01(progress);
  // Ease out: particles are fastest as they leave, which reads as a burst
  // rather than a drift.
  const travel = 1 - (1 - t) * (1 - t);
  const distance = seed.reach * origin.width * travel;
  return {
    x: origin.x + seed.offsetX * origin.width + seed.dx * distance,
    y: origin.y + seed.offsetY * origin.height + seed.dy * distance,
    r: Math.max(0, seed.size * (1 - t * 0.85)),
    opacity: Math.max(0, 1 - t * t),
  };
}

/** The Spawn shockwave ring, as a radius multiplier and an opacity. */
export function spawnRingAt(progress: number): { scale: number; opacity: number } {
  const t = clamp01(progress);
  return { scale: 0.1 + t * 2.6, opacity: Math.max(0, 1 - t * 1.35) };
}

export interface CardFxFrame {
  scale: number;
  translateY: number;
  opacity: number;
  blur: number;
}

/**
 * The Spawn pop, as the `cardSpawnPop` keyframes used to describe it — spring
 * overshoot at 60%, settle by 100%. A function rather than CSS because CSS
 * cannot be handed a progress.
 */
export function cardSpawnAt(progress: number): CardFxFrame {
  const t = subProgress(progress, CARD_SPAWN_FRACTION);
  const scale =
    t < 0.6
      ? lerp(0.2, 1.16, t / 0.6)
      : t < 0.85
      ? lerp(1.16, 0.96, (t - 0.6) / 0.25)
      : lerp(0.96, 1, (t - 0.85) / 0.15);
  return {
    scale,
    translateY: 0,
    opacity: t < 0.6 ? lerp(0, 1, t / 0.6) : 1,
    blur: 0,
  };
}

/** The Dissolve fade, as the `cardDissolve` keyframes used to describe it. */
export function cardDissolveAt(progress: number): CardFxFrame {
  const t = subProgress(progress, CARD_DISSOLVE_FRACTION);
  return t < 0.5
    ? {
        scale: lerp(1, 0.9, t / 0.5),
        translateY: lerp(0, -6, t / 0.5),
        opacity: lerp(1, 0.6, t / 0.5),
        blur: lerp(0, 4, t / 0.5),
      }
    : {
        scale: lerp(0.9, 0.3, (t - 0.5) / 0.5),
        translateY: lerp(-6, -16, (t - 0.5) / 0.5),
        opacity: lerp(0.6, 0, (t - 0.5) / 0.5),
        blur: lerp(4, 12, (t - 0.5) / 0.5),
      };
}

/**
 * The 2D rendering of a Kinship Link Spawn: the path grows from the anchor.
 * Returns the fraction of the path to draw, and the glow on it.
 */
export function linkGrowthAt(progress: number): { drawn: number; glow: number } {
  const t = clamp01(progress);
  const drawn = t < 0.5 ? t / 0.5 : 1;
  return { drawn, glow: Math.max(0, 1 - Math.abs(t - 0.5) * 2) };
}
