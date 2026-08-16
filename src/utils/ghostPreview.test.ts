import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeGhostPreviewOffset,
  ghostPreviewBreath,
  GHOST_PREVIEW_OFFSET,
  GHOST_PREVIEW_SPOUSE_SPREAD,
  GHOST_PREVIEW_BREATH_AMPLITUDE,
  GHOST_PREVIEW_BREATH_PERIOD_MS,
} from './ghostPreview';

const identity = new THREE.Quaternion();

/** A camera rolled 90° about its view axis: screen-up becomes world -X. */
const rolled90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

function expectClose(v: THREE.Vector3, x: number, y: number, z: number) {
  expect(v.x).toBeCloseTo(x, 5);
  expect(v.y).toBeCloseTo(y, 5);
  expect(v.z).toBeCloseTo(z, 5);
}

describe('computeGhostPreviewOffset', () => {
  it('displaces a parent up the screen', () => {
    expectClose(computeGhostPreviewOffset(identity, 'parent'), 0, GHOST_PREVIEW_OFFSET, 0);
  });

  it('displaces a child down the screen', () => {
    expectClose(computeGhostPreviewOffset(identity, 'child'), 0, -GHOST_PREVIEW_OFFSET, 0);
  });

  it('displaces a spouse sideways, spread wider than the vertical offset', () => {
    expectClose(
      computeGhostPreviewOffset(identity, 'spouse'),
      GHOST_PREVIEW_OFFSET * GHOST_PREVIEW_SPOUSE_SPREAD,
      0,
      0
    );
    expect(GHOST_PREVIEW_SPOUSE_SPREAD).toBeGreaterThan(1);
  });

  it('resolves direction against the camera, not the world axes', () => {
    expectClose(computeGhostPreviewOffset(rolled90, 'parent'), -GHOST_PREVIEW_OFFSET, 0, 0);
  });

  it('keeps parent and child exactly opposite whatever the camera does', () => {
    const parent = computeGhostPreviewOffset(rolled90, 'parent');
    const child = computeGhostPreviewOffset(rolled90, 'child');
    expectClose(parent.clone().add(child), 0, 0, 0);
  });

  it('always displaces, so the preview is never buried inside its anchor', () => {
    for (const relation of ['parent', 'child', 'spouse'] as const) {
      expect(computeGhostPreviewOffset(identity, relation).length()).toBeGreaterThan(
        GHOST_PREVIEW_OFFSET * 0.9
      );
    }
  });

  it('returns a fresh vector each call, so a held offset cannot be mutated by a later one', () => {
    const first = computeGhostPreviewOffset(identity, 'parent');
    const second = computeGhostPreviewOffset(identity, 'parent');
    expect(first).not.toBe(second);
    second.set(0, 0, 0);
    expectClose(first, 0, GHOST_PREVIEW_OFFSET, 0);
  });
});

describe('ghostPreviewBreath', () => {
  it('starts at rest so the marker does not pop in mid-breath', () => {
    expect(ghostPreviewBreath(0)).toBeCloseTo(1, 5);
  });

  it('stays within the amplitude bounds', () => {
    for (let ms = 0; ms <= GHOST_PREVIEW_BREATH_PERIOD_MS * 2; ms += 37) {
      const scale = ghostPreviewBreath(ms);
      expect(scale).toBeGreaterThanOrEqual(1 - GHOST_PREVIEW_BREATH_AMPLITUDE - 1e-9);
      expect(scale).toBeLessThanOrEqual(1 + GHOST_PREVIEW_BREATH_AMPLITUDE + 1e-9);
    }
  });

  it('is periodic in wall-clock time, not frame count', () => {
    expect(ghostPreviewBreath(GHOST_PREVIEW_BREATH_PERIOD_MS)).toBeCloseTo(ghostPreviewBreath(0), 5);
    expect(ghostPreviewBreath(GHOST_PREVIEW_BREATH_PERIOD_MS / 4)).toBeCloseTo(
      1 + GHOST_PREVIEW_BREATH_AMPLITUDE,
      5
    );
  });
});
