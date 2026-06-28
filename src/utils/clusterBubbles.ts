/**
 * Pure helpers for the 3D "family cluster on zoom-out" feature (LIN-32).
 *
 * These functions are framework-agnostic (no THREE / React) so they can be
 * unit-tested in isolation. The hook `useClusterBubbles` applies their output
 * to the live Three.js scene each frame.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Minimal shape of a live force-graph node (positions are attached at runtime). */
export interface LiveNode {
  x?: number;
  y?: number;
  z?: number;
  familyCluster?: string;
}

// --- Tuning constants (exported for live tweaking) ---

/** Begin fully clustering once camera distance exceeds ENTER_MULT * graphRadius. */
export const ENTER_MULT = 1.5;
/** Return to full detail once camera distance drops below EXIT_MULT * graphRadius. */
export const EXIT_MULT = 1.0;

/** Smallest "planet" bubble — small but still visible and clickable. (tunable) */
export const MIN_BUBBLE_RADIUS = 50;
/** The dominant "sun" — radius of the single largest cluster. (tunable) */
export const MAX_BUBBLE_RADIUS = 600;
/** Exponent on a cluster's share of the largest cluster. 0.5 = area-proportional. */
export const BUBBLE_SIZE_EXPONENT = 0.5;

// --- Declutter (LIN-32 #3): fade bubbles & labels by their on-screen size, so
// small/distant families drop away when zoomed out instead of colliding. All are
// fractions of viewport height; labels use a higher band than bubbles so only
// prominent families stay labelled. (tunable)
/** Bubble opacity ramps 0→1 as its on-screen diameter crosses this band. */
export const BUBBLE_FADE_MIN = 0.012;
export const BUBBLE_FADE_FULL = 0.03;
/** A bubble shows its label only as its on-screen diameter crosses this (higher) band. */
export const LABEL_FADE_MIN = 0.05;
export const LABEL_FADE_FULL = 0.1;

// --- Look & feel (LIN-32 #4): frosted-glass bubbles + hover affordance. (tunable) ---
/** Peak opacity of a fully-faded-in bubble (matches the glassy individual-node look). */
export const GLASS_BASE_OPACITY = 0.5;
/** Extra scale a bubble grows by while hovered (0.06 = +6%). */
export const HOVER_SCALE = 0.06;
/** Emissive intensity a bubble brightens to while hovered. */
export const HOVER_EMISSIVE_INTENSITY = 0.5;
/** Per-frame lerp factor easing the hover in/out (0..1; higher = snappier). */
export const HOVER_LERP = 0.15;

function isFinitePos(node: LiveNode): node is LiveNode & Vec3 {
  return (
    typeof node.x === 'number' && Number.isFinite(node.x) &&
    typeof node.y === 'number' && Number.isFinite(node.y) &&
    typeof node.z === 'number' && Number.isFinite(node.z)
  );
}

/**
 * Centroid and bounding radius (max distance from centroid) of all positioned
 * nodes. Used to scale the zoom thresholds to the actual graph size.
 */
export function computeVisibleBounds(nodes: ReadonlyArray<LiveNode>): {
  centroid: Vec3;
  radius: number;
} {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const node of nodes) {
    if (!isFinitePos(node)) continue;
    sx += node.x; sy += node.y; sz += node.z; n++;
  }
  if (n === 0) return { centroid: { x: 0, y: 0, z: 0 }, radius: 0 };

  const centroid: Vec3 = { x: sx / n, y: sy / n, z: sz / n };
  let maxDistSq = 0;
  for (const node of nodes) {
    if (!isFinitePos(node)) continue;
    const dx = node.x - centroid.x;
    const dy = node.y - centroid.y;
    const dz = node.z - centroid.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > maxDistSq) maxDistSq = distSq;
  }
  return { centroid, radius: Math.sqrt(maxDistSq) };
}

export interface ClusterAggregate {
  centroid: Vec3;
  /** Total members of this cluster (including any without finite positions). */
  count: number;
}

/**
 * Group nodes by paternal `familyCluster` and return each cluster's member
 * count plus the centroid of its positioned members. Clusters with no
 * positioned members are omitted (they cannot be placed).
 */
export function computeClusterCentroids(
  nodes: ReadonlyArray<LiveNode>
): Map<string, ClusterAggregate> {
  const acc = new Map<
    string,
    { sx: number; sy: number; sz: number; posCount: number; count: number }
  >();

  for (const node of nodes) {
    const cluster = node.familyCluster?.trim();
    if (!cluster) continue;
    let a = acc.get(cluster);
    if (!a) {
      a = { sx: 0, sy: 0, sz: 0, posCount: 0, count: 0 };
      acc.set(cluster, a);
    }
    a.count++;
    if (isFinitePos(node)) {
      a.sx += node.x; a.sy += node.y; a.sz += node.z; a.posCount++;
    }
  }

  const out = new Map<string, ClusterAggregate>();
  for (const [cluster, a] of acc) {
    if (a.posCount === 0) continue;
    out.set(cluster, {
      centroid: { x: a.sx / a.posCount, y: a.sy / a.posCount, z: a.sz / a.posCount },
      count: a.count,
    });
  }
  return out;
}

/**
 * World-space radius for a cluster bubble, normalized against the largest
 * cluster (`maxCount`). The size encodes member count by *area*
 * (radius ∝ √count, via BUBBLE_SIZE_EXPONENT) so a dominant family reads like a
 * "sun" at MAX_BUBBLE_RADIUS while the rest shrink to "planets" by the root of
 * their share. Floored at MIN_BUBBLE_RADIUS so small families stay findable.
 */
export function bubbleRadius(count: number, maxCount: number): number {
  const share = Math.max(1, count) / Math.max(1, maxCount); // 0..1
  const frac = Math.pow(share, BUBBLE_SIZE_EXPONENT);
  return Math.max(MIN_BUBBLE_RADIUS, MAX_BUBBLE_RADIUS * frac);
}

/**
 * On-screen diameter of a sphere of world `radius` at `distance` from a
 * perspective camera with vertical field-of-view `fovRadians`, expressed as a
 * fraction of the viewport height. Returns Infinity when the camera is on top of
 * it (distance → 0). Drives the declutter fades: a planet that projects to only
 * a few pixels is faded out so it stops cluttering the zoomed-out overview.
 */
export function apparentDiameterFraction(
  radius: number,
  distance: number,
  fovRadians: number
): number {
  if (!(distance > 0) || !(fovRadians > 0)) return Infinity;
  return radius / (distance * Math.tan(fovRadians / 2));
}

/** Clamped linear ramp: 0 at/below `lo`, 1 at/above `hi`, linear between. */
export function ramp01(value: number, lo: number, hi: number): number {
  if (hi <= lo) return value >= hi ? 1 : 0;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/**
 * Maps camera distance to a crossfade factor in [0, 1]:
 *   0 = fully zoomed in (show individuals),
 *   1 = fully zoomed out (show cluster bubbles).
 * The ramp between EXIT and ENTER distances gives a seamless crossfade rather
 * than a hard switch. Thresholds scale with the graph's bounding `radius`.
 */
export function detailFactor(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const exit = EXIT_MULT * radius;
  const enter = ENTER_MULT * radius;
  if (enter <= exit) return 0;
  if (distance <= exit) return 0;
  if (distance >= enter) return 1;
  return (distance - exit) / (enter - exit);
}
