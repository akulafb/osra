import * as THREE from 'three';
import type { CameraControls } from '@react-three/drei';
import { paperLimitsHolding, type PaperCameraLimits } from '../../lib/paperCamera';
import type { Point3 } from '../../lib/paperLayout';
import { spreadFollow, type PaperSpread } from '../../lib/paperSpread';

const now = new THREE.Vector3();
const end = new THREE.Vector3();
const box = new THREE.Box3();

/** The selected Person, at `place` in the layout, while the Spread goes from `from` to `to`. */
export interface SpreadFollow {
  place: Point3;
  from: PaperSpread;
  to: PaperSpread;
}

/**
 * The camera's step for a frame where the Spread or the limits changed: moves
 * the camera as far as the followed Person moves, so they stay put on screen,
 * then sets `limits`.
 */
export function stepSpreadCamera(controls: CameraControls, limits: PaperCameraLimits, follow: SpreadFollow | null): void {
  if (follow) moveWith(controls, follow);
  limitCamera(controls, limits);
}

/**
 * Sets the zoom limits and the orbit point's box, both grown to hold the orbit
 * point where it is, so new limits never pull the camera.
 */
export function limitCamera(controls: CameraControls, limits: PaperCameraLimits): void {
  const held = paperLimitsHolding(limits, controls.getTarget(end, true));
  controls.minDistance = held.minDistance;
  controls.maxDistance = held.maxDistance;
  const { min, max } = held.boundary;
  box.min.set(min.x, min.y, min.z);
  box.max.set(max.x, max.y, max.z);
  controls.setBoundary(box);
}

// Lifts the box so a move onto a larger Spread is not cut short; stepSpreadCamera sets it again straight after.
function moveWith(controls: CameraControls, { place, from, to }: SpreadFollow): void {
  const d = spreadFollow(place, from, to);
  controls.getTarget(now, false).add(d);
  controls.getTarget(end, true).add(d);
  controls.setBoundary();
  // camera-controls' moveTo without a transition also snaps the target to its end, so a flight in progress gets its end back with a second, smooth move.
  const flying = !now.equals(end);
  void controls.moveTo(now.x, now.y, now.z, false);
  if (flying) void controls.moveTo(end.x, end.y, end.z, true);
}
