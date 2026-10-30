import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { paperCameraLimits } from '../../lib/paperCamera';
import { paperRevealSmoothTime, PAPER_REVEAL_SECONDS } from '../../lib/paperIntro';
import type { PaperFlightKey } from '../../lib/paperKeys';
import type { PaperDisc, PaperLayout } from '../../lib/paperLayout';
import { paperClusterView } from '../../lib/paperSearch';
import type { PaperSpread, Spread } from '../../lib/paperSpread';
import { createPaperCameraDirector, type PaperCameraScene, type PaperCameraTick } from './paperCameraDirector';
import { PAPER_CAMERA_FRAME_PRIORITY, PAPER_SPREAD_FRAME_PRIORITY } from './paperScene';

const DREI_CONTROLS_FRAME_PRIORITY = -1;

const FOV = 50;
const ASPECT = 1.6;
const WIDTH = 1600;
const HEIGHT = 1000;
const still = { center: { x: 0, y: 0, z: 0 }, radius: 500 };
const person = { x: 475, y: 0, z: 0, radius: 8 } as PaperDisc;
const layout: PaperLayout = new Map([['person', person]]);
const spreadOf = (factor: number): PaperSpread => ({ centre: still.center, factor: factor as Spread });
const drawnAt = (factor: number) => new THREE.Vector3(person.x * factor, person.y * factor, person.z * factor);
const limitsAt = (factor: number) => paperCameraLimits(still, FOV, ASPECT, spreadOf(factor));
const boxCorner = (factor: number) => {
  const { max } = limitsAt(factor).boundary;
  return new THREE.Vector3(max.x, max.y, max.z);
};
const boxFace = (factor: number) => new THREE.Vector3(limitsAt(factor).boundary.max.x, 0, 0);
const QUIET: PaperCameraTick = { seconds: 1 / 60, selectedId: null, modalOpen: false, flight: null };

beforeAll(() => {
  // camera-controls reads DOMRect when it is made; the node test env has none.
  globalThis.DOMRect ??= class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  } as unknown as typeof DOMRect;
  CameraControlsImpl.install({ THREE });
});

function makeDirector(factor: number) {
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 1, 1e7);
  const controls = new CameraControlsImpl(camera);
  const scene: PaperCameraScene = { spread: spreadOf(factor), pointedId: null };
  const time = { ms: 0 };
  const director = createPaperCameraDirector(controls, () => scene, () => time.ms);
  return { camera, controls, scene, time, director };
}

function directorAt(factor: number, target: THREE.Vector3, from = new THREE.Vector3(0, 0, 1)) {
  const made = makeDirector(factor);
  const { director, controls } = made;
  director.setView({ frame: still, layout, width: WIDTH, height: HEIGHT });
  const position = from.clone().normalize().multiplyScalar(400).add(target);
  void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false);
  controls.update(0);
  director.tick(QUIET);
  return made;
}

function settle(controls: CameraControlsImpl) {
  for (let i = 0; i < 300; i++) controls.update(1 / 60);
  return controls.getTarget(new THREE.Vector3(), false);
}

function changeSpread({ controls, director, scene }: ReturnType<typeof makeDirector>, to: number, selected: boolean) {
  scene.spread = spreadOf(to);
  director.tick({ ...QUIET, selectedId: selected ? 'person' : null });
  return settle(controls);
}

function treeCentreOnScreenZoomedOut(controls: CameraControlsImpl, camera: THREE.PerspectiveCamera) {
  void controls.dollyTo(1e9, false);
  controls.update(0);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(still.center.x, still.center.y, still.center.z).project(camera);
  return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) < 1;
}

function held(...keys: PaperFlightKey[]) {
  return { keys: new Set(keys), boost: false };
}

