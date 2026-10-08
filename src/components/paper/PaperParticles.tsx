import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { hoveredPerson, linesOf } from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';

const MAX_PARTICLES = 600;
const PARTICLE_SPACING = 18;
const PARTICLE_SPEED = 24;
const PARTICLE_SIZE_PX = 2.5;

/** Dots flowing out from the hovered Person along each of their lines. */
export function PaperParticles({
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
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);
  const flowing = useRef({ emphasis: null as PaperEmphasisState['emphasis'] | null, lines, hoveredId: null as string | null, own: [] as PaperLine[] });

  useFrame(({ clock, gl }) => {
    const dots = points.current;
    if (!dots) return;
    const { emphasis, drift } = state.current;
    const cached = flowing.current;
    if (cached.emphasis !== emphasis || cached.lines !== lines) {
      const hoveredId = hoveredPerson(emphasis);
      flowing.current = { emphasis, lines, hoveredId, own: linesOf(lines, hoveredId) };
    }
    const { hoveredId, own } = flowing.current;
    (dots.material as THREE.PointsMaterial).size = PARTICLE_SIZE_PX * gl.getPixelRatio();

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const time = clock.getElapsedTime();
    let n = 0;
    for (const line of own) {
      const otherId = line.sourceId === hoveredId ? line.targetId : line.sourceId;
      const { from, to } = scratch;
      placeOf(layout, drift, hoveredId!, from);
      placeOf(layout, drift, otherId, to);
      const length = from.distanceTo(to);
      if (length === 0) continue;
      const count = Math.max(1, Math.round(length / PARTICLE_SPACING));
      for (let i = 0; i < count && n < MAX_PARTICLES; i++, n++) {
        const t = ((time * PARTICLE_SPEED) / length + i / count) % 1;
        position.setXYZ(n, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
      }
    }
    if (n > 0) {
      position.clearUpdateRanges();
      position.addUpdateRange(0, n * 3);
      position.needsUpdate = true;
    }
    geometry.setDrawRange(0, n);
    dots.visible = n > 0;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <pointsMaterial color={ink} sizeAttenuation={false} fog />
    </points>
  );
}
