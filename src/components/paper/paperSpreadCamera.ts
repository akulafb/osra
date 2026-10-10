import * as THREE from 'three';
import type { CameraControls } from '@react-three/drei';
import type { PaperCameraLimits } from '../../lib/paperCamera';
import type { Point3 } from '../../lib/paperLayout';
import { spreadFollow, type PaperSpread } from '../../lib/paperSpread';

const now = new THREE.Vector3();
const end = new THREE.Vector3();
const box = new THREE.Box3();

/**
 * Moves the camera as far as a Person at `place` in the layout moves when the
 * Spread goes from `from` to `to`, so they stay put on screen. It runs before
 * `limitCamera` in the same frame: it reads the target before a smaller box can
 * clamp it, and lifts the old box so a larger Spread's move is not cut short.
 */
export function followSpread(controls: CameraControls, place: Point3, from: PaperSpread, to: PaperSpread): void {
  const d = spreadFollow(place, from, to);
  controls.getTarget(now, false).add(d);
  controls.getTarget(end, true).add(d);
  controls.setBoundary();
  // camera-controls' moveTo without a transition also snaps the target to its end, so a flight in progress gets its end back with a second, smooth move.
  const flying = !now.equals(end);
  void controls.moveTo(now.x, now.y, now.z, false);
  if (flying) void controls.moveTo(end.x, end.y, end.z, true);
}

/**
 * Sets the zoom limits and the orbit point's box. With `holdTarget`, the box
 * also holds the orbit point where it is, so a smaller Spread never pulls the
 * camera.
 */
export function limitCamera(controls: CameraControls, limits: PaperCameraLimits, holdTarget: boolean): void {
  controls.minDistance = limits.minDistance;
  controls.maxDistance = limits.maxDistance;
  const { min, max } = limits.boundary;
  box.min.set(min.x, min.y, min.z);
  box.max.set(max.x, max.y, max.z);
  if (holdTarget) box.expandByPoint(controls.getTarget(end, true));
  controls.setBoundary(box);
}