describe('the camera director through a Spread change', () => {
  it('runs after the Spread reaches the scene and ahead of the camera update', () => {
    expect(PAPER_SPREAD_FRAME_PRIORITY).toBeLessThan(PAPER_CAMERA_FRAME_PRIORITY);
    expect(PAPER_CAMERA_FRAME_PRIORITY).toBeLessThan(DREI_CONTROLS_FRAME_PRIORITY);
  });

  it('keeps a focused Person put on screen through a jump from 3x to 1x', () => {
    const made = directorAt(3, drawnAt(3));
    expect(changeSpread(made, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 2.5x to 1x', () => {
    const made = directorAt(2.5, drawnAt(2.5));
    expect(changeSpread(made, 1, true).toArray()).toEqual(drawnAt(1).toArray());
  });

  it('keeps a focused Person put on screen through a jump from 1x to 3x, past the 1x box', () => {
    const made = directorAt(1, drawnAt(1));
    expect(changeSpread(made, 3, true).toArray()).toEqual(drawnAt(3).toArray());
  });

  it('sets the box again straight after following a Person, so the orbit point cannot leave it', () => {
    const made = directorAt(3, drawnAt(3));
    changeSpread(made, 1, true);
    void made.controls.moveTo(-3 * boxFace(1).x, 0, 0, true);
    expect(settle(made.controls).toArray()).toEqual([limitsAt(1).boundary.min.x, 0, 0]);
  });

  it('keeps the camera still with nobody selected when the Spread drops and the orbit point sits outside the smaller box', () => {
    const target = boxFace(3).multiplyScalar(0.9);
    const made = directorAt(3, target);
    expect(changeSpread(made, 1, false).toArray()).toEqual(target.toArray());
  });

  it('keeps a focused Person put when the Spread changes during a flight', () => {
    const made = directorAt(3, new THREE.Vector3(0, 0, 0));
    void made.controls.moveTo(...drawnAt(3).toArray(), true);
    made.controls.update(1 / 60);
    expect(changeSpread(made, 1, true).distanceTo(drawnAt(1))).toBeLessThan(0.01);
  });

  it('keeps the camera still with nobody selected when the Spread drops from the 3x box corner, and a full zoom-out still brings the tree back', () => {
    const corner = boxCorner(3);
    for (const from of [[0, 0, 1], [0, 1, 0], [1, 1, 1], [-1, -1, -1], [1, -1, 0], [1, -2, 1]]) {
      const made = directorAt(3, corner, new THREE.Vector3(...from));
      expect(changeSpread(made, 1, false).toArray(), `${from}`).toEqual(corner.toArray());
      expect(treeCentreOnScreenZoomedOut(made.controls, made.camera), `${from}`).toBe(true);
    }
  });

  it('brings the tree back on a full zoom-out after a drop from the 3x box face', () => {
    const face = boxFace(3);
    for (const from of [[0, 0, 1], [0, 1, 0]]) {
      const made = directorAt(3, face, new THREE.Vector3(...from));
      changeSpread(made, 1, false);
      expect(treeCentreOnScreenZoomedOut(made.controls, made.camera), `${from}`).toBe(true);
    }
  });

  it('leaves the orbit point where a drop left it when the screen shape changes next', () => {
    const corner = boxCorner(3);
    const made = directorAt(3, corner);
    changeSpread(made, 1, false);
    made.director.setView({ frame: still, layout, width: 500, height: 1000 });
    expect(settle(made.controls).toArray()).toEqual(corner.toArray());
  });
});

describe("the camera director's limits", () => {
  it('leaves the camera, a flight in progress and the limits as they were while neither the limits nor the orbit point move', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(100, 0, 0));
    void controls.moveTo(200, 0, 0, true);
    director.tick(QUIET);
    controls.update(1 / 60);
    const orbitPoint = controls.getTarget(new THREE.Vector3(), false).toArray();
    const { distance, minDistance, maxDistance } = controls;
    director.tick(QUIET);
    expect(controls.getTarget(new THREE.Vector3(), false).toArray()).toEqual(orbitPoint);
    expect([controls.distance, controls.minDistance, controls.maxDistance]).toEqual([distance, minDistance, maxDistance]);
    expect(settle(controls).toArray()).toEqual([200, 0, 0]);
    void controls.moveTo(-3 * boxFace(1).x, 0, 0, true);
    expect(settle(controls).toArray()).toEqual([limitsAt(1).boundary.min.x, 0, 0]);
  });

  it('never pulls a fully zoomed-out camera in when the user pans towards the centre after a drop from the 3x box corner', () => {
    const { controls, director, scene } = directorAt(3, boxCorner(3));
    void controls.dollyTo(1e9, false);
    controls.update(0);
    const zoomedOut = controls.distance;
    expect(zoomedOut).toBe(limitsAt(3).maxDistance);
    scene.spread = spreadOf(1);
    director.tick(QUIET);
    for (let i = 0; i < 120; i++) {
      void controls.moveTo(1000, 1000, 1000, true);
      director.tick(QUIET);
      controls.update(1 / 60);
    }
    void controls.dolly(-50, true);
    for (let i = 0; i < 120; i++) {
      director.tick(QUIET);
      controls.update(1 / 60);
    }
    expect(controls.distance).toBeGreaterThanOrEqual(zoomedOut);
  });

  it("shrinks the limits back to the current Spread's once the orbit point returns to the centre after a drop", () => {
    const { controls, director, scene } = directorAt(3, boxCorner(3));
    scene.spread = spreadOf(1);
    director.tick(QUIET);
    expect(controls.maxDistance).toBeGreaterThan(limitsAt(1).maxDistance);
    void controls.moveTo(0, 0, 0, true);
    director.tick(QUIET);
    expect(controls.minDistance).toBe(limitsAt(1).minDistance);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
    void controls.moveTo(-3 * boxFace(3).x, 0, 0, true);
    director.tick(QUIET);
    expect(settle(controls).toArray()).toEqual([limitsAt(1).boundary.min.x, 0, 0]);
  });

  it("shrinks the zoom-out limit back to the current Spread's when RESET VIEWPORT fits the tree after a drop with the orbit point at the centre", () => {
    const { controls, director, scene } = directorAt(3, new THREE.Vector3(0, 0, 0));
    void controls.dollyTo(1e9, false);
    controls.update(0);
    scene.spread = spreadOf(1);
    director.tick(QUIET);
    expect(controls.maxDistance).toBe(limitsAt(3).maxDistance);
    director.flyToOverview(null);
    director.tick(QUIET);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
  });

  it("shrinks the zoom-out limit back to the current Spread's when the user zooms in at the centre after a drop", () => {
    const { controls, director, scene } = directorAt(3, new THREE.Vector3(0, 0, 0));
    void controls.dollyTo(1e9, false);
    controls.update(0);
    scene.spread = spreadOf(1);
    director.tick(QUIET);
    void controls.dollyTo(1500, true);
    director.tick(QUIET);
    expect(controls.maxDistance).toBe(limitsAt(1).maxDistance);
  });
});

