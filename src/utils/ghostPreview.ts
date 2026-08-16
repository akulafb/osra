import * as THREE from 'three';
import { RelativeDirection } from '../types/graph';

/**
 * Placement of the Ghost Preview — the translucent marker showing where a new
 * Tree Node will land (LIN-46, ADR 0002).
 *
 * Direction is camera-relative: "up" means up on the viewer's screen, not a
 * world axis. The 3D force layout has no genealogical axis, so a world-up
 * convention would bury the preview behind the anchor planet from roughly half
 * of all viewpoints. Hosts resolve this once when the action opens and hold the
 * result, so the preview does not swing around as the camera orbits.
 */

/** Distance from the anchor planet to its preview, in world units. */
export const GHOST_PREVIEW_OFFSET = 48;

/**
 * Spouses sit further out than parents and children. They share the anchor's
 * generation, so the extra spread is what keeps them from reading as one blob.
 */
export const GHOST_PREVIEW_SPOUSE_SPREAD = 1.3;

/** Radius of the preview sphere, matched to the individual node geometry. */
export const GHOST_PREVIEW_RADIUS = 10;

/** Wireframe shell sits just outside the body so both read as one object. */
export const GHOST_PREVIEW_SHELL_SCALE = 1.15;
export const GHOST_PREVIEW_BODY_OPACITY = 0.18;
export const GHOST_PREVIEW_SHELL_OPACITY = 0.55;

/** Height of the name label above the marker's centre. */
export const GHOST_PREVIEW_LABEL_HEIGHT = GHOST_PREVIEW_RADIUS + 8;

export const GHOST_PREVIEW_TETHER_DASH = 5;
export const GHOST_PREVIEW_TETHER_GAP = 4;

/**
 * Breathing, so the marker reads as pending rather than already placed.
 * Expressed per millisecond — a per-frame counter would breathe at whatever
 * rate the display happens to run at.
 */
export const GHOST_PREVIEW_BREATH_PERIOD_MS = 1800;
export const GHOST_PREVIEW_BREATH_AMPLITUDE = 0.06;

/** Scale factor for the shell's breathing at a given time. */
export function ghostPreviewBreath(elapsedMs: number): number {
  const phase = (elapsedMs / GHOST_PREVIEW_BREATH_PERIOD_MS) * Math.PI * 2;
  return 1 + Math.sin(phase) * GHOST_PREVIEW_BREATH_AMPLITUDE;
}

/**
 * The displacement from anchor to preview, in world space.
 *
 * Separate from the anchor because hosts resolve this once when the action
 * opens and then reuse it every frame: the anchor keeps drifting with the force
 * simulation, but the direction must not follow the camera afterwards.
 */
export function computeGhostPreviewOffset(
  cameraQuaternion: THREE.Quaternion,
  relation: RelativeDirection
): THREE.Vector3 {
  switch (relation) {
    case 'parent':
      return new THREE.Vector3(0, 1, 0)
        .applyQuaternion(cameraQuaternion)
        .multiplyScalar(GHOST_PREVIEW_OFFSET);
    case 'child':
      return new THREE.Vector3(0, 1, 0)
        .applyQuaternion(cameraQuaternion)
        .multiplyScalar(-GHOST_PREVIEW_OFFSET);
    case 'spouse':
    default:
      return new THREE.Vector3(1, 0, 0)
        .applyQuaternion(cameraQuaternion)
        .multiplyScalar(GHOST_PREVIEW_OFFSET * GHOST_PREVIEW_SPOUSE_SPREAD);
  }
}

