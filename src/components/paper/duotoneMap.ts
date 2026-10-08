import { hexToRgb } from '../../lib/colourBlend';

export type LinearRgb = readonly [number, number, number];

export interface LinearPair {
  ink: LinearRgb;
  paper: LinearRgb;
}

const LUMA: LinearRgb = [0.2126, 0.7152, 0.0722];

export function hexToLinear(hex: string): LinearRgb {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return [r, g, b];
}

export function luma([r, g, b]: LinearRgb): number {
  return r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
}

/** Where a colour sits between the scene's ink and paper, painted at the same place between the pair's ink and paper. */
export function duotone(colour: LinearRgb, scene: LinearPair, pair: LinearPair): LinearRgb {
  const inkLuma = luma(scene.ink);
  const t = Math.min(1, Math.max(0, (luma(colour) - inkLuma) / (luma(scene.paper) - inkLuma)));
  const at = (i: number) => pair.ink[i] + (pair.paper[i] - pair.ink[i]) * t;
  return [at(0), at(1), at(2)];
}

export const DUOTONE_FRAGMENT = /* glsl */ `
uniform float inkLuma;
uniform float paperLuma;
uniform vec3 ink;
uniform vec3 paper;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float t = clamp((dot(inputColor.rgb, vec3(${LUMA.join(', ')})) - inkLuma) / (paperLuma - inkLuma), 0.0, 1.0);
  outputColor = vec4(mix(ink, paper, t), inputColor.a);
}
`;
