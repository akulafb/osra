import { describe, it, expect } from 'vitest';
import {
  classifyTargetVisibility,
  isBehindCamera,
  countUnreachable,
  TARGET_EDGE_MARGIN,
} from './connectTargeting';

const viewport = { width: 1000, height: 800 };

const at = (x: number, y: number, viewSpaceZ = -500) =>
  classifyTargetVisibility({ screen: { x, y }, viewSpaceZ, viewport });

describe('classifyTargetVisibility', () => {
  it('calls a target in the middle of the viewport reachable by aim', () => {
    expect(at(500, 400)).toBe('onscreen');
  });

  it('calls a target past the viewport edge off-screen', () => {
    expect(at(-40, 400)).toBe('offscreen');
    expect(at(1400, 400)).toBe('offscreen');
    expect(at(500, -10)).toBe('offscreen');
    expect(at(500, 900)).toBe('offscreen');
  });

  it('counts a target hugging the edge as off-screen, where the docked panel and HUD sit', () => {
    expect(at(TARGET_EDGE_MARGIN / 2, 400)).toBe('offscreen');
    expect(at(TARGET_EDGE_MARGIN + 1, 400)).toBe('onscreen');
  });

  it('calls a target behind the camera behind, not off-screen', () => {
    // three.js cameras look down -Z in view space, so a positive depth is behind.
    expect(classifyTargetVisibility({ screen: { x: 500, y: 400 }, viewSpaceZ: 120, viewport })).toBe(
      'behind'
    );
  });

  it('trusts depth over the projection, which mirrors a point behind the camera into view', () => {
    // Screen coordinates alone would read as a perfectly aimable centre-screen hit.
    expect(classifyTargetVisibility({ screen: { x: 500, y: 400 }, viewSpaceZ: 1, viewport })).toBe(
      'behind'
    );
  });

  it('treats a target exactly on the camera plane as behind, since it cannot be aimed at', () => {
    expect(classifyTargetVisibility({ screen: { x: 500, y: 400 }, viewSpaceZ: 0, viewport })).toBe(
      'behind'
    );
  });

  it('refuses to guess from a projection that produced no numbers', () => {
    expect(classifyTargetVisibility({ screen: { x: NaN, y: 400 }, viewSpaceZ: -500, viewport })).toBe(
      'offscreen'
    );
  });

  it('does not call everything off-screen when the viewport has not been measured yet', () => {
    expect(
      classifyTargetVisibility({
        screen: { x: 500, y: 400 },
        viewSpaceZ: -500,
        viewport: { width: 0, height: 0 },
      })
    ).toBe('offscreen');
  });
});

describe('isBehindCamera', () => {
  it('splits on the camera plane', () => {
    expect(isBehindCamera(-1)).toBe(false);
    expect(isBehindCamera(0)).toBe(true);
    expect(isBehindCamera(1)).toBe(true);
  });
});

describe('countUnreachable', () => {
  it('counts the candidates no amount of aiming can reach', () => {
    expect(countUnreachable(['onscreen', 'offscreen', 'behind', 'onscreen'])).toBe(2);
  });

  it('is zero when every candidate is in view, so the hint can stay hidden', () => {
    expect(countUnreachable(['onscreen', 'onscreen'])).toBe(0);
    expect(countUnreachable([])).toBe(0);
  });
});
