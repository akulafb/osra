import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { focusEmphasis } from './focusEmphasis';
import { layoutPaperTree, type PaperLayout } from './paperLayout';
import { paperFlyTo, paperFocusReach } from './paperFocus';
import { paperFrame } from '../components/paper/paperScene';
import { KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';
import {
  paperCameraLimits,
  paperFitDistance,
  paperIdleRotates,
  paperIdleRotateSpeed,
  PAPER_IDLE_SECONDS,
  type PaperCameraLimits,
} from './paperCamera';

const FOV = 50;

describe('paperIdleRotates', () => {
  it('waits for the idle pause before turning', () => {
    expect(paperIdleRotates(0, false)).toBe(false);
    expect(paperIdleRotates(PAPER_IDLE_SECONDS - 0.01, false)).toBe(false);
    expect(paperIdleRotates(PAPER_IDLE_SECONDS, false)).toBe(true);
    expect(paperIdleRotates(60, false)).toBe(true);
  });

  it('holds still while a Person is focused, however long the view is idle', () => {
    expect(paperIdleRotates(PAPER_IDLE_SECONDS, true)).toBe(false);
    expect(paperIdleRotates(600, true)).toBe(false);
  });

  it('holds still when the idle time is not a number', () => {
    expect(paperIdleRotates(Number.NaN, false)).toBe(false);
  });

  it('pauses for about three seconds', () => {
    expect(PAPER_IDLE_SECONDS).toBe(3);
  });
});

describe('paperIdleRotateSpeed', () => {
  it('moves a point at the screen edge about 15 px a second', () => {
    for (const width of [390, 935, 1440]) {
      const edgePxPerSecond = paperIdleRotateSpeed(width) * (width / 2);
      expect(edgePxPerSecond).toBeGreaterThanOrEqual(10);
      expect(edgePxPerSecond).toBeLessThanOrEqual(20);
    }
  });

  it('does not turn a canvas with no width', () => {
    expect(paperIdleRotateSpeed(0)).toBe(0);
    expect(paperIdleRotateSpeed(Number.NaN)).toBe(0);
  });
});

describe('paperFitDistance', () => {
  it('matches the distance that frames the sphere on the narrower side', () => {
    for (const aspect of [1440 / 900, 390 / 844]) {
      const distance = paperFitDistance(100, FOV, aspect);
      const camera = new THREE.PerspectiveCamera(FOV, aspect, 1, 100000);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
      expect(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(), 99))).toBe(true);
      expect(frustum.containsPoint(new THREE.Vector3(99, 0, 0))).toBe(true);
      expect(frustum.containsPoint(new THREE.Vector3(0, 99, 0))).toBe(true);
    }
  });
});

