/**
 * Cosmic FX: the 3D renderings of the Spawn and Dissolve lifecycles (LIN-51,
 * ADR 0002).
 *
 * Supernova and black-hole collapse are *renderings*, not lifecycles — same
 * triggers, same optimistic-update and rollback semantics as the 2D
 * `SpawnBurst` / `ParticleDissolve`. Those are SVG `<g>` particle systems with
 * nothing portable in them, so this is the shared maths for a rewrite rather
 * than a port.
 *
 * Deliberately free of three.js types. Hosts own the meshes; everything here is
 * numbers, which is what makes the performance budget below testable rather
 * than tuned by eye.
 */

export type CosmicEffectKind = 'supernova' | 'collapse';

/**
 * The performance budget, stated as code because the scene is already loaded:
 * a starfield, nebulae, planet textures, auras and glow spheres are all drawn
 * before any of this. ≤1 concurrent hand-written effect, ≤200 particles, and
 * nothing hand-written at all on mobile — alongside the geometry and material
 * reductions `FamilyTree3D` already makes there.
 */
export const COSMIC_FX_MAX_PARTICLES = 200;
export const COSMIC_FX_MAX_CONCURRENT = 1;

export const COSMIC_FX_PARTICLES: Record<CosmicEffectKind, number> = {
  supernova: 160,
  collapse: 140,
};

export const COSMIC_FX_DURATION_MS: Record<CosmicEffectKind, number> = {
  supernova: 1400,
  collapse: 1100,
};

/** How far particles travel, in world units. A node sphere has radius 10. */
export const COSMIC_REACH_MIN = 26;
export const COSMIC_REACH_MAX = 62;

/** Radians a collapse particle spins about the world Y axis over its life. */
export const COLLAPSE_MAX_SWIRL = Math.PI * 1.6;

/**
 * Palettes carried over from the 2D `SpawnBurst` / `ParticleDissolve`, so the
 * same lifecycle reads as the same event in either view.
 */
export const COSMIC_FX_COLORS: Record<CosmicEffectKind, string[]> = {
  supernova: ['#fef08a', '#ffffff', '#38bdf8', '#818cf8', '#c084fc', '#4ade80'],
  collapse: ['#f87171', '#fb923c', '#fbbf24', '#c084fc', '#60a5fa', '#ffffff'],
};

/** Point size in world units, before distance attenuation. */
export const COSMIC_FX_PARTICLE_SIZE = 3.4;

export interface CosmicParticleSeed {
  /** Unit direction from the node centre; reach alone sets the distance. */
  dx: number;
  dy: number;
  dz: number;
  /** Distance from the centre at full expansion, in world units. */
  reach: number;
  /** Radians of spin about the world Y axis; ignored by the supernova. */
  swirl: number;
}

export interface CosmicFxBudget {
  allowed: boolean;
  particleCount: number;
}

/**
 * Whether an effect may play at all, and with how many particles.
 *
 * A refusal is a normal outcome, not a failure: polish was split into its own
 * milestone precisely so it can be dropped without holding the functional work
 * hostage, and this is where that drop happens.
 */
export function resolveCosmicFxBudget(params: {
  requested: number;
  isMobileDevice: boolean;
  /** Hand-written effects already playing in the scene. */
  activeEffects: number;
}): CosmicFxBudget {
  const { requested, isMobileDevice, activeEffects } = params;
  const refused: CosmicFxBudget = { allowed: false, particleCount: 0 };

  if (requested <= 0) return refused;
  if (isMobileDevice) return refused;
  if (activeEffects >= COSMIC_FX_MAX_CONCURRENT) return refused;

  return { allowed: true, particleCount: Math.min(requested, COSMIC_FX_MAX_PARTICLES) };
}

/**
 * Particle seeds scattered over a sphere.
 *
 * Directions come from the inverse-CDF construction (uniform in cos φ) rather
 * than from three uniform components: the naive version bunches particles at
 * the poles, which reads as a cross rather than a blast.
 */
export function seedCosmicParticles(
  count: number,
  random: () => number = Math.random
): CosmicParticleSeed[] {
  const seeds: CosmicParticleSeed[] = [];
  for (let i = 0; i < count; i++) {
    const cosPhi = random() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = random() * Math.PI * 2;
    seeds.push({
      dx: sinPhi * Math.cos(theta),
      dy: cosPhi,
      dz: sinPhi * Math.sin(theta),
      reach: COSMIC_REACH_MIN + random() * (COSMIC_REACH_MAX - COSMIC_REACH_MIN),
      swirl: random() * COLLAPSE_MAX_SWIRL,
    });
  }
  return seeds;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Distance from the node centre at normalised time `t`. */
function cosmicRadius(kind: CosmicEffectKind, seed: CosmicParticleSeed, t: number): number {
  const clamped = clamp01(t);
  if (kind === 'supernova') {
    // Ease-out cubic: nearly all the distance is covered in the first half, so
    // the burst throws rather than drifts.
    const inv = 1 - clamped;
    return seed.reach * (1 - inv * inv * inv);
  }
  // Ease-in cubic, inverted: barely moves at first, then falls in all at once.
  return seed.reach * (1 - clamped * clamped * clamped);
}

/**
 * Where a particle sits relative to the node centre, in world units.
 *
 * The collapse spins about the world Y axis on the way in. A straight radial
 * implosion reads as a vacuum cleaner; the spiral is what makes it a black
 * hole. The supernova ignores `swirl` — an exploding star throws debris out
 * along straight lines.
 */
export function cosmicParticleOffset(
  kind: CosmicEffectKind,
  seed: CosmicParticleSeed,
  t: number
): { x: number; y: number; z: number } {
  const radius = cosmicRadius(kind, seed, t);

  if (kind === 'supernova') {
    return { x: seed.dx * radius, y: seed.dy * radius, z: seed.dz * radius };
  }

  // Accelerating spin, so the swirl tightens as the particle is pulled under.
  const clamped = clamp01(t);
  const angle = seed.swirl * clamped * clamped;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: (seed.dx * cos + seed.dz * sin) * radius,
    y: seed.dy * radius,
    z: (-seed.dx * sin + seed.dz * cos) * radius,
  };
}

