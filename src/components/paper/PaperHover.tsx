import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import { focusEmphasis } from '../../lib/focusEmphasis';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import {
  easeDrift,
  hoveredPerson,
  linesOf,
  nearestDiscAt,
  paperDrift,
  paperScreenRadius,
  type Point3,
  type ScreenDisc,
} from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';
import type { ScreenPoint } from './paperScene';

/** Before the camera-controls update and every other part of the scene (both run later in the frame). */
const HOVER_FRAME_PRIORITY = -1;
const LONGEST_FRAME_SECONDS = 0.1;

interface PaperHoverProps {
  state: MutableRefObject<PaperEmphasisState>;
  pointer: MutableRefObject<ScreenPoint | null>;
  layout: PaperLayout;
  ids: readonly string[];
  links: readonly FamilyLink[];
  selectedId: string | null;
}

/**
 * Finds the Person under the mouse, at most once a frame, and turns it into
 * the scene's emphasis (focusEmphasis: a selected Person outranks the hover)
 * and the lean of the hovered Person's relatives.
 */
export function PaperHover({ state, pointer, layout, ids, links, selectedId }: PaperHoverProps) {
  const inputs = useMemo(() => ({ layout, ids, links, selectedId }), [layout, ids, links, selectedId]);
  const seen = useRef({ pointer: null as ScreenPoint | null, inputs: null as typeof inputs | null, hoveredId: null as string | null });
  const camera = useRef(new THREE.Matrix4());
  const target = useRef(new Map<string, Point3>());
  const scratch = useMemo(() => ({ place: new THREE.Vector3(), view: new THREE.Vector3(), discs: [] as ScreenDisc[] }), []);

  useFrame(({ camera: cam, size, gl }, delta) => {
    const last = seen.current;
    const cameraMoved = !camera.current.equals(cam.matrixWorld);
    const changed = pointer.current !== last.pointer || inputs !== last.inputs || cameraMoved;

    let hoveredId = last.hoveredId;
    if (changed) {
      camera.current.copy(cam.matrixWorld);
      hoveredId = pointer.current ? personAt(pointer.current, inputs, state.current, cam, size, scratch) : null;
      gl.domElement.style.cursor = hoveredId ? 'pointer' : '';
    }

    if (hoveredId !== last.hoveredId || inputs !== last.inputs) {
      const emphasis = focusEmphasis({ personIds: ids, links, hoveredId, focusedId: selectedId, searchMatchIds: null });
      state.current = { ...state.current, emphasis };
      target.current = paperDrift(layout, emphasis);
    }
    seen.current = { pointer: pointer.current, inputs, hoveredId };

    if (state.current.drift.size > 0 || target.current.size > 0) {
      state.current = { ...state.current, drift: easeDrift(state.current.drift, target.current, Math.min(delta, LONGEST_FRAME_SECONDS)) };
    }
  }, HOVER_FRAME_PRIORITY);

  return null;
}

function personAt(
  pointer: ScreenPoint,
  { layout, ids }: { layout: PaperLayout; ids: readonly string[] },
  { drift }: PaperEmphasisState,
  camera: THREE.Camera,
  { width, height }: { width: number; height: number },
  scratch: { place: THREE.Vector3; view: THREE.Vector3; discs: ScreenDisc[] }
): string | null {
  if (!(camera instanceof THREE.PerspectiveCamera)) return null;
  const { place, view, discs } = scratch;
  discs.length = 0;
  for (const id of ids) {
    const disc = layout.get(id);
    if (!disc) continue;
    placeOf(layout, drift, id, place);
    const depth = -view.copy(place).applyMatrix4(camera.matrixWorldInverse).z;
    const radius = paperScreenRadius(disc.radius, depth, camera.fov, height);
    if (radius === 0) continue;
    place.project(camera);
    discs.push({ id, x: ((place.x + 1) / 2) * width, y: ((1 - place.y) / 2) * height, radius });
  }
  return nearestDiscAt(pointer, discs);
}

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
    position.needsUpdate = n > 0;
    geometry.setDrawRange(0, n);
    dots.visible = n > 0;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <pointsMaterial color={ink} sizeAttenuation={false} fog />
    </points>
  );
}
