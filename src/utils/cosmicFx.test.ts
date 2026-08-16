import { describe, it, expect } from 'vitest';
import {
  resolveCosmicFxBudget,
  seedCosmicParticles,
  cosmicParticleOffset,
  cosmicParticleOpacity,
  collapseCoreScale,
  beamPulseParticleCount,
  isPulsingLink,
  confirmPulseOpacity,
  COSMIC_FX_MAX_PARTICLES,
  COSMIC_FX_MAX_CONCURRENT,
  COSMIC_FX_PARTICLES,
  COSMIC_FX_DURATION_MS,
  COSMIC_REACH_MIN,
  COSMIC_REACH_MAX,
  supernovaShellScale,
  SUPERNOVA_SHELL_MAX_SCALE,
  BEAM_PULSE_PARTICLES,
  BEAM_PULSE_PARTICLES_MOBILE,
  CONFIRM_PULSE_MIN_OPACITY,
  CONFIRM_PULSE_MAX_OPACITY,
  CONFIRM_PULSE_PERIOD_MS,
  type CosmicEffectKind,
  type CosmicParticleSeed,
} from './cosmicFx';

const KINDS: CosmicEffectKind[] = ['supernova', 'collapse'];

/** A deterministic stand-in for Math.random, cycling a fixed sequence. */
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

const seed: CosmicParticleSeed = { dx: 0, dy: 0, dz: 1, reach: 40, swirl: Math.PI };

describe('resolveCosmicFxBudget', () => {
  it('allows a normal effect on desktop with nothing else playing', () => {
    expect(resolveCosmicFxBudget({ requested: 160, isMobileDevice: false, activeEffects: 0 })).toEqual({
      allowed: true,
      particleCount: 160,
    });
  });

  it('refuses every hand-written effect on mobile', () => {
    expect(resolveCosmicFxBudget({ requested: 160, isMobileDevice: true, activeEffects: 0 })).toEqual({
      allowed: false,
      particleCount: 0,
    });
  });

  it('refuses a second concurrent effect', () => {
    expect(
      resolveCosmicFxBudget({
        requested: 160,
        isMobileDevice: false,
        activeEffects: COSMIC_FX_MAX_CONCURRENT,
      })
    ).toEqual({ allowed: false, particleCount: 0 });
  });

  it('caps the particle count rather than refusing an over-large request', () => {
    const budget = resolveCosmicFxBudget({
      requested: COSMIC_FX_MAX_PARTICLES * 10,
      isMobileDevice: false,
      activeEffects: 0,
    });
    expect(budget.allowed).toBe(true);
    expect(budget.particleCount).toBe(COSMIC_FX_MAX_PARTICLES);
  });

  it('refuses an empty request instead of adding an invisible effect to the scene', () => {
    expect(resolveCosmicFxBudget({ requested: 0, isMobileDevice: false, activeEffects: 0 })).toEqual({
      allowed: false,
      particleCount: 0,
    });
  });

  it('holds every shipped effect inside the budget without needing the cap', () => {
    expect(COSMIC_FX_MAX_CONCURRENT).toBe(1);
    for (const kind of KINDS) {
      expect(COSMIC_FX_PARTICLES[kind]).toBeGreaterThan(0);
      expect(COSMIC_FX_PARTICLES[kind]).toBeLessThanOrEqual(COSMIC_FX_MAX_PARTICLES);
    }
  });
});

describe('seedCosmicParticles', () => {
  it('produces exactly the requested number of particles', () => {
    expect(seedCosmicParticles(0, Math.random)).toEqual([]);
    expect(seedCosmicParticles(37, Math.random)).toHaveLength(37);
  });

  it('gives every particle a unit direction, so reach alone sets the distance', () => {
    for (const s of seedCosmicParticles(64, Math.random)) {
      expect(magnitude({ x: s.dx, y: s.dy, z: s.dz })).toBeCloseTo(1, 5);
    }
  });

  it('keeps reach inside the tuned band', () => {
    for (const s of seedCosmicParticles(64, Math.random)) {
      expect(s.reach).toBeGreaterThanOrEqual(COSMIC_REACH_MIN);
      expect(s.reach).toBeLessThanOrEqual(COSMIC_REACH_MAX);
    }
  });

  it('scatters over the whole sphere rather than a single plane', () => {
    const particles = seedCosmicParticles(200, Math.random);
    expect(particles.some((s) => s.dy > 0.5)).toBe(true);
    expect(particles.some((s) => s.dy < -0.5)).toBe(true);
    expect(particles.some((s) => s.dx > 0.5)).toBe(true);
    expect(particles.some((s) => s.dx < -0.5)).toBe(true);
  });

  it('is a pure function of the supplied randomness', () => {
    const values = [0.1, 0.37, 0.62, 0.88, 0.24, 0.5];
    expect(seedCosmicParticles(8, sequenceRandom(values))).toEqual(
      seedCosmicParticles(8, sequenceRandom(values))
    );
  });
});