function inBoundary(limits: PaperCameraLimits, p: THREE.Vector3Like) {
  const { min, max } = limits.boundary;
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

const VIEWPORTS = [
  { name: 'desktop with the side drawer', width: 1440, height: 900, inset: { rightPx: 400, bottomPx: 0 } },
  { name: 'tablet with the bottom sheet', width: 820, height: 812, inset: { rightPx: 0, bottomPx: 812 * 0.45 } },
  { name: 'portrait phone with the bottom sheet', width: 390, height: 844, inset: { rightPx: 0, bottomPx: 844 * 0.45 } },
  { name: 'landscape phone with the bottom sheet', width: 844, height: 390, inset: { rightPx: 0, bottomPx: 390 * 0.45 } },
];

function everyFocusFlyFits(layout: PaperLayout, links: typeof KINSHIP_FIXTURE_TREE.links) {
  const ids = [...layout.keys()];
  const frame = paperFrame(layout, ids);
  for (const viewport of VIEWPORTS) {
    const limits = paperCameraLimits(frame, FOV, viewport.width / viewport.height);
    const overview = paperFitDistance(frame.radius, FOV, viewport.width / viewport.height);
    expect(overview, viewport.name).toBeLessThanOrEqual(limits.maxDistance);
    expect(inBoundary(limits, frame.center), viewport.name).toBe(true);

    for (const id of ids) {
      const disc = layout.get(id)!;
      const emphasis = focusEmphasis({ personIds: ids, links, hoveredId: null, focusedId: id, searchMatchIds: null });
      const fly = paperFlyTo({
        person: disc,
        reach: paperFocusReach(layout, disc, emphasis),
        from: { position: { x: frame.center.x, y: frame.center.y, z: frame.center.z + overview }, target: frame.center },
        viewport: { width: viewport.width, height: viewport.height },
        inset: viewport.inset,
        fovDegrees: FOV,
      });
      const distance = new THREE.Vector3().subVectors(fly.position, fly.target).length();
      expect(distance, `${viewport.name}: ${id}`).toBeGreaterThanOrEqual(limits.minDistance);
      expect(distance, `${viewport.name}: ${id}`).toBeLessThanOrEqual(limits.maxDistance);
      expect(inBoundary(limits, fly.target), `${viewport.name}: ${id}`).toBe(true);
    }
  }
}

describe('paperCameraLimits', () => {
  it('lets the camera reach the overview and every focus flight on the fixture tree', () => {
    const layout = layoutPaperTree(KINSHIP_FIXTURE_TREE);
    everyFocusFlyFits(layout, KINSHIP_FIXTURE_TREE.links);
    const frame = paperFrame(layout, layout.keys());
    for (const viewport of VIEWPORTS) {
      const aspect = viewport.width / viewport.height;
      expect(paperFitDistance(frame.radius, FOV, aspect)).toBeGreaterThanOrEqual(paperCameraLimits(frame, FOV, aspect).minDistance);
    }
  });

  it('lets the camera reach the focus flight for a lone Person', () => {
    const lone = new Map([['solo', { x: 12, y: -4, z: 7, radius: 4 }]]);
    everyFocusFlyFits(lone, []);
  });

  it('stops zooming out a few overviews back, and zooming in before a disc fills the screen', () => {
    const frame = paperFrame(layoutPaperTree(KINSHIP_FIXTURE_TREE), layoutPaperTree(KINSHIP_FIXTURE_TREE).keys());
    const aspect = 1440 / 900;
    const limits = paperCameraLimits(frame, FOV, aspect);
    const overview = paperFitDistance(frame.radius, FOV, aspect);
    expect(limits.maxDistance).toBeGreaterThanOrEqual(2 * overview);
    expect(limits.maxDistance).toBeLessThanOrEqual(5 * overview);
    const visibleHeightAtMin = 2 * limits.minDistance * Math.tan((FOV * Math.PI) / 360);
    expect(visibleHeightAtMin).toBeGreaterThan(2 * 14);
  });

  it('brings the tree back on screen when zoomed all the way out from any corner of the box', () => {
    for (const radius of [30, 200, 900]) {
      const frame = { center: { x: 5, y: -8, z: 12 }, radius };
      for (const viewport of VIEWPORTS) {
        const aspect = viewport.width / viewport.height;
        const { boundary, maxDistance } = paperCameraLimits(frame, FOV, aspect);
        const corner = new THREE.Vector3(boundary.max.x, boundary.max.y, boundary.min.z);
        const camera = new THREE.PerspectiveCamera(FOV, aspect, 1, 100000);
        camera.position.copy(corner).add(new THREE.Vector3(0, 0, maxDistance));
        camera.lookAt(corner);
        camera.updateMatrixWorld();
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        );
        expect(frustum.containsPoint(new THREE.Vector3(frame.center.x, frame.center.y, frame.center.z)), `${radius} ${viewport.name}`).toBe(true);
      }
    }
  });

  it('keeps the orbit point near the tree', () => {
    const frame = { center: { x: 10, y: 20, z: 30 }, radius: 200 };
    const limits = paperCameraLimits(frame, FOV, 1.5);
    expect(inBoundary(limits, { x: 10 + 200, y: 20, z: 30 })).toBe(true);
    expect(inBoundary(limits, { x: 10 + 2000, y: 20, z: 30 })).toBe(false);
    expect(inBoundary(limits, { x: 10, y: 20, z: 30 - 2000 })).toBe(false);
  });
});
