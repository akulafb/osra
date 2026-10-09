import { useMemo, useRef, type ElementRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { PAPER_DASH, setPaperSegment } from './paperScene';

type PaperSegment = ElementRef<typeof Line>;

interface PaperSegmentLineProps {
  /** Sets the segment's ends each frame and returns whether it is drawn; it may also recolour the line. */
  place: (from: THREE.Vector3, to: THREE.Vector3, line: PaperSegment) => boolean;
  renderOrder: number;
  lineWidth: number;
  dashed: boolean;
  color?: string;
}

export function PaperSegmentLine({ place, renderOrder, lineWidth, dashed, color }: PaperSegmentLineProps) {
  const ref = useRef<PaperSegment>(null);
  const points = useMemo(() => [[0, 0, 0] as [number, number, number], [0, 0, 0] as [number, number, number]], []);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);

  useFrame(() => {
    const segment = ref.current;
    if (!segment) return;
    const { from, to } = scratch;
    const shown = place(from, to, segment);
    segment.visible = shown;
    if (shown && setPaperSegment(segment.geometry, 0, from, to)) segment.geometry.computeBoundingSphere();
  });

  return (
    <Line
      ref={ref}
      points={points}
      segments
      fog
      renderOrder={renderOrder}
      depthWrite={false}
      color={color}
      lineWidth={lineWidth}
      dashed={dashed}
      {...PAPER_DASH}
    />
  );
}
