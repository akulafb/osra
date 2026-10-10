import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { paperCameraLimits } from '../../lib/paperCamera';
import type { PaperSpread, Spread } from '../../lib/paperSpread';
import { stepSpreadCamera } from './paperSpreadCamera';
import { PAPER_CAMERA_SPREAD_FRAME_PRIORITY, PAPER_SPREAD_FRAME_PRIORITY } from './paperScene';

const DREI_CONTROLS_FRAME_PRIORITY = -1;

const FOV = 50;
const ASPECT = 1.6;
const still = { center: { x: 0, y: 0, z: 0 }, radius: 500 };
const person = { x: 475, y: 0, z: 0 };
const spreadOf = (factor: number): PaperSpread => ({ centre: still.center, factor: factor as Spread });
const drawnAt = (factor: number) => new THREE.Vector3(person.x * factor, person.y * factor, person.z * factor);
const limitsAt = (factor: number) => paperCameraLimits(still, FOV, ASPECT, spreadOf(factor));
const boxCorner = (factor: number) => {
  const { max } = limitsAt(factor).boundary;
  return new THREE.Vector3(max.x, max.y, max.z);
};
const boxFace = (factor: number) => new THREE.Vector3(limitsAt(factor).boundary.max.x, 0, 0);

beforeAll(() => {
  // camera-controls reads DOMRect when it is made; the node test env has none.
  globalThis.DOMRect ??= class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  } as unknown as typeof DOMRect;
  CameraControlsImpl.install({ THREE });
});

function controlsAt(factor: number, target: THREE.Vector3, from = new THREE.Vector3(0, 0, 1)) {
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 1, 1e7);
  const controls = new CameraControlsImpl(camera);
  stepSpreadCamera(controls, limitsAt(factor), null, null);
  const position = from.clone().normalize().multiplyScalar(400).add(target);
  void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false);
  controls.update(0);
  return { controls, camera };
}

function settle(controls: CameraControlsImpl) {
  for (let i = 0; i < 300; i++) controls.update(1 / 60);
  return controls.getTarget(new THREE.Vector3(), false);
}

function changeSpread(controls: CameraControlsImpl, from: number, to: number, selected: boolean) {
  const follow = selected ? { place: person, from: spreadOf(from), to: spreadOf(to) } : null;
  stepSpreadCamera(controls, limitsAt(to), follow, null);
  return settle(controls);
}

function treeCentreOnScreenZoomedOut(controls: CameraControlsImpl, camera: THREE.PerspectiveCamera) {
  void controls.dollyTo(1e9, false);
  controls.update(0);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(still.center.x, still.center.y, still.center.z).project(camera);
  return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) < 1;
}

