import * as THREE from 'three';

/**
 * `computeLineDistances` allocates a new GPU buffer on every call and three never frees the one it replaces,
 * so the distances are written in place.
 */
export function setTetherEnds(geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3): void {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, to.x, to.y, to.z);
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();

  const length = Math.fround(from.distanceTo(to));
  const distances = geometry.attributes.lineDistance as THREE.BufferAttribute | undefined;
  if (!distances) {
    geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, length], 1));
    return;
  }
  if (distances.getX(1) === length) return;
  distances.setX(1, length);
  distances.needsUpdate = true;
}