describe('cosmicParticleOffset', () => {
  it('starts a supernova at the node centre and ends it at full reach', () => {
    expect(magnitude(cosmicParticleOffset('supernova', seed, 0))).toBeCloseTo(0, 5);
    expect(magnitude(cosmicParticleOffset('supernova', seed, 1))).toBeCloseTo(seed.reach, 5);
  });

  it('bursts a supernova outwards fastest at the start', () => {
    const early = magnitude(cosmicParticleOffset('supernova', seed, 0.25));
    const late = magnitude(cosmicParticleOffset('supernova', seed, 0.75));
    // Past halfway the particles are coasting, so most of the distance is
    // already behind them — that head start is what reads as an explosion.
    expect(early).toBeGreaterThan(seed.reach * 0.5);
    expect(late).toBeGreaterThan(early);
  });

  it('starts a collapse at full reach and swallows it at the centre', () => {
    expect(magnitude(cosmicParticleOffset('collapse', seed, 0))).toBeCloseTo(seed.reach, 5);
    expect(magnitude(cosmicParticleOffset('collapse', seed, 1))).toBeCloseTo(0, 5);
  });

  it('draws a collapse in slowly, then snaps it shut', () => {
    const half = magnitude(cosmicParticleOffset('collapse', seed, 0.5));
    // Halfway through, most of the distance is still to fall — the acceleration
    // is what separates a black hole from a fade-out.
    expect(half).toBeGreaterThan(seed.reach * 0.5);
  });

  it('moves monotonically towards its destination for both kinds', () => {
    for (const kind of KINDS) {
      const radii = Array.from({ length: 21 }, (_, i) =>
        magnitude(cosmicParticleOffset(kind, seed, i / 20))
      );
      for (let i = 1; i < radii.length; i++) {
        if (kind === 'supernova') expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1]);
        else expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
      }
    }
  });

  it('spirals a collapse without changing how far it has fallen', () => {
    const spun: CosmicParticleSeed = { dx: 1, dy: 0, dz: 0, reach: 40, swirl: Math.PI };
    const straight: CosmicParticleSeed = { ...spun, swirl: 0 };
    const t = 0.6;
    expect(magnitude(cosmicParticleOffset('collapse', spun, t))).toBeCloseTo(
      magnitude(cosmicParticleOffset('collapse', straight, t)),
      5
    );
    expect(cosmicParticleOffset('collapse', spun, t).z).not.toBeCloseTo(
      cosmicParticleOffset('collapse', straight, t).z,
      5
    );
  });

  it('leaves a supernova travelling straight out from its anchor', () => {
    const offset = cosmicParticleOffset('supernova', { ...seed, swirl: Math.PI }, 0.5);
    expect(offset.x).toBeCloseTo(0, 5);
    expect(offset.y).toBeCloseTo(0, 5);
    expect(offset.z).toBeGreaterThan(0);
  });
});

describe('cosmicParticleOpacity', () => {
  it('starts every effect fully lit and ends it invisible', () => {
    for (const kind of KINDS) {
      expect(cosmicParticleOpacity(kind, 0)).toBeCloseTo(1, 5);
      expect(cosmicParticleOpacity(kind, 1)).toBeCloseTo(0, 5);
    }
  });

  it('never brightens partway through', () => {
    for (const kind of KINDS) {
      let prev = Infinity;
      for (let i = 0; i <= 20; i++) {
        const value = cosmicParticleOpacity(kind, i / 20);
        expect(value).toBeLessThanOrEqual(prev + 1e-9);
        expect(value).toBeGreaterThanOrEqual(0);
        prev = value;
      }
    }
  });

  it('keeps a collapse burning until it is swallowed, unlike a fading supernova', () => {
    // The particles converge on a point; dimming them on the way in would read
    // as a fade-out rather than as something being pulled under.
    expect(cosmicParticleOpacity('collapse', 0.7)).toBeCloseTo(1, 5);
    expect(cosmicParticleOpacity('supernova', 0.7)).toBeLessThan(0.5);
  });

  it('clamps outside the effect window so a late frame cannot revive it', () => {
    for (const kind of KINDS) {
      expect(cosmicParticleOpacity(kind, 1.5)).toBe(0);
      expect(cosmicParticleOpacity(kind, -0.5)).toBeCloseTo(1, 5);
    }
  });

  it('gives each effect a duration short enough to stay out of the way', () => {
    for (const kind of KINDS) {
      expect(COSMIC_FX_DURATION_MS[kind]).toBeGreaterThan(0);
      expect(COSMIC_FX_DURATION_MS[kind]).toBeLessThanOrEqual(2000);
    }
  });
});

