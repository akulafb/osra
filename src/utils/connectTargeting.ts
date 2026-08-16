/**
 * Where a Connect Mode candidate sits relative to the viewport (LIN-50).
 *
 * Raycasting alone is a trap in 3D targeting: a perfectly valid target can be
 * off-screen, behind the camera, or a few pixels wide, and a click that lands
 * on nothing looks exactly like a click on an invalid target. Classifying each
 * candidate lets the fallback picker say which ones aiming cannot reach at all,
 * so the user knows to pick them from the list instead of hunting for them.
 *
 * Deliberately free of three.js types: hosts project the point themselves (the
 * graph exposes `graph2ScreenCoords`) and hand the numbers over.
 */

export type TargetVisibility = 'onscreen' | 'offscreen' | 'behind';

/**
 * How far inside the viewport edge still counts as unreachable. The docked
 * panel, the Instruments column and the HUD all live at the edges, so a planet
 * under them is no more clickable than one past the edge entirely.
 */
export const TARGET_EDGE_MARGIN = 32;

/**
 * True when a point is at or behind the camera plane.
 *
 * three.js cameras look down -Z in view space, so a non-negative depth is
 * behind. This has to be tested separately because `graph2ScreenCoords`
 * projects without a frustum test: a point behind the camera comes back
 * point-mirrored into view and would otherwise read as a centre-screen hit.
 */
export function isBehindCamera(viewSpaceZ: number): boolean {
  return !(viewSpaceZ < 0);
}

export function classifyTargetVisibility(params: {
  /** Depth of the candidate in camera space. */
  viewSpaceZ: number;
  /** The candidate projected to screen pixels. */
  screen: { x: number; y: number };
  viewport: { width: number; height: number };
}): TargetVisibility {
  const { viewSpaceZ, screen, viewport } = params;

  if (isBehindCamera(viewSpaceZ)) return 'behind';
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return 'offscreen';

  const inside =
    screen.x > TARGET_EDGE_MARGIN &&
    screen.y > TARGET_EDGE_MARGIN &&
    screen.x < viewport.width - TARGET_EDGE_MARGIN &&
    screen.y < viewport.height - TARGET_EDGE_MARGIN;

  return inside ? 'onscreen' : 'offscreen';
}

/** How many candidates no amount of aiming can reach. */
export function countUnreachable(visibilities: TargetVisibility[]): number {
  return visibilities.filter((v) => v !== 'onscreen').length;
}