/**
 * Brightness at normalised time `t`.
 *
 * The two curves are deliberately different. A supernova is spending itself as
 * it expands, so it dims the whole way out. A collapse converges on a point —
 * dimming it on the way in would read as a fade-out rather than as something
 * being swallowed — so it holds full brightness and is extinguished at the end.
 */
export const COLLAPSE_EXTINGUISH_FROM = 0.85;

export function cosmicParticleOpacity(kind: CosmicEffectKind, t: number): number {
  const clamped = clamp01(t);
  if (kind === 'supernova') {
    const inv = 1 - clamped;
    return inv * Math.sqrt(inv);
  }
  if (clamped < COLLAPSE_EXTINGUISH_FROM) return 1;
  return (1 - clamped) / (1 - COLLAPSE_EXTINGUISH_FROM);
}

/**
 * The supernova's shock shell, in node-sphere radii.
 *
 * It rides the same ease-out as the particles but arrives ahead of them, so the
 * burst reads as a detonation with a front rather than as a cloud drifting
 * apart. Its opacity is the particles' own, so the two die together.
 */
export const SUPERNOVA_SHELL_MAX_SCALE = 4.5;

export function supernovaShellScale(t: number): number {
  const inv = 1 - clamp01(t);
  return SUPERNOVA_SHELL_MAX_SCALE * (1 - inv * inv * inv);
}

/**
 * Scale of the dark core a collapse falls into: nothing, swelling as the
 * particles arrive, gone with them. It is the one thing that says "black hole"
 * rather than "particles moving inwards", and costs a single small mesh.
 */
export function collapseCoreScale(t: number): number {
  return Math.sin(Math.PI * clamp01(t));
}

/**
 * A Kinship Link identified by its two ends, direction-free.
 *
 * The graph mutates `link.source` / `link.target` from ids into node objects
 * once the simulation runs, and Connect Mode may flip which end is the parent,
 * so matching on ordered endpoints would miss half the time.
 */
export interface LinkEndpoints {
  aId: string;
  bId: string;
}

/**
 * Link growth is rendered with the graph's built-in `linkDirectionalParticles`
 * rather than a hand-written effect: it is already integrated, costs nothing to
 * maintain, and does not spend any of the budget above.
 */
/** How long a newly grown link keeps its beads, matching the Spawn window. */
export const BEAM_PULSE_WINDOW_MS = 3500;

export const BEAM_PULSE_PARTICLES = 6;
export const BEAM_PULSE_PARTICLES_MOBILE = 3;
export const BEAM_PULSE_SPEED = 0.012;
export const BEAM_PULSE_WIDTH = 2.5;
export const BEAM_PULSE_COLOR = '#a5f3fc';

export function isPulsingLink(
  endpoints: LinkEndpoints,
  pulsing: LinkEndpoints | null
): boolean {
  if (!pulsing) return false;
  return (
    (endpoints.aId === pulsing.aId && endpoints.bId === pulsing.bId) ||
    (endpoints.aId === pulsing.bId && endpoints.bId === pulsing.aId)
  );
}

export function beamPulseParticleCount(params: {
  endpoints: LinkEndpoints;
  pulsing: LinkEndpoints | null;
  isMobileDevice: boolean;
}): number {
  if (!isPulsingLink(params.endpoints, params.pulsing)) return 0;
  return params.isMobileDevice ? BEAM_PULSE_PARTICLES_MOBILE : BEAM_PULSE_PARTICLES;
}

/**
 * Delete confirmation: the node's aura and glow pulse red.
 *
 * Not a shake. A mesh jittering under a live camera — which never stops moving
 * in this scene — reads as a rendering glitch rather than as a question being
 * asked. The geometry is already there (`geometries.aura`, `geometries.glow`),
 * so this only recolours and modulates it, and is paired with a DOM confirm
 * pill in the overlay that carries the actual ✓ / ✕ hit targets.
 *
 * Expressed per millisecond: a per-frame counter would beat at whatever rate
 * the display happens to run at.
 */
export const CONFIRM_PULSE_PERIOD_MS = 900;
export const CONFIRM_PULSE_MIN_OPACITY = 0.25;
export const CONFIRM_PULSE_MAX_OPACITY = 1;
/** Shared by the in-scene aura and the DOM confirm pill, so they read as one
 *  question rather than two unrelated red things. */
export const CONFIRM_PULSE_COLOR = '#ef4444';

export function confirmPulseOpacity(elapsedMs: number, baseOpacity: number): number {
  const phase = (elapsedMs / CONFIRM_PULSE_PERIOD_MS) * Math.PI * 2;
  const unit = (Math.sin(phase) + 1) / 2;
  return (
    baseOpacity *
    (CONFIRM_PULSE_MIN_OPACITY + (CONFIRM_PULSE_MAX_OPACITY - CONFIRM_PULSE_MIN_OPACITY) * unit)
  );
}
