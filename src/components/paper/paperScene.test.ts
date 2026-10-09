import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  depthFade,
  isBackgroundTap,
  isTap,
  paperFrame,
  paperLabelSize,
  paperLineSegments,
  paperLineShown,
  paperScreenPoint,
  setPaperSegment,
  TAP_SLOP_PX,
} from './paperScene';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';

const layout: PaperLayout = new Map([
  ['a', { x: -10, y: 0, z: 0, radius: 2 }],
  ['b', { x: 10, y: 0, z: 0, radius: 4 }],
  ['c', { x: 0, y: 6, z: 0, radius: 1 }],
]);

function line(sourceId: string, targetId: string, type: PaperLine['type']): PaperLine {
  return { sourceId, targetId, type, link: { source: sourceId, target: targetId, type } };
}

describe('paperFrame', () => {
  it('centres on the middle of the discs and reaches the outer edge of the farthest one', () => {
    const frame = paperFrame(layout, ['a', 'b', 'c']);
    expect(frame.center).toEqual({ x: 0, y: 3, z: 0 });
    expect(frame.radius).toBeCloseTo(Math.hypot(10, 3) + 4);
  });

  it('frames only the Persons it is given, and skips ids with no disc', () => {
    const frame = paperFrame(layout, ['a', 'missing']);
    expect(frame.center).toEqual({ x: -10, y: 0, z: 0 });
    expect(frame.radius).toBe(2);
  });

  it('has a small radius rather than none when nobody is shown', () => {
    const frame = paperFrame(layout, []);
    expect(frame.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(frame.radius).toBeGreaterThan(0);
  });
});

describe('depthFade', () => {
  it('is full ink up to where the fade starts', () => {
    expect(depthFade(5, 10, 20)).toBe(1);
    expect(depthFade(10, 10, 20)).toBe(1);
  });

  it('is gone from where the fade ends', () => {
    expect(depthFade(20, 10, 20)).toBe(0);
    expect(depthFade(99, 10, 20)).toBe(0);
  });

  it('fades evenly in between', () => {
    expect(depthFade(15, 10, 20)).toBeCloseTo(0.5);
    expect(depthFade(17.5, 10, 20)).toBeCloseTo(0.25);
  });

  it('steps at the start when the window is empty', () => {
    expect(depthFade(9, 10, 10)).toBe(1);
    expect(depthFade(11, 10, 10)).toBe(0);
  });
});

describe('isTap', () => {
  it('counts a small pointer movement as a click', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 104 })).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: TAP_SLOP_PX, y: 0 })).toBe(true);
  });

  it('counts a longer movement as a drag', () => {
    expect(isTap({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
    expect(isTap({ x: 0, y: 0 }, { x: 0, y: 30 })).toBe(false);
  });

  it('counts a release with no recorded press as a click', () => {
    expect(isTap(null, { x: 0, y: 30 })).toBe(true);
  });
});

describe('paperLabelSize', () => {
  it('draws the labels of larger discs bigger and bolder', () => {
    const small = paperLabelSize(4);
    const large = paperLabelSize(14);
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
    expect(large.weight).toBeGreaterThan(small.weight);
  });

  it('keeps the weight between regular and bold', () => {
    expect(paperLabelSize(0).weight).toBeGreaterThanOrEqual(0);
    expect(paperLabelSize(100).weight).toBeLessThanOrEqual(1);
  });
});

describe('paperLineSegments', () => {
  it('groups the lines by kind as start and end points', () => {
    const segments = paperLineSegments(
      [line('a', 'b', 'marriage'), line('a', 'c', 'parent'), line('b', 'c', 'divorce'), line('c', 'b', 'parent')],
      layout
    );
    expect(segments.marriage).toEqual([[-10, 0, 0], [10, 0, 0]]);
    expect(segments.divorce).toEqual([[10, 0, 0], [0, 6, 0]]);
    expect(segments.parent).toEqual([[-10, 0, 0], [0, 6, 0], [0, 6, 0], [10, 0, 0]]);
  });

  it('leaves out a line whose Person has no disc', () => {
    const segments = paperLineSegments([line('a', 'missing', 'parent')], layout);
    expect(segments.parent).toEqual([]);
  });
});

describe('isBackgroundTap', () => {
  const down = { x: 200, y: 200 };

  it('clears the selection on a background tap that moves 3 to 6 px', () => {
    for (const moved of [3, 4, 5, TAP_SLOP_PX]) {
      expect(isBackgroundTap(down, { x: down.x + moved, y: down.y }, false)).toBe(true);
    }
  });

  it('keeps the selection when the pointer moves more than 6 px, a camera drag', () => {
    expect(isBackgroundTap(down, { x: down.x + TAP_SLOP_PX + 1, y: down.y }, false)).toBe(false);
    expect(isBackgroundTap(down, { x: down.x + 20, y: down.y + 20 }, false)).toBe(false);
  });

  it('keeps the selection when the tap lands on a Person', () => {
    expect(isBackgroundTap(down, { x: down.x + 4, y: down.y }, true)).toBe(false);
  });
});

describe('paperScreenPoint: where a scene point lands on the canvas, in CSS pixels', () => {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const size = { width: 800, height: 600 };

  it('puts the point the camera looks at in the middle of the canvas', () => {
    expect(paperScreenPoint({ x: 0, y: 0, z: 0 }, camera, size)).toEqual({ x: 400, y: 300 });
  });

  it('puts the top edge of the view at y 0 and its right edge at the canvas width', () => {
    const halfHeight = 100 * Math.tan(THREE.MathUtils.degToRad(25));
    const top = paperScreenPoint({ x: 0, y: halfHeight, z: 0 }, camera, size);
    expect(top.x).toBeCloseTo(400);
    expect(top.y).toBeCloseTo(0);
    const right = paperScreenPoint({ x: halfHeight * (800 / 600), y: 0, z: 0 }, camera, size);
    expect(right.x).toBeCloseTo(800);
    expect(right.y).toBeCloseTo(300);
  });

  it('follows the camera once it has moved', () => {
    const moved = camera.clone();
    moved.position.set(20, 0, 100);
    moved.lookAt(20, 0, 0);
    moved.updateMatrixWorld();
    expect(paperScreenPoint({ x: 20, y: 0, z: 0 }, moved, size)).toEqual({ x: 400, y: 300 });
  });
});

function dreiSegmentsGeometry(segments: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  const ends = new THREE.InstancedInterleavedBuffer(new Float32Array(segments * 6), 6, 1);
  geometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(ends, 3, 0));
  geometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(ends, 3, 3));
  const distances = new THREE.InstancedInterleavedBuffer(new Float32Array(segments * 2), 2, 1);
  geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(distances, 1, 0));
  geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(distances, 1, 1));
  return { geometry, ends, distances };
}

