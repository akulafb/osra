export interface PaperDepthOfField {
  bokehScale: number;
  /** How far either side of the orbit point the image goes fully soft, as a share of the camera's distance to it. */
  focusRangePerDistance: number;
}

export interface PaperEffectSettings {
  depthOfField: PaperDepthOfField | null;
  /** How strongly the grain shows, from 0 to 1. */
  grain: number;
}

const DESKTOP: PaperEffectSettings = {
  depthOfField: { bokehScale: 2.5, focusRangePerDistance: 0.6 },
  grain: 0.25,
};

const PHONE: PaperEffectSettings = {
  depthOfField: null,
  grain: 0.16,
};

/** The scene's post effects: a soft depth of field and a light grain on a desktop, a lighter grain alone on a phone. */
export function paperEffects(isMobileDevice: boolean): PaperEffectSettings {
  return isMobileDevice ? PHONE : DESKTOP;
}
