import { useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';
import { PAPER_DASH, PAPER_LINE_RENDER_ORDER, setPaperSegment } from './paperScene';

const PREVIEW_WIDTH_PX = 1.5;

/** The dashed ink line to the existing Person that AddRelativeModal's connect-to-existing would link. */
export function PaperPreviewLine({
  fromId,
  toId,
  layout,
  ink,
  state,
}: {
  fromId: string;
  toId: string;
  layout: PaperLayout;
  ink: string;
  state: MutableRefObject<PaperEmphasisState>;
}) {
  const ref = useRef<ElementRef<typeof Line>>(null);
  const points = useMemo(() => [[0, 0, 0] as [number, number, number], [0, 0, 0] as [number, number, number]], []);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);
  useFrame(() => {
    const segments = ref.current;
    if (!segments) return;
    const { from, to } = scratch;
    const { drift } = state.current;
    placeOf(layout, drift, fromId, from);
    placeOf(layout, drift, toId, to);
    if (setPaperSegment(segments.geometry, 0, from, to)) segments.geometry.computeBoundingSphere();
  });

  return (
    <Line
      ref={ref}
      points={points}
      segments
      fog
      renderOrder={PAPER_LINE_RENDER_ORDER + 1}
      depthWrite={false}
      color={ink}
      lineWidth={PREVIEW_WIDTH_PX}
      dashed
      {...PAPER_DASH}
    />
  );
}
