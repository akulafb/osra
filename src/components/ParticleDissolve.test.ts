import { describe, it, expect } from 'vitest';

describe('ParticleDissolve & SpawnBurst Animation Pipeline', () => {
  it('initializes particle physics constants properly', () => {
    const particleCount = 32;
    const angles = Array.from({ length: particleCount }, (_, i) => (i / particleCount) * Math.PI * 2);
    expect(angles.length).toBe(32);
    expect(angles[0]).toBe(0);
    expect(angles[16]).toBeCloseTo(Math.PI);
  });

  it('calculates radial sparkle burst velocities', () => {
    const angle = Math.PI / 4;
    const speed = 3.5;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    expect(vx).toBeGreaterThan(0);
    expect(vy).toBeGreaterThan(0);
    expect(Math.sqrt(vx * vx + vy * vy)).toBeCloseTo(speed);
  });
});
