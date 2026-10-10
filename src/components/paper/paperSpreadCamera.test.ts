import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { paperCameraLimits } from '../../lib/paperCamera';
import type { PaperSpread, Spread } from '../../lib/paperSpread';
import { followSpread, limitCamera } from './paperSpreadCamera';
import { PAPER_CAMERA_FOLLOW_FRAME_PRIORITY, PAPER_CAMERA_LIMITS_FRAME_PRIORITY, PAPER_SPREAD_FRAME_PRIORITY } from './paperScene';

const DREI_CONTROLS_FRAME_PRIORITY = -1;

const FOV = 50;
const ASPECT = 1.6;
const still = { center: { x: 0, y: 0, z: 0 }, radius: 500 };
const person = { x: 475, y: 0, z: 0 };
const spreadOf = (factor: number): PaperSpread => ({ centre: still.center, factor: factor as Spread });
const drawnAt = (factor: number) => new THREE.Vector3(person.x * factor, person.y * factor, person.z * factor);

beforeAll(() => {
  // camera-controls reads DOMRect when it is made; the node test env has none.
  globalThis.DOMRect ??= class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  } as unknown as typeof DOMRect;
  CameraControlsImpl.install({ THREE });
});

function controlsAt(factor: number, target: THREE.Vector3) {
  const controls = new CameraControlsImpl(new THREE.PerspectiveCamera(FOV, ASPECT, 1, 1e6));
  limitCamera(controls, paperCameraLimits(still, FOV, ASPECT, spreadOf(factor)), false);
  void controls.setLookAt(target.x, target.y, target.z + 400, target.x, target.y, target.z, false);
  controls.update(0);
  return controls;
}

function changeSpreadInRigOrder(controls: CameraControlsImpl, from: number, to: number, selected: boolean) {
  if (selected) followSpread(controls, person, spreadOf(from), spreadOf(to));
  limitCamera(controls, paperCameraLimits(still, FOV, ASPECT, spreadOf(to)), true);
  for (let i = 0; i < 300; i++) controls.update(1 / 60);
  return controls.getTarget(new THREE.Vector3(), false);
}

describe('followSpread then limitCamera', () => {
  it('runs the follow after the Spread reaches the scene and before the limits, all ahead of the camera update', () => {
    expect(PAPER_SPREAD_FRAME_PRIORITY).toBeLessThan(PAPER_CAMERA_FOLLOW_FRAME_PRIORITY);
    expect(PAPER_CAMERA_FOLLOW_FRAME_PRIORITY).toBeLessThan(PAPER_CAMERA_LIMITS_FRAME_PRIORITY);
    expect(PAPER_CAMERA_LIMITS_FRAME_PRIORITY).toBeLessThan(DREI_CONTROLS_FRAME_PRIORITY);
  });

  it('keeps a focused Person put on screen through a jump from 3x to 1x', () => {
    const controls = controlsAt(3, drawnAt(3));
    expect(changeSpreadInRigOrder(controls, 3, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 2.5x to 1x', () => {
    const controls = controlsAt(2.5, drawnAt(2.5));
    expect(changeSpreadInRigOrder(controls, 2.5, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 1x to 3x, past the 1x box', () => {
    const controls = controlsAt(1, drawnAt(1));
    expect(changeSpreadInRigOrder(controls, 1, 3, true).toArray()).toEqual(drawnAt(3).toArray());
  });

  it('keeps the camera still with nobody selected when the Spread drops and the orbit point sits outside the smaller box', () => {
    const target = new THREE.Vector3(2800, 0, 0);
    const controls = controlsAt(3, target);
    expect(changeSpreadInRigOrder(controls, 3, 1, false).toArray()).toEqual(target.toArray());
  });

  it('keeps a focused Person put when the Spread changes during a flight', () => {
    const controls = controlsAt(3, new THREE.Vector3(0, 0, 0));
    void controls.moveTo(...drawnAt(3).toArray(), true);
    controls.update(1 / 60);
    expect(changeSpreadInRigOrder(controls, 3, 1, true).distanceTo(drawnAt(1))).toBeLessThan(0.01);
  });
});

describe('limitCamera', () => {
  it('sets the zoom limits before anything frames the tree, so a small tree loads at the closest distance', () => {
    const controls = new CameraControlsImpl(new THREE.PerspectiveCamera(FOV, ASPECT, 1, 1e6));
    const small = { center: { x: 0, y: 0, z: 0 }, radius: 8 };
    const limits = paperCameraLimits(small, FOV, ASPECT, spreadOf(1));
    limitCamera(controls, limits, false);
    void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(), small.radius), false);
    controls.update(0);
    expect(controls.distance).toBe(limits.minDistance);
  });
});