describe('stepSpreadCamera', () => {
  it('runs after the Spread reaches the scene and ahead of the camera update', () => {
    expect(PAPER_SPREAD_FRAME_PRIORITY).toBeLessThan(PAPER_CAMERA_SPREAD_FRAME_PRIORITY);
    expect(PAPER_CAMERA_SPREAD_FRAME_PRIORITY).toBeLessThan(DREI_CONTROLS_FRAME_PRIORITY);
  });

  it('keeps a focused Person put on screen through a jump from 3x to 1x', () => {
    const { controls } = controlsAt(3, drawnAt(3));
    expect(changeSpread(controls, 3, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 2.5x to 1x', () => {
    const { controls } = controlsAt(2.5, drawnAt(2.5));
    expect(changeSpread(controls, 2.5, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 1x to 3x, past the 1x box', () => {
    const { controls } = controlsAt(1, drawnAt(1));
    expect(changeSpread(controls, 1, 3, true).toArray()).toEqual(drawnAt(3).toArray());
  });

  it('keeps the camera still with nobody selected when the Spread drops and the orbit point sits outside the smaller box', () => {
    const target = boxFace(3).multiplyScalar(0.9);
    const { controls } = controlsAt(3, target);
    expect(changeSpread(controls, 3, 1, false).toArray()).toEqual(target.toArray());
  });

  it('keeps a focused Person put when the Spread changes during a flight', () => {
    const { controls } = controlsAt(3, new THREE.Vector3(0, 0, 0));
    void controls.moveTo(...drawnAt(3).toArray(), true);
    controls.update(1 / 60);
    expect(changeSpread(controls, 3, 1, true).distanceTo(drawnAt(1))).toBeLessThan(0.01);
  });

  it('keeps the camera still with nobody selected when the Spread drops from the 3x box corner, and a full zoom-out still brings the tree back', () => {
    const corner = boxCorner(3);
    for (const from of [[0, 0, 1], [0, 1, 0], [1, 1, 1], [-1, -1, -1], [1, -1, 0], [1, -2, 1]]) {
      const { controls, camera } = controlsAt(3, corner, new THREE.Vector3(...from));
      expect(changeSpread(controls, 3, 1, false).toArray(), `${from}`).toEqual(corner.toArray());
      expect(treeCentreOnScreenZoomedOut(controls, camera), `${from}`).toBe(true);
    }
  });

  it('brings the tree back on a full zoom-out after a drop from the 3x box face', () => {
    const face = boxFace(3);
    for (const from of [[0, 0, 1], [0, 1, 0]]) {
      const { controls, camera } = controlsAt(3, face, new THREE.Vector3(...from));
      changeSpread(controls, 3, 1, false);
      expect(treeCentreOnScreenZoomedOut(controls, camera), `${from}`).toBe(true);
    }
  });

  it('leaves the orbit point where a drop left it when the screen shape changes next', () => {
    const corner = boxCorner(3);
    const { controls } = controlsAt(3, corner);
    changeSpread(controls, 3, 1, false);
    stepSpreadCamera(controls, paperCameraLimits(still, FOV, 0.5, spreadOf(1)), null, null);
    expect(settle(controls).toArray()).toEqual(corner.toArray());
  });
});

describe("stepSpreadCamera's limits", () => {
  it('leaves the camera, a flight in progress and the limits as they were while neither the limits nor the orbit point move', () => {
    const { controls } = controlsAt(1, new THREE.Vector3(100, 0, 0));
    const last = stepSpreadCamera(controls, limitsAt(1), null, null);
    void controls.moveTo(200, 0, 0, true);
    controls.update(1 / 60);
    const orbitPoint = controls.getTarget(new THREE.Vector3(), false).toArray();
    const { distance, minDistance, maxDistance } = controls;
    stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(controls.getTarget(new THREE.Vector3(), false).toArray()).toEqual(orbitPoint);
    expect([controls.distance, controls.minDistance, controls.maxDistance]).toEqual([distance, minDistance, maxDistance]);
    expect(settle(controls).toArray()).toEqual([200, 0, 0]);
    void controls.moveTo(-3 * boxFace(1).x, 0, 0, true);
    expect(settle(controls).toArray()).toEqual([limitsAt(1).boundary.min.x, 0, 0]);
  });

  it('never pulls a fully zoomed-out camera in when the user pans towards the centre after a drop from the 3x box corner', () => {
    const { controls } = controlsAt(3, boxCorner(3));
    let last = stepSpreadCamera(controls, limitsAt(3), null, null);
    void controls.dollyTo(1e9, false);
    controls.update(0);
    const zoomedOut = controls.distance;
    expect(zoomedOut).toBe(limitsAt(3).maxDistance);
    last = stepSpreadCamera(controls, limitsAt(1), null, last);
    for (let i = 0; i < 120; i++) {
      void controls.moveTo(1000, 1000, 1000, true);
      last = stepSpreadCamera(controls, limitsAt(1), null, last);
      controls.update(1 / 60);
    }
    void controls.dolly(-50, true);
    for (let i = 0; i < 120; i++) {
      last = stepSpreadCamera(controls, limitsAt(1), null, last);
      controls.update(1 / 60);
    }
    expect(controls.distance).toBeGreaterThanOrEqual(zoomedOut);
  });

  it('shrinks the limits back to the current Spread\'s once the orbit point returns to the centre after a drop', () => {
    const { controls } = controlsAt(3, boxCorner(3));
    let last = stepSpreadCamera(controls, limitsAt(1), null, null);
    expect(controls.maxDistance).toBeGreaterThan(limitsAt(1).maxDistance);
    void controls.moveTo(0, 0, 0, true);
    last = stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(controls.minDistance).toBe(limitsAt(1).minDistance);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
    void controls.moveTo(-3 * boxFace(3).x, 0, 0, true);
    stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(settle(controls).toArray()).toEqual([limitsAt(1).boundary.min.x, 0, 0]);
  });

  it('shrinks the zoom-out limit back to the current Spread\'s when RESET VIEWPORT fits the tree after a drop with the orbit point at the centre', () => {
    const { controls } = controlsAt(3, new THREE.Vector3(0, 0, 0));
    let last = stepSpreadCamera(controls, limitsAt(3), null, null);
    void controls.dollyTo(1e9, false);
    controls.update(0);
    last = stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(controls.maxDistance).toBe(limitsAt(3).maxDistance);
    void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(), still.radius), true);
    stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
  });

  it('shrinks the zoom-out limit back to the current Spread\'s when the user zooms in at the centre after a drop', () => {
    const { controls } = controlsAt(3, new THREE.Vector3(0, 0, 0));
    let last = stepSpreadCamera(controls, limitsAt(3), null, null);
    void controls.dollyTo(1e9, false);
    controls.update(0);
    last = stepSpreadCamera(controls, limitsAt(1), null, last);
    void controls.dollyTo(1500, true);
    stepSpreadCamera(controls, limitsAt(1), null, last);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
  });

  it('clamps a fit made after it to its zoom limits, so a small tree loads at the closest distance', () => {
    const controls = new CameraControlsImpl(new THREE.PerspectiveCamera(FOV, ASPECT, 1, 1e6));
    const small = { center: { x: 0, y: 0, z: 0 }, radius: 8 };
    const limits = paperCameraLimits(small, FOV, ASPECT, spreadOf(1));
    stepSpreadCamera(controls, limits, null, null);
    void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(), small.radius), false);
    controls.update(0);
    expect(controls.distance).toBe(limits.minDistance);
  });
});
