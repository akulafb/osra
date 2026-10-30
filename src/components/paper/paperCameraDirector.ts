import * as THREE from 'three';
import type { CameraControls } from '@react-three/drei';
import type { Emphasis } from '../../lib/focusEmphasis';
import {
  paperCameraLimits,
  paperIdleRotates,
  paperIdleRotateSpeed,
  paperLimitsHolding,
  PAPER_MAX_FRAME_SECONDS,
  type PaperCameraLimits,
} from '../../lib/paperCamera';
import { paperFlyTo, paperFocusReach, type PaperFlyInput } from '../../lib/paperFocus';
import { paperRevealSmoothTime } from '../../lib/paperIntro';
import { paperFlightStep, type PaperHeldKeys } from '../../lib/paperKeys';
import type { PaperLayout, Point3 } from '../../lib/paperLayout';
import { paperClusterView } from '../../lib/paperSearch';
import { spreadFollow, spreadFrame, spreadLayout, type PaperSpread } from '../../lib/paperSpread';
import type { PaperEmphasisState } from './paperEmphasis';
import type { PaperFrame } from './paperScene';

const SWING_AZIMUTH = 0.9;
const SWING_POLAR = 0.35;
const SWING_BACK = 1.6;

const now = new THREE.Vector3();
const end = new THREE.Vector3();
const box = new THREE.Box3();
const sphere = new THREE.Spherical();

/** What the director reads from the scene when it moves the camera. */
export type PaperCameraScene = Pick<PaperEmphasisState, 'spread' | 'pointedId'>;

export interface PaperCameraView {
  /** The sphere around the whole tree before the Spread. */
  frame: PaperFrame;
  /** The scene's layout, where each Person is placed before the Spread. */
  layout: PaperLayout;
  width: number;
  height: number;
}

export interface PaperCameraTick {
  seconds: number;
  selectedId: string | null;
  modalOpen: boolean;
  /** The keys held for flying; null while flight is paused. */
  flight: PaperHeldKeys | null;
}

export interface PaperFlyToPerson extends Pick<PaperFlyInput, 'viewport' | 'inset'> {
  id: string;
  emphasis: ReadonlyMap<string, Emphasis>;
  smooth: boolean;
}

/**
 * The one module that moves the Paper 3D camera (ADR 0015). It owns the zoom
 * limits and box, the Spread follow, framing, flights to a Person, the reveal
 * swing, keyed flight and the idle turn, and the order they happen in, so a
 * caller says what it wants and no caller touches CameraControls.
 */
export interface PaperCameraDirector {
  /** Sets the camera's limits for this view at once; the first view also frames the tree, without a transition. */
  setView(view: PaperCameraView): void;
  /** One frame's camera work. Call it after the Spread reaches the scene and ahead of the controls' update. */
  tick(frame: PaperCameraTick): void;
  /** The viewer did something, so the idle turn waits again. */
  noteInput(): void;
  /** Flies to a Person where they are drawn. Returns false when they are not in the view. */
  flyToPerson(fly: PaperFlyToPerson): boolean;
  /** Flies back to the search cluster, or to the whole tree when there is none. */
  flyToOverview(cluster: PaperFrame | null): void;
  /** Starts the reveal's swing in to where the camera stands. Returns what ends it; a second run lands in the same place. */
  swingIn(): () => void;
  /** A Person picked during the swing takes the camera at the usual pace. */
  hurrySwing(): void;
}

interface AppliedLimits {
  requested: PaperCameraLimits;
  heldTarget: Point3;
  heldDistance: number;
}

