import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Emphasis } from './focusEmphasis';
import type { PaperLayout } from './paperLayout';
import {
  paperFlySmoothTime,
  paperFlyTo,
  paperRippleProgress,
  paperRipplePulse,
  paperWobble,
  PAPER_RIPPLE_SECONDS,
  type PaperFlyInput,
} from './paperFocus';

const FOV = 50;

function onScreen(fly: { position: THREE.Vector3Like; target: THREE.Vector3Like }, point: THREE.Vector3Like, width: number, height: number) {
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 1, 100000);
  camera.position.set(fly.position.x, fly.position.y, fly.position.z);
  camera.lookAt(fly.target.x, fly.target.y, fly.target.z);
  camera.updateMatrixWorld();
  const ndc = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
}

const person = { x: 40, y: -10, z: 25 };
const camera = { position: { x: 0, y: 0, z: 400 }, target: { x: 0, y: 0, z: 0 } };

function flyInput(width: number, height: number, inset: { rightPx: number; bottomPx: number }): PaperFlyInput {
  return { person, radius: 5, from: camera, viewport: { width, height }, inset, fovDegrees: FOV };
}

describe('paperFlyTo', () => {
  it('puts the Person in the middle of the screen when nothing covers it', () => {
    const fly = paperFlyTo(flyInput(1440, 900, { rightPx: 0, bottomPx: 0 }));
    const at = onScreen(fly, person, 1440, 900);
    expect(at.x).toBeCloseTo(720, 3);
    expect(at.y).toBeCloseTo(450, 3);
  });

  it('on a portrait phone, lands the Person in the middle of the space above the bottom sheet', () => {
    const sheet = 0.45 * 844;
    const fly = paperFlyTo(flyInput(390, 844, { rightPx: 0, bottomPx: sheet }));
    const at = onScreen(fly, person, 390, 844);
    expect(at.x).toBeCloseTo(195, 3);
    expect(at.y).toBeCloseTo((844 - sheet) / 2, 3);
    expect(at.y).toBeLessThan(844 - sheet);
  });

  it('on a landscape screen, lands the Person in the middle of the space left of the side drawer', () => {
    const fly = paperFlyTo(flyInput(1440, 900, { rightPx: 400, bottomPx: 0 }));
    const at = onScreen(fly, person, 1440, 900);
    expect(at.x).toBeCloseTo(520, 3);
    expect(at.y).toBeCloseTo(450, 3);
  });

  it('stands further back on a portrait phone, so the relatives fit the narrow space', () => {
    const distance = (fly: ReturnType<typeof paperFlyTo>) =>
      new THREE.Vector3(fly.position.x, fly.position.y, fly.position.z).distanceTo(new THREE.Vector3(fly.target.x, fly.target.y, fly.target.z));
    const landscape = paperFlyTo(flyInput(1440, 900, { rightPx: 400, bottomPx: 0 }));
    const portrait = paperFlyTo(flyInput(390, 844, { rightPx: 0, bottomPx: 0.45 * 844 }));
    expect(distance(portrait)).toBeGreaterThan(2 * distance(landscape));
  });

  it('keeps the direction the camera was looking from', () => {
    const from = { position: { x: 300, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    const fly = paperFlyTo({ ...flyInput(1440, 900, { rightPx: 0, bottomPx: 0 }), from });
    expect(fly.position.x - fly.target.x).toBeGreaterThan(0);
    expect(fly.position.y - fly.target.y).toBeCloseTo(0, 6);
    expect(fly.position.z - fly.target.z).toBeCloseTo(0, 6);
  });

  it('looks from the front when the camera sits on its target', () => {
    const from = { position: { x: 1, y: 2, z: 3 }, target: { x: 1, y: 2, z: 3 } };
    const fly = paperFlyTo({ ...flyInput(1440, 900, { rightPx: 0, bottomPx: 0 }), from });
    expect([fly.position.x, fly.position.y, fly.position.z].every(Number.isFinite)).toBe(true);
    expect(fly.position.z).toBeGreaterThan(fly.target.z);
  });

  it('still frames the Person when looking straight down', () => {
    const from = { position: { x: 0, y: 500, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    const fly = paperFlyTo({ ...flyInput(390, 844, { rightPx: 0, bottomPx: 0 }), from });
    expect([fly.position.x, fly.position.y, fly.position.z, fly.target.x, fly.target.y, fly.target.z].every(Number.isFinite)).toBe(true);
  });
});

describe('paperFlySmoothTime', () => {
  it('turns a flight time into a smoothing time that lands in about that long', () => {
    const smoothTime = paperFlySmoothTime(1);
    const omega = 2 / smoothTime;
    const left = (t: number) => (1 + omega * t) * Math.exp(-omega * t);
    expect(left(0.5)).toBeGreaterThan(0.1);
    expect(left(1)).toBeLessThan(0.05);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('falls back to a finite smoothing time for %s', (seconds) => {
    expect(paperFlySmoothTime(seconds)).toBe(paperFlySmoothTime(1));
  });
});

describe('paperRippleProgress', () => {
  it('runs from 0 to 1 over the ripple, always moving forward', () => {
    expect(paperRippleProgress(0)).toBe(0);
    const samples = [0.1, 0.3, 0.5, 0.7].map((share) => paperRippleProgress(share * PAPER_RIPPLE_SECONDS)!);
    samples.reduce((previous, progress) => {
      expect(progress).toBeGreaterThan(previous);
      expect(progress).toBeLessThan(1);
      return progress;
    }, 0);
  });

  it.each([-0.1, PAPER_RIPPLE_SECONDS, PAPER_RIPPLE_SECONDS + 5, NaN, Infinity])('is over (null) at %s s', (seconds) => {
    expect(paperRippleProgress(seconds)).toBeNull();
  });
});

describe('paperRipplePulse', () => {
  it('starts at the focused Person, runs out along the line and leaves at the far end', () => {
    expect(paperRipplePulse(0)).toEqual({ tail: 0, head: 0 });
    const mid = paperRipplePulse(0.5);
    expect(mid.head).toBeGreaterThan(mid.tail);
    expect(mid.tail).toBeGreaterThan(0);
    expect(mid.head).toBeLessThan(1);
    expect(paperRipplePulse(1)).toEqual({ tail: 1, head: 1 });
  });

  it('keeps the pulse on the line', () => {
    for (const progress of [0, 0.05, 0.2, 0.5, 0.8, 0.95, 1]) {
      const { tail, head } = paperRipplePulse(progress);
      expect(tail).toBeGreaterThanOrEqual(0);
      expect(head).toBeLessThanOrEqual(1);
      expect(tail).toBeLessThanOrEqual(head);
    }
  });
});

describe('paperWobble', () => {
  const layout: PaperLayout = new Map([
    ['focus', { x: 0, y: 0, z: 0, radius: 8 }],
    ['mum', { x: 30, y: 0, z: 0, radius: 6 }],
    ['son', { x: 0, y: -30, z: 0, radius: 4 }],
    ['stranger', { x: 90, y: 90, z: 0, radius: 5 }],
  ]);
  const emphasis = new Map<string, Emphasis>([
    ['focus', 'focused'],
    ['mum', 'relative'],
    ['son', 'relative'],
    ['stranger', 'ghost'],
  ]);

  it('moves only the relatives', () => {
    const wobble = paperWobble(layout, emphasis, 2.3);
    expect([...wobble.keys()].sort()).toEqual(['mum', 'son']);
  });

  it('keeps each relative close to their place', () => {
    for (const seconds of [1, 2.3, 7.9]) {
      for (const offset of paperWobble(layout, emphasis, seconds).values()) {
        expect(Math.hypot(offset.x, offset.y, offset.z)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps moving over time', () => {
    const at = (seconds: number) => paperWobble(layout, emphasis, seconds).get('mum')!;
    expect(at(2)).not.toEqual(at(2.5));
  });

  it('starts from rest, so nobody jumps when the focus begins', () => {
    for (const offset of paperWobble(layout, emphasis, 0).values()) {
      expect(Math.hypot(offset.x, offset.y, offset.z)).toBe(0);
    }
  });

  it('leaves the layout as it was', () => {
    const before = structuredClone([...layout]);
    paperWobble(layout, emphasis, 3.7);
    expect([...layout]).toEqual(before);
  });

  it('moves nobody with no Person focused', () => {
    const hover = new Map<string, Emphasis>([
      ['focus', 'hovered'],
      ['mum', 'relative'],
    ]);
    expect(paperWobble(layout, hover, 3).size).toBe(0);
  });
});
