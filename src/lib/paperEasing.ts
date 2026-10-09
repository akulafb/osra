/** Eases from 0 to 1 over t in [0, 1]; a t outside it, or not a number, clamps to an end. */
function clamped(curve: (t: number) => number): (t: number) => number {
  return (t) => (!(t > 0) ? 0 : t >= 1 ? 1 : curve(t));
}

export const easeInOutQuad = clamped((t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2));

export const easeInOutCubic = clamped((t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2));

export const easeOutCubic = clamped((t) => 1 - (1 - t) ** 3);
