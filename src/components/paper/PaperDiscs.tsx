import { useCallback, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import { fadeInk, inkOf, placeOf, revealOf, type PaperEmphasisState } from './paperEmphasis';

interface PaperDiscsProps {
  ids: readonly string[];
  layout: PaperLayout;
  ink: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
  onPersonClick: (id: string, event: ThreeEvent<MouseEvent>) => void;
  onPersonDoubleClick?: (id: string) => void;
}

const DISC_SEGMENTS = 40;

/** Every shown Person as one flat ink disc, all in a single instanced draw that turns to face the camera each frame and fades with the emphasis. */
export function PaperDiscs({ ids, layout, ink, paper, state, onPersonClick, onPersonDoubleClick }: PaperDiscsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, DISC_SEGMENTS), []);
  // Lines end at disc centres, at the disc's own depth; the offset keeps the disc on top there.
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    []
  );
  const colours = useMemo(() => ({ ink: new THREE.Color(ink), paper: new THREE.Color(paper), disc: new THREE.Color() }), [ink, paper]);

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
      const { drift } = state.current;
      discs.forEach((disc, i) => {
        placeOf(layout, drift, ids[i], position);
        scale.setScalar(disc.radius * revealOf(state.current, ids[i]));
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    [discs, ids, layout, scratch, state]
  );

  const paint = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    ids.forEach((id, i) => mesh.setColorAt(i, fadeInk(colours.ink, colours.paper, inkOf(state.current, id), colours.disc)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ids, colours, state]);

  const camera = useThree((three) => three.camera);
  const placedFacing = useMemo(() => new THREE.Quaternion(), []);
  const drawn = useRef<Partial<PaperEmphasisState>>({});
  useLayoutEffect(() => {
    place(camera.quaternion);
    placedFacing.copy(camera.quaternion);
    paint();
    drawn.current = state.current;
    meshRef.current?.computeBoundingSphere();
  }, [place, paint, camera, placedFacing, state]);

  useFrame(() => {
    const { emphasis, drift } = state.current;
    if (!placedFacing.equals(camera.quaternion) || drift !== drawn.current.drift) {
      place(camera.quaternion);
      placedFacing.copy(camera.quaternion);
    }
    if (emphasis !== drawn.current.emphasis) paint();
    drawn.current = state.current;
  });

  return (
    <instancedMesh
      key={discs.length}
      ref={meshRef}
      args={[geometry, material, discs.length]}
      onClick={(e) => {
        if (e.instanceId === undefined) return;
        e.stopPropagation();
        onPersonClick(state.current.pointedId ?? ids[e.instanceId], e);
      }}
      onDoubleClick={(e) => {
        if (e.instanceId === undefined || !onPersonDoubleClick) return;
        e.stopPropagation();
        onPersonDoubleClick(state.current.pointedId ?? ids[e.instanceId]);
      }}
    />
  );
}