const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const bufferOf = (geometry: THREE.BufferGeometry, name: string) => (geometry.attributes[name] as THREE.InterleavedBufferAttribute).data;

describe('setPaperSegment: moving one segment of a fat line in place', () => {
  it('writes the ends and the dash distances into the buffers the line already has', () => {
    const { geometry, ends, distances } = dreiSegmentsGeometry(1);
    expect(setPaperSegment(geometry, 0, at(0, 0, 0), at(3, 4, 0))).toBe(true);
    expect(bufferOf(geometry, 'instanceStart')).toBe(ends);
    expect(bufferOf(geometry, 'instanceDistanceStart')).toBe(distances);
    expect([...ends.array]).toEqual([0, 0, 0, 3, 4, 0]);
    expect([...distances.array]).toEqual([0, 5]);
    expect(ends.version).toBe(1);
    expect(distances.version).toBe(1);
  });

  it('uploads nothing when the segment has not moved', () => {
    const { geometry, ends, distances } = dreiSegmentsGeometry(1);
    setPaperSegment(geometry, 0, at(1.1, 2.2, 3.3), at(4, 5, 6));
    expect(setPaperSegment(geometry, 0, at(1.1, 2.2, 3.3), at(4, 5, 6))).toBe(false);
    expect(ends.version).toBe(1);
    expect(distances.version).toBe(1);
  });

  it('updates the distances in place when the segment moves again', () => {
    const { geometry, distances } = dreiSegmentsGeometry(1);
    setPaperSegment(geometry, 0, at(0, 0, 0), at(3, 4, 0));
    setPaperSegment(geometry, 0, at(0, 0, 0), at(6, 8, 0));
    expect(bufferOf(geometry, 'instanceDistanceStart')).toBe(distances);
    expect([...distances.array]).toEqual([0, 10]);
  });

  it("starts each segment's dashes at its own start, whatever order the segments are written in", () => {
    const { geometry, distances } = dreiSegmentsGeometry(2);
    setPaperSegment(geometry, 1, at(10, 0, 0), at(10, 2, 0));
    setPaperSegment(geometry, 0, at(0, 0, 0), at(3, 4, 0));
    expect([...distances.array]).toEqual([0, 5, 0, 2]);
  });

  it("restarts drei's end-to-end dash distances at each segment's start, even for a segment that has not moved", () => {
    const { geometry, ends, distances } = dreiSegmentsGeometry(2);
    ends.array.set([0, 0, 0, 3, 4, 0, 10, 0, 0, 10, 2, 0]);
    distances.array.set([0, 5, 5, 7]);
    expect(setPaperSegment(geometry, 1, at(10, 0, 0), at(10, 2, 0))).toBe(false);
    expect([...distances.array]).toEqual([0, 5, 0, 2]);
    expect(ends.version).toBe(0);
  });
});

describe('paperLineShown: which lines the LINKS and ARROWS toggles draw', () => {
  const kinds = ['parent', 'marriage', 'divorce'] as const;

  it('draws every kind of line with LINKS on', () => {
    expect(kinds.map((type) => paperLineShown(type, { links: true, arrows: false }))).toEqual([true, true, true]);
  });

  it('keeps the parent lines, which carry the arrows, with LINKS off and ARROWS on, as Cosmos does', () => {
    expect(kinds.map((type) => paperLineShown(type, { links: false, arrows: true }))).toEqual([true, false, false]);
  });

  it('draws no line with both off', () => {
    expect(kinds.map((type) => paperLineShown(type, { links: false, arrows: false }))).toEqual([false, false, false]);
  });
});
