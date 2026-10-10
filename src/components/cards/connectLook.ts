import { alpha } from '@mui/material/styles';
import type { CanvasMode } from '../../lib/canvasMode';

/**
 * The few Connect styling choices that differ by look (Canvas Mode). The host
 * names the look once; the panel, the targeting body and the picker read it
 * from their `look` prop rather than from the canvas mode.
 */
export function connectAimTarget(look: CanvasMode): 'a glowing planet' | 'a person' {
  return look === 'paper' ? 'a person' : 'a glowing planet';
}

/** Paper's colours are CSS variables, which `alpha()` cannot read. */
export function pickerChoiceTint(look: CanvasMode, accent: string, connectAccent: string): string {
  return look === 'paper' ? `color-mix(in srgb, ${connectAccent} 20%, transparent)` : alpha(accent, 0.2);
}

export function pickerConfirmInk(look: CanvasMode, ink: { onAccent: string; strong: string }): string {
  return look === 'paper' ? ink.onAccent : ink.strong;
}
