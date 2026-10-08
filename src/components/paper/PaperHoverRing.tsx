import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import { hoveredPerson } from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';

const RING_SCALE = 1.3;
const RING_WIDTH_PX = 1.25;
const RING_SEGMENTS = 64;

/** A thin ring around the hovered Person; its line stays the same width at any zoom. */
export function PaperHoverRing({ state, layout, ink }: { state: MutableRefObject<PaperEmphasisState>; layout: PaperLayout; ink: string }) {
  const group = useRef<THREE.Group>(null);
  const circle = useMemo(
    () =>
      Array.from({ length: RING_SEGMENTS + 1 }, (_, i) => {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        return [Math.cos(a), Math.sin(a), 0] as [number, number, number];
      }),
    []
  );

  useFrame(({ camera }) => {
    const ring = group.current;
    if (!ring) return;
    const { emphasis, drift } = state.current;
    const id = hoveredPerson(emphasis);
    const disc = id ? layout.get(id) : undefined;
    ring.visible = !!disc;
    if (!id || !disc) return;
    placeOf(layout, drift, id, ring.position);
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(disc.radius * RING_SCALE);
  });

  return (
    <group ref={group} visible={false}>
      <Line points={circle} fog color={ink} lineWidth={RING_WIDTH_PX} />
    </group>
  );
}