describe('the first view', () => {
  it('sets the limits before it frames, so a small tree loads at the closest distance', () => {
    const { controls, director } = makeDirector(1);
    const small = { center: { x: 0, y: 0, z: 0 }, radius: 8 };
    director.setView({ frame: small, layout, width: WIDTH, height: HEIGHT });
    controls.update(0);
    expect(controls.distance).toBe(paperCameraLimits(small, FOV, ASPECT, spreadOf(1)).minDistance);
  });

  it('frames the tree as drawn at the current Spread, without a transition', () => {
    const { controls, director } = makeDirector(3);
    director.setView({ frame: { center: { x: 100, y: 0, z: 0 }, radius: 500 }, layout, width: WIDTH, height: HEIGHT });
    expect(controls.getTarget(new THREE.Vector3(), false).x).toBeCloseTo(300);
  });

  it('frames only once: a later view leaves the camera where it stands', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(100, 0, 0));
    director.setView({ frame: { center: { x: -50, y: 0, z: 0 }, radius: 400 }, layout, width: WIDTH, height: HEIGHT });
    expect(settle(controls).toArray()).toEqual([100, 0, 0]);
  });
});

describe('flying to a Person', () => {
  const fly = { id: 'person', emphasis: new Map(), viewport: { width: WIDTH, height: HEIGHT }, inset: { rightPx: 0, bottomPx: 0 }, smooth: false };

  it('flies to where they are drawn at the current Spread', () => {
    const { controls, director } = directorAt(2, new THREE.Vector3(0, 0, 0));
    expect(director.flyToPerson(fly)).toBe(true);
    expect(settle(controls).distanceTo(drawnAt(2))).toBeLessThan(0.01);
  });

  it('reports a Person who is not in the view and leaves the camera alone', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(100, 0, 0));
    expect(director.flyToPerson({ ...fly, id: 'nobody' })).toBe(false);
    expect(settle(controls).toArray()).toEqual([100, 0, 0]);
  });

  it('reports every Person as missing before the first view', () => {
    expect(makeDirector(1).director.flyToPerson(fly)).toBe(false);
  });

  it('shifts the Person clear of what the drawer covers', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(0, 0, 0));
    director.flyToPerson({ ...fly, inset: { rightPx: 400, bottomPx: 0 } });
    expect(settle(controls).distanceTo(drawnAt(1))).toBeGreaterThan(1);
  });
});

