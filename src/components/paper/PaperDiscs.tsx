import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';

interface PaperDiscsProps {
  ids: readonly string[];
  layout: PaperLayout;
  ink: string;
  onPersonClick: (id: string, event: ThreeEvent<MouseEvent>) => void;
}

const DISC_SEGMENTS = 40;

/** Every shown Person as one flat ink disc, all in a single instanced draw that turns to face the camera each frame. */
export function PaperDiscs({ ids, layout, ink, onPersonClick }: PaperDiscsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, DISC_SEGMENTS), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: ink }), [ink]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => material.dispose(), [material]);

  const discs = useMemo(() => ids.map((id) => layout.get(id)!), [ids, layout]);

  const scratch = useMemo(
    () => ({ matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3() }),
    []
  );

  const place = useCallback(
    (quaternion: THREE.Quaternion) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const { matrix, position, scale } = scratch;
      discs.forEach((disc, i) => {
        position.set(disc.x, disc.y, disc.z);
        scale.setScalar(disc.radius);
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    [discs, scratch]
  );

  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    place(camera.quaternion);
    meshRef.current?.computeBoundingSphere();
  }, [place, camera]);

  useFrame(() => place(camera.quaternion));

  return (
    <instancedMesh
      key={discs.length}
      ref={meshRef}
      args={[geometry, material, discs.length]}
      onClick={(e) => {
        if (e.instanceId === undefined) return;
        e.stopPropagation();
        onPersonClick(ids[e.instanceId], e);
      }}
    />
  );
}
