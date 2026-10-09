import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { setTetherEnds } from './ghostPreviewTether';

function tetherGeometry() {
  return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
}

function distancesOf(geometry: THREE.BufferGeometry) {
  return geometry.attributes.lineDistance as THREE.BufferAttribute;
}

const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('setTetherEnds: moving the Ghost Preview tether', () => {
  it('lays the dashes out as three does', () => {
    const geometry = tetherGeometry();
    setTetherEnds(geometry, at(1.1, -2.2, 3.3), at(9.7, 4.4, -5.5));

    const reference = new THREE.Line(tetherGeometry());
    const positions = reference.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, 1.1, -2.2, 3.3);
    positions.setXYZ(1, 9.7, 4.4, -5.5);
    reference.computeLineDistances();
    const expected = distancesOf(reference.geometry);

    expect(distancesOf(geometry).getX(0)).toBe(0);
    expect(distancesOf(geometry).getX(1)).toBeCloseTo(expected.getX(1), 5);
    expect([...(geometry.attributes.position as THREE.BufferAttribute).array]).toEqual([
      ...positions.array,
    ]);
  });

  it('keeps one distance buffer and uploads nothing while the ends move together', () => {
    const geometry = tetherGeometry();
    setTetherEnds(geometry, at(0, 0, 0), at(3, 4, 0));
    const distances = distancesOf(geometry);
    const version = distances.version;

    setTetherEnds(geometry, at(10.1, -2.3, 7.7), at(13.1, 1.7, 7.7));
    setTetherEnds(geometry, at(-0.4, 6.6, 2.2), at(2.6, 10.6, 2.2));

    expect(distancesOf(geometry)).toBe(distances);
    expect(distances.version).toBe(version);
    expect([...distances.array]).toEqual([0, 5]);
  });

  it('updates the distances in place when the tether changes length', () => {
    const geometry = tetherGeometry();
    setTetherEnds(geometry, at(0, 0, 0), at(3, 4, 0));
    const distances = distancesOf(geometry);
    const version = distances.version;

    setTetherEnds(geometry, at(0, 0, 0), at(6, 8, 0));

    expect(distancesOf(geometry)).toBe(distances);
    expect(distances.version).toBeGreaterThan(version);
    expect([...distances.array]).toEqual([0, 10]);
  });

  it('moves the ends every time', () => {
    const geometry = tetherGeometry();
    setTetherEnds(geometry, at(0, 0, 0), at(3, 4, 0));
    setTetherEnds(geometry, at(1, 1, 1), at(4, 5, 1));

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    expect([...positions.array]).toEqual([1, 1, 1, 4, 5, 1]);
    expect(geometry.boundingSphere?.center.toArray()).toEqual([2.5, 3, 1]);
  });
});
