import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { emphasisSubject, linesOf } from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';

const MAX_PARTICLES = 600;
const PARTICLE_SPACING = 18;
const PARTICLE_SPEED = 24;
const PARTICLE_SIZE_PX = 2.5;
const DOT_TEXTURE_PX = 32;

/** Round dots flowing out from the hovered or focused Person along each of their lines. */
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
  const dot = useMemo(roundDot, []);
  useLayoutEffect(() => () => dot.dispose(), [dot]);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);
  const flowing = useRef({ emphasis: null as PaperEmphasisState['emphasis'] | null, lines, subjectId: null as string | null, own: [] as PaperLine[] });

  useFrame(({ clock, gl }) => {
    const dots = points.current;
    if (!dots) return;
    const { emphasis, drift } = state.current;
    const cached = flowing.current;
    if (cached.emphasis !== emphasis || cached.lines !== lines) {
      const subjectId = emphasisSubject(emphasis);
      flowing.current = { emphasis, lines, subjectId, own: linesOf(lines, subjectId) };
    }
    const { subjectId, own } = flowing.current;
    (dots.material as THREE.PointsMaterial).size = PARTICLE_SIZE_PX * gl.getPixelRatio();

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const time = clock.getElapsedTime();
    let n = 0;
    for (const line of own) {
      const otherId = line.sourceId === subjectId ? line.targetId : line.sourceId;
      const { from, to } = scratch;
      placeOf(layout, drift, subjectId!, from);
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
      <pointsMaterial color={ink} map={dot} alphaTest={0.5} sizeAttenuation={false} fog />
    </points>
  );
}

/** A white disc on a clear square, so each point draws as a round dot. */
function roundDot(): THREE.DataTexture {
  const data = new Uint8Array(DOT_TEXTURE_PX * DOT_TEXTURE_PX * 4);
  const middle = (DOT_TEXTURE_PX - 1) / 2;
  for (let y = 0; y < DOT_TEXTURE_PX; y++) {
    for (let x = 0; x < DOT_TEXTURE_PX; x++) {
      const i = (y * DOT_TEXTURE_PX + x) * 4;
      data.fill(255, i, i + 3);
      data[i + 3] = Math.hypot(x - middle, y - middle) <= DOT_TEXTURE_PX / 2 ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, DOT_TEXTURE_PX, DOT_TEXTURE_PX);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