export function createPaperCameraDirector(
  controls: CameraControls,
  scene: () => PaperCameraScene,
  clock: () => number = () => performance.now()
): PaperCameraDirector {
  let view: PaperCameraView | null = null;
  let applied: AppliedLimits | null = null;
  let followed: PaperSpread | null = null;
  let lastInput = clock();
  let landing: { distance: number; azimuth: number; polar: number } | null = null;
  let swinging = false;

  const currentLimits = () => {
    const { camera } = controls;
    if (!view || !(camera instanceof THREE.PerspectiveCamera) || !(view.width > 0 && view.height > 0)) return null;
    return paperCameraLimits(view.frame, camera.fov, view.width / view.height, scene().spread);
  };

  const applyLimits = (limits: PaperCameraLimits | null, force: boolean) => {
    if (!limits) return;
    const target = controls.getTarget(end, true);
    const distance = controls.getSpherical(sphere, true).radius;
    if (
      !force &&
      applied &&
      sameLimits(applied.requested, limits) &&
      samePoint(target, applied.heldTarget) &&
      distance === applied.heldDistance
    )
      return;
    limitHolding(controls, limits, applied !== null);
    const { x, y, z } = controls.getTarget(end, true);
    applied = { requested: limits, heldTarget: { x, y, z }, heldDistance: controls.getSpherical(sphere, true).radius };
  };

  const fit = ({ center, radius }: PaperFrame, smooth: boolean) => {
    void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(center.x, center.y, center.z), radius), smooth);
  };

  const flyWithKeys = (flight: PaperHeldKeys, seconds: number) => {
    const distance = controls.camera.position.distanceTo(controls.getTarget(end));
    const step = paperFlightStep(flight.keys, flight.boost, seconds, distance);
    if (!step) return;
    if (step.truck) void controls.truck(step.truck, 0, true);
    if (step.forward) void controls.forward(step.forward, true);
    if (step.azimuth) void controls.rotate(step.azimuth, 0, true);
  };

  return {
    setView(next) {
      const first = !view;
      view = next;
      if (first) lastInput = clock();
      // Before the fit: camera-controls clamps a distance only as it is set.
      applyLimits(currentLimits(), false);
      if (first) fit(spreadFrame(next.frame, scene().spread), false);
    },

    tick({ seconds, selectedId, modalOpen, flight }) {
      const { spread, pointedId } = scene();
      const from = followed;
      followed = spread;
      const limits = currentLimits();
      if (limits) {
        const place = selectedId ? view?.layout.get(selectedId) : undefined;
        const moved = !!from && from !== spread && !!place;
        if (moved) moveWith(controls, place, from, spread);
        applyLimits(limits, moved);
      }
      if (!view || swinging) return;
      if (flight) flyWithKeys(flight, seconds);
      if (modalOpen) return;
      const idleSeconds = (clock() - lastInput) / 1000;
      if (!paperIdleRotates(idleSeconds, selectedId !== null, pointedId !== null)) return;
      void controls.rotate(paperIdleRotateSpeed(view.width) * Math.min(seconds, PAPER_MAX_FRAME_SECONDS), 0, true);
    },

    noteInput() {
      lastInput = clock();
    },

    flyToPerson({ id, emphasis, viewport, inset, smooth }) {
      const { camera } = controls;
      if (!view || !(camera instanceof THREE.PerspectiveCamera)) return false;
      const drawn = spreadLayout(view.layout, scene().spread);
      const disc = drawn.get(id);
      if (!disc) return false;
      const { position, target } = paperFlyTo({
        person: disc,
        reach: paperFocusReach(drawn, disc, emphasis),
        from: { position: controls.getPosition(new THREE.Vector3(), true), target: controls.getTarget(new THREE.Vector3(), true) },
        viewport,
        inset,
        fovDegrees: camera.fov,
      });
      void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, smooth);
      return true;
    },

    flyToOverview(cluster) {
      const { spread } = scene();
      if (cluster) {
        const { center, radius } = spreadFrame(cluster, spread);
        fit({ center, radius: paperClusterView(radius) }, true);
      } else if (view) {
        fit(spreadFrame(view.frame, spread), true);
      }
    },

    swingIn() {
      const smoothTime = controls.smoothTime;
      swinging = true;
      // Kept across StrictMode's second run, which would otherwise land where the first one started.
      const { distance, azimuth, polar } = (landing ??= {
        distance: controls.distance,
        azimuth: controls.azimuthAngle,
        polar: controls.polarAngle,
      });
      controls.smoothTime = paperRevealSmoothTime(false);
      void controls.rotateTo(azimuth - SWING_AZIMUTH, polar - SWING_POLAR, false);
      void controls.dollyTo(distance * SWING_BACK, false);
      void controls.rotateTo(azimuth, polar, true);
      void controls.dollyTo(distance, true);
      return () => {
        swinging = false;
        controls.smoothTime = smoothTime;
      };
    },

    hurrySwing() {
      controls.smoothTime = paperRevealSmoothTime(true);
    },
  };
}

function limitHolding(controls: CameraControls, limits: PaperCameraLimits, limitedBefore: boolean): void {
  const held = paperLimitsHolding(limits, controls.getTarget(end, true));
  const cameraDistanceFloor = limitedBefore ? Math.min(controls.getSpherical(sphere, true).radius, controls.maxDistance) : 0;
  controls.minDistance = held.minDistance;
  controls.maxDistance = Math.max(held.maxDistance, cameraDistanceFloor);
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

// Lifts the box so a move onto a larger Spread is not cut short; applyLimits sets it again straight after.
function moveWith(controls: CameraControls, place: Point3, from: PaperSpread, to: PaperSpread): void {
  const d = spreadFollow(place, from, to);
  controls.getTarget(now, false).add(d);
  controls.getTarget(end, true).add(d);
  controls.setBoundary();
  // camera-controls' moveTo without a transition also snaps the target to its end, so a flight in progress gets its end back with a second, smooth move.
  const flying = !now.equals(end);
  void controls.moveTo(now.x, now.y, now.z, false);
  if (flying) void controls.moveTo(end.x, end.y, end.z, true);
}
