import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import { hoveredPerson } from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';
import { PAPER_RING_POINTS } from './paperScene';

const RING_SCALE = 1.3;
const RING_WIDTH_PX = 1.25;

/** A thin ring around the hovered Person; its line stays the same width at any zoom. */
export function PaperHoverRing({ state, layout, ink }: { state: MutableRefObject<PaperEmphasisState>; layout: PaperLayout; ink: string }) {
  const group = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const ring = group.current;
    if (!ring) return;
    const { emphasis } = state.current;
    const id = hoveredPerson(emphasis);
    const disc = id ? layout.get(id) : undefined;
    ring.visible = !!disc;
    if (!id || !disc) return;
    placeOf(layout, state.current, id, ring.position);
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(disc.radius * RING_SCALE);
  });

  return (
    <group ref={group} visible={false}>
      <Line points={PAPER_RING_POINTS} fog color={ink} lineWidth={RING_WIDTH_PX} />
    </group>
  );
}