describe('flying to the overview', () => {
  it('fits the whole tree as drawn at the current Spread when there is no cluster', () => {
    const { controls, director } = directorAt(2, new THREE.Vector3(200, 0, 0));
    director.flyToOverview(null);
    expect(settle(controls).length()).toBeLessThan(0.01);
    expect(controls.distance).toBeGreaterThan(paperClusterView(1));
  });

  it('fits a cluster where it is drawn', () => {
    const { controls, director } = directorAt(2, new THREE.Vector3(0, 0, 0));
    director.flyToOverview({ center: { x: 100, y: 0, z: 0 }, radius: 50 });
    expect(settle(controls).distanceTo(new THREE.Vector3(200, 0, 0))).toBeLessThan(0.01);
  });

  it('does nothing before the first view', () => {
    const { controls, director } = makeDirector(1);
    const before = controls.getTarget(new THREE.Vector3(), false).toArray();
    director.flyToOverview(null);
    expect(settle(controls).toArray()).toEqual(before);
  });
});

describe('keyed flight', () => {
  it('moves the orbit point on a held key', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(0, 0, 0));
    director.tick({ ...QUIET, flight: held('right') });
    expect(settle(controls).length()).toBeGreaterThan(0);
  });

  it('stays still while flight is paused and during the reveal', () => {
    const paused = directorAt(1, new THREE.Vector3(0, 0, 0));
    paused.director.tick(QUIET);
    expect(settle(paused.controls).length()).toBe(0);

    const revealing = directorAt(1, new THREE.Vector3(0, 0, 0));
    revealing.director.swingIn();
    revealing.director.tick({ ...QUIET, flight: held('right') });
    expect(settle(revealing.controls).length()).toBe(0);
  });

  it('still flies behind a modal that allows it', () => {
    const { controls, director } = directorAt(1, new THREE.Vector3(0, 0, 0));
    director.tick({ ...QUIET, modalOpen: true, flight: held('right') });
    expect(settle(controls).length()).toBeGreaterThan(0);
  });

  it('moves further the further back the camera stands', () => {
    const reach = (factor: number) => {
      const { controls, director } = directorAt(1, new THREE.Vector3(0, 0, 0));
      void controls.dollyTo(400 * factor, false);
      controls.update(0);
      director.tick({ ...QUIET, flight: held('right') });
      return settle(controls).length();
    };
    expect(reach(2)).toBeCloseTo(reach(1) * 2);
  });
});

