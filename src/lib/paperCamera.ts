import type { Point3 } from './paperLayout';
import { spreadFrame, type PaperSpread } from './paperSpread';

/** How long the view must sit without pointer, wheel or key input before it starts to turn on its own. */
export const PAPER_IDLE_SECONDS = 3;

/** The camera's smoothing time while dragging: it sets how long the view glides after a release. */
export const PAPER_DRAG_SMOOTH_SECONDS = 0.3;

/** A frame after a stalled tab moves or turns the camera no further than this. */
export const PAPER_MAX_FRAME_SECONDS = 0.1;

const IDLE_EDGE_PX_PER_SECOND = 15;

/** The closest the camera comes to its orbit point: a large disc still fits on screen. */
const MIN_DISTANCE = 32;

/** How many overview distances the camera can pull back. */
const ZOOM_OUT_OVERVIEWS = 3;

/** A small tree is framed as if it were this big, so its limits leave room to fly to a Person. */
const MIN_SPAN = 100;

/** How far the orbit point can wander from the tree's centre, in spans. */
const BOUNDARY_SPANS = 2;

export function paperIdleRotates(secondsSinceInput: number, selected: boolean, hovered: boolean): boolean {
  return !selected && !hovered && secondsSinceInput >= PAPER_IDLE_SECONDS;
}

/** The idle turn in radians a second, so a point as far out as the screen edge moves about 15 px a second. */
export function paperIdleRotateSpeed(viewportWidthPx: number): number {
  if (!(viewportWidthPx > 0)) return 0;
  return IDLE_EDGE_PX_PER_SECOND / (viewportWidthPx / 2);
}

/** How far back the camera stands to fit a sphere of `radius` on the screen's narrower side. */
export function paperFitDistance(radius: number, fovDegrees: number, aspect: number): number {
  const verticalFov = (fovDegrees * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  return radius / Math.sin((aspect > 1 ? verticalFov : horizontalFov) / 2);
}

export interface PaperCameraLimits {
  minDistance: number;
  maxDistance: number;
  /** The box the orbit point stays in. */
  boundary: { min: Point3; max: Point3 };
}

/**
 * The zoom limits and the orbit point's box for a tree framed by `stillFrame`,
 * drawn at `spread`. From anywhere in the box, zooming all the way out brings
 * the tree's centre back on screen.
 */
export function paperCameraLimits(
  stillFrame: { center: Point3; radius: number },
  fovDegrees: number,
  aspect: number,
  spread?: PaperSpread
): PaperCameraLimits {
  const frame = spread ? spreadFrame(stillFrame, spread) : stillFrame;
  const span = Math.max(frame.radius, MIN_SPAN);
  const half = span * BOUNDARY_SPANS;
  const { x, y, z } = frame.center;
  return {
    minDistance: MIN_DISTANCE,
    maxDistance: ZOOM_OUT_OVERVIEWS * paperFitDistance(span, fovDegrees, aspect),
    boundary: { min: { x: x - half, y: y - half, z: z - half }, max: { x: x + half, y: y + half, z: z + half } },
  };
}
