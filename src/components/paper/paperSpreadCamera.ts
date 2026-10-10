import * as THREE from 'three';
import type { CameraControls } from '@react-three/drei';
import { paperLimitsHolding, type PaperCameraLimits } from '../../lib/paperCamera';
import type { Point3 } from '../../lib/paperLayout';
import { spreadFollow, type PaperSpread } from '../../lib/paperSpread';

const now = new THREE.Vector3();
const end = new THREE.Vector3();
const box = new THREE.Box3();
const sphere = new THREE.Spherical();

export interface SpreadFollow {
  place: Point3;
  from: PaperSpread;
  to: PaperSpread;
}

export interface AppliedLimits {
  controls: CameraControls;
  requested: PaperCameraLimits;
  heldTarget: Point3;
}

export function stepSpreadCamera(
  controls: CameraControls,
  limits: PaperCameraLimits,
  follow: SpreadFollow | null,
  last: AppliedLimits | null
): AppliedLimits {
  if (follow) moveWith(controls, follow);
  const target = controls.getTarget(end, true);
  const same = last?.controls === controls;
  if (!follow && same && sameLimits(last.requested, limits) && samePoint(target, last.heldTarget)) return last;
  limitHolding(controls, limits, same);
  const { x, y, z } = controls.getTarget(end, true);
  return { controls, requested: limits, heldTarget: { x, y, z } };
}

function limitHolding(controls: CameraControls, limits: PaperCameraLimits, applied: boolean): void {
  const held = paperLimitsHolding(limits, controls.getTarget(end, true));
  const notCloserThanCamera = applied ? Math.min(controls.getSpherical(sphere, true).radius, controls.maxDistance) : 0;
  controls.minDistance = held.minDistance;
  controls.maxDistance = Math.max(held.maxDistance, notCloserThanCamera);
  const { min, max } = held.boundary;
  box.min.set(min.x, min.y, min.z);
  box.max.set(max.x, max.y, max.z);
  controls.setBoundary(box);
}

function sameLimits(a: PaperCameraLimits, b: PaperCameraLimits): boolean {
  return (
    a.minDistance === b.minDistance &&
    a.maxDistance === b.maxDistance &&
    samePoint(a.boundary.min, b.boundary.min) &&
    samePoint(a.boundary.max, b.boundary.max)
  );
}

function samePoint(a: Point3, b: Point3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
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