describe('the idle turn', () => {
  const turned = ({ controls, director }: ReturnType<typeof makeDirector>, frame: Partial<PaperCameraTick> = {}) => {
    const before = controls.azimuthAngle;
    director.tick({ ...QUIET, ...frame });
    settle(controls);
    return controls.azimuthAngle !== before;
  };
  const idleDirector = () => {
    const made = directorAt(1, new THREE.Vector3(0, 0, 0));
    made.time.ms = 3000;
    return made;
  };

  it('waits three seconds after the first view', () => {
    const made = directorAt(1, new THREE.Vector3(0, 0, 0));
    made.time.ms = 2999;
    expect(turned(made)).toBe(false);
    made.time.ms = 3000;
    expect(turned(made)).toBe(true);
  });

  it('counts the three seconds from the first view, not from when the director was made', () => {
    const made = makeDirector(1);
    made.time.ms = 10000;
    made.director.setView({ frame: still, layout, width: WIDTH, height: HEIGHT });
    expect(turned(made)).toBe(false);
  });

  it('waits again after input', () => {
    const made = idleDirector();
    made.director.noteInput();
    expect(turned(made)).toBe(false);
  });

  it('stays still with a Person selected, under the mouse, behind a modal or during the reveal', () => {
    expect(turned(idleDirector(), { selectedId: 'person' })).toBe(false);
    expect(turned(idleDirector(), { modalOpen: true })).toBe(false);
    const pointed = idleDirector();
    pointed.scene.pointedId = 'person';
    expect(turned(pointed)).toBe(false);
    const revealing = idleDirector();
    revealing.director.swingIn();
    for (let i = 0; i < 3000; i++) revealing.controls.update(1 / 60);
    expect(turned(revealing)).toBe(false);
  });

  it('turns again once the reveal swing has ended', () => {
    const made = idleDirector();
    made.director.swingIn()();
    expect(turned(made)).toBe(true);
  });

  it('turns no further on a stalled frame than the frame cap allows', () => {
    const stalled = idleDirector();
    const capped = idleDirector();
    const before = stalled.controls.azimuthAngle;
    stalled.director.tick({ ...QUIET, seconds: 5 });
    capped.director.tick({ ...QUIET, seconds: 0.1 });
    settle(stalled.controls);
    settle(capped.controls);
    expect(stalled.controls.azimuthAngle - before).toBeCloseTo(capped.controls.azimuthAngle - before);
  });
});

describe('the reveal swing', () => {
  const ready = () => directorAt(1, new THREE.Vector3(0, 0, 0));

  it('starts away from where the camera stands and lands back on it', () => {
    const { controls, director } = ready();
    const { distance, azimuthAngle, polarAngle } = controls;
    director.swingIn();
    expect(controls.azimuthAngle).not.toBeCloseTo(azimuthAngle);
    for (let i = 0; i < 3000; i++) controls.update(1 / 60);
    expect(controls.distance).toBeCloseTo(distance);
    expect(controls.azimuthAngle).toBeCloseTo(azimuthAngle);
    expect(controls.polarAngle).toBeCloseTo(polarAngle);
  });

  it('has all but landed by the end of the reveal', () => {
    const { controls, director } = ready();
    const { distance } = controls;
    director.swingIn();
    for (let i = 0; i < PAPER_REVEAL_SECONDS * 60; i++) controls.update(1 / 60);
    expect(Math.abs(controls.distance - distance) / distance).toBeLessThan(0.02);
  });

  it("lands in the same place through StrictMode's second run", () => {
    const { controls, director } = ready();
    const { distance } = controls;
    director.swingIn()();
    controls.update(1 / 60);
    director.swingIn();
    for (let i = 0; i < 3000; i++) controls.update(1 / 60);
    expect(controls.distance).toBeCloseTo(distance);
  });

  it('slows the camera for the swing and gives its pace back when it ends', () => {
    const { controls, director } = ready();
    const pace = controls.smoothTime;
    const end = director.swingIn();
    expect(controls.smoothTime).toBe(paperRevealSmoothTime(false));
    director.hurrySwing();
    expect(controls.smoothTime).toBe(paperRevealSmoothTime(true));
    end();
    expect(controls.smoothTime).toBe(pace);
  });
});
