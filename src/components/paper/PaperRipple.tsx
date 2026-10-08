import { useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { linesOf } from '../../lib/paperHover';
import { paperRippleProgress, paperRipplePulse } from '../../lib/paperFocus';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';

const MAX_RIPPLE_LINES = 64;
const RIPPLE_WIDTH_PX = 6;

/** A pulse of ink that runs out along each of the focused Person's lines when the focus begins, like a plucked string. */
export function PaperRipple({
  state,
  layout,
  lines,
  ink,
}: {
  state: MutableRefObject<PaperEmphasisState>;
  layout: PaperLayout;
  lines: readonly PaperLine[];
  ink: string;
}) {
  const ref = useRef<ElementRef<typeof Line>>(null);
  const points = useMemo(() => Array.from({ length: MAX_RIPPLE_LINES * 2 }, () => [0, 0, 0] as [number, number, number]), []);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), out: new THREE.Vector3() }), []);
  const rippling = useRef({ focus: null as PaperEmphasisState['focus'], lines, own: [] as PaperLine[] });

  useFrame(({ clock }) => {
    const segments = ref.current;
    if (!segments) return;
    const { focus, drift } = state.current;
    if (rippling.current.focus !== focus || rippling.current.lines !== lines) {
      rippling.current = { focus, lines, own: focus ? linesOf(lines, focus.id).slice(0, MAX_RIPPLE_LINES) : [] };
    }
    const progress = focus ? paperRippleProgress(clock.elapsedTime - focus.since) : null;
    segments.visible = progress !== null && rippling.current.own.length > 0;
    if (!focus || progress === null) return;

    const { tail, head } = paperRipplePulse(progress);
    const { geometry } = segments;
    const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const positions = start.data.array as Float32Array;
    const { from, to, out } = scratch;
    rippling.current.own.forEach((line, i) => {
      const otherId = line.sourceId === focus.id ? line.targetId : line.sourceId;
      placeOf(layout, drift, focus.id, from);
      placeOf(layout, drift, otherId, to);
      const length = from.distanceTo(to);
      const startShare = length > 0 ? Math.min(0.5, (layout.get(focus.id)?.radius ?? 0) / length) : 0;
      const endShare = length > 0 ? Math.max(0.5, 1 - (layout.get(otherId)?.radius ?? 0) / length) : 1;
      const along = (share: number) => startShare + (endShare - startShare) * share;
      out.lerpVectors(from, to, along(tail)).toArray(positions, i * 6);
      out.lerpVectors(from, to, along(head)).toArray(positions, i * 6 + 3);
    });
    start.data.needsUpdate = true;
    geometry.instanceCount = rippling.current.own.length;
    geometry.computeBoundingSphere();
  });

  return <Line ref={ref} points={points} segments fog color={ink} lineWidth={RIPPLE_WIDTH_PX} visible={false} />;
}
