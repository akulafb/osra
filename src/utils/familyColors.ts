/**
 * Shared family cluster color palette and helpers.
 */

export const FAMILY_COLORS: Record<string, string> = {
  Badran: '#0066ff',
  Kutob: '#00ff88',
  Hajjaj: '#ffaa00',
  Zabalawi: '#ff00aa',
  Malhis: '#aa00ff',
  Shawa: '#ff3333',
  Dajani: '#33ffff',
  Masri: '#ffff33',
  Tamimi: '#00ff00',
  Husaini: '#ff0000',
  Nabulsi: '#ff6600',
  Ghazali: '#00ccff',
  Rifai: '#cc00ff',
  Qudsi: '#66ff00',
  Jaabari: '#ff0066',
  Khalidi: '#00ffcc',
};

const COLOR_VALUES = Object.values(FAMILY_COLORS);

function hashCluster(cluster: string): number {
  let hash = 0;
  for (let i = 0; i < cluster.length; i++) {
    hash = cluster.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

export function getClusterColor(
  cluster: string | undefined | null,
  defaultColor = '#ffffff'
): string {
  if (!cluster) return defaultColor;
  if (FAMILY_COLORS[cluster]) return FAMILY_COLORS[cluster];
  return COLOR_VALUES[Math.abs(hashCluster(cluster)) % COLOR_VALUES.length];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

type RGB = [number, number, number];

function relativeLuminance([r, g, b]: RGB): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text for best WCAG contrast against a solid background. */
export function getContrastText(bg: RGB): '#000' | '#fff' {
  return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
    ? '#fff'
    : '#000';
}

/** Composite a translucent foreground over an opaque base color. */
function compositeOver(fg: RGB, alpha: number, base: RGB): RGB {
  return [
    Math.round(fg[0] * alpha + base[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + base[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + base[2] * (1 - alpha)),
  ];
}

/** App canvas is near-black; cards are painted as translucent hue over it. */
const CANVAS_BASE: RGB = [5, 5, 5];
const CARD_BG_ALPHA = 0.15;
const FALLBACK_RGB: RGB = [100, 100, 100];
const FALLBACK_ALPHA = 0.2;

export function getClusterColors(cluster: string | undefined | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (!cluster) {
    return {
      bg: `rgba(100, 100, 100, ${FALLBACK_ALPHA})`,
      border: '#888',
      text: getContrastText(compositeOver(FALLBACK_RGB, FALLBACK_ALPHA, CANVAS_BASE)),
    };
  }
  const hex = getClusterColor(cluster, '#888');
  const rgb = hexToRgb(hex);
  const bg = rgb
    ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${CARD_BG_ALPHA})`
    : `rgba(100, 100, 100, ${FALLBACK_ALPHA})`;
  const effectiveBg = rgb
    ? compositeOver(rgb, CARD_BG_ALPHA, CANVAS_BASE)
    : compositeOver(FALLBACK_RGB, FALLBACK_ALPHA, CANVAS_BASE);
  return {
    bg,
    border: hex,
    text: getContrastText(effectiveBg),
  };
}
