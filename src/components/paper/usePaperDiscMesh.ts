import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

const DISC_SEGMENTS = 40;

/** A Person's disc: a circle of radius 1 in an ink material that stays on top of the lines ending at its centre. */
export function usePaperDiscMesh(): { geometry: THREE.CircleGeometry; material: THREE.MeshBasicMaterial } {
  const geometry = useMemo(() => new THREE.CircleGeometry(1, DISC_SEGMENTS), []);
  // Lines end at disc centres, at the disc's own depth; the offset keeps the disc on top there.
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    []
  );
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => material.dispose(), [material]);
  return { geometry, material };
}