describe('collapseCoreScale', () => {
  it('is nothing at both ends, so the core never outlives the effect', () => {
    expect(collapseCoreScale(0)).toBeCloseTo(0, 5);
    expect(collapseCoreScale(1)).toBeCloseTo(0, 5);
  });

  it('peaks while the particles are still falling in', () => {
    expect(collapseCoreScale(0.5)).toBeGreaterThan(collapseCoreScale(0.1));
    expect(collapseCoreScale(0.5)).toBeGreaterThan(collapseCoreScale(0.9));
  });

  it('never goes negative, which would invert the mesh', () => {
    for (let i = -2; i <= 22; i++) expect(collapseCoreScale(i / 20)).toBeGreaterThanOrEqual(0);
  });
});

describe('supernovaShellScale', () => {
  it('starts inside the node and expands past it', () => {
    expect(supernovaShellScale(0)).toBeCloseTo(0, 5);
    expect(supernovaShellScale(1)).toBeCloseTo(SUPERNOVA_SHELL_MAX_SCALE, 5);
    expect(SUPERNOVA_SHELL_MAX_SCALE).toBeGreaterThan(1);
  });

  it('never contracts, so the shock front only ever moves outwards', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const value = supernovaShellScale(i / 20);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it('leads the particles out, arriving before they do', () => {
    expect(supernovaShellScale(0.25) / SUPERNOVA_SHELL_MAX_SCALE).toBeGreaterThan(0.5);
  });
});

describe('isPulsingLink', () => {
  const pulsing = { aId: 'x', bId: 'y' };

  it('matches the pulsing pair in either direction', () => {
    expect(isPulsingLink({ aId: 'x', bId: 'y' }, pulsing)).toBe(true);
    expect(isPulsingLink({ aId: 'y', bId: 'x' }, pulsing)).toBe(true);
  });

  it('leaves every other link alone', () => {
    expect(isPulsingLink({ aId: 'x', bId: 'z' }, pulsing)).toBe(false);
    expect(isPulsingLink({ aId: 'x', bId: 'y' }, null)).toBe(false);
  });
});

describe('beamPulseParticleCount', () => {
  const pulsing = { aId: 'x', bId: 'y' };

  it('runs beads down the link that was just created', () => {
    expect(
      beamPulseParticleCount({ endpoints: { aId: 'x', bId: 'y' }, pulsing, isMobileDevice: false })
    ).toBe(BEAM_PULSE_PARTICLES);
  });

  it('leaves every other link unlit, so the whole tree does not shimmer', () => {
    expect(
      beamPulseParticleCount({ endpoints: { aId: 'p', bId: 'q' }, pulsing, isMobileDevice: false })
    ).toBe(0);
    expect(
      beamPulseParticleCount({ endpoints: { aId: 'x', bId: 'y' }, pulsing: null, isMobileDevice: false })
    ).toBe(0);
  });

  it('thins the beam on mobile but does not cut it, since the graph draws it for free', () => {
    expect(
      beamPulseParticleCount({ endpoints: { aId: 'x', bId: 'y' }, pulsing, isMobileDevice: true })
    ).toBe(BEAM_PULSE_PARTICLES_MOBILE);
    expect(BEAM_PULSE_PARTICLES_MOBILE).toBeGreaterThan(0);
    expect(BEAM_PULSE_PARTICLES_MOBILE).toBeLessThan(BEAM_PULSE_PARTICLES);
  });
});

describe('confirmPulseOpacity', () => {
  it('stays inside the tuned band, so the aura never blinks out or goes solid', () => {
    for (let ms = 0; ms <= CONFIRM_PULSE_PERIOD_MS * 2; ms += 37) {
      const value = confirmPulseOpacity(ms, 1);
      expect(value).toBeGreaterThanOrEqual(CONFIRM_PULSE_MIN_OPACITY - 1e-9);
      expect(value).toBeLessThanOrEqual(CONFIRM_PULSE_MAX_OPACITY + 1e-9);
    }
  });

  it('repeats every period, so the pulse reads as a steady heartbeat', () => {
    for (const ms of [0, 120, 640]) {
      expect(confirmPulseOpacity(ms, 1)).toBeCloseTo(
        confirmPulseOpacity(ms + CONFIRM_PULSE_PERIOD_MS, 1),
        5
      );
    }
  });

  it('scales with the base opacity it is given', () => {
    expect(confirmPulseOpacity(400, 0.5)).toBeCloseTo(confirmPulseOpacity(400, 1) * 0.5, 5);
  });

  it('is expressed in milliseconds, not frames, so it beats at the same rate on any display', () => {
    const quarter = confirmPulseOpacity(CONFIRM_PULSE_PERIOD_MS / 4, 1);
    expect(quarter).toBeCloseTo(CONFIRM_PULSE_MAX_OPACITY, 5);
  });
});
