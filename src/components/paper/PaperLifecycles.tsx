import { useLayoutEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { LifecycleKind } from '../../lib/lifecycle';
import type { PaperLayout } from '../../lib/paperLayout';
import {
  paperDissolveSpecks,
  paperLifecycleDisc,
  paperLinkDrawn,
  paperSpawnRing,
  type PaperLifecycleDraw,
  type ProgressOf,
} from '../../lib/paperLifecycle';
import { seedCanvasParticles } from '../../utils/canvasFx';
import { emphasisSubject } from '../../lib/paperHover';
import { fadeInk, inkOf, placeOf, type PaperEmphasisState } from './paperEmphasis';
import { PAPER_DASH, PAPER_LINE_RENDER_ORDER, PAPER_LINE_STYLE } from './paperScene';

interface PaperLifecyclesProps {
  draws: readonly PaperLifecycleDraw[];
  progressOf: ProgressOf;
  /** The shown layout, plus where each Person in a lifecycle was last shown. */
  layout: PaperLayout;
  ink: string;
  parentInk: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
}

const DISC_SEGMENTS = 40;
const RING_SEGMENTS = 64;
const RING_WIDTH_PX = 1.5;
const SPECKS = 14;

/** Each of `draws` in ink, on the shared lifecycle progress (ADR 0007). */
export function PaperLifecycles({ draws, progressOf, layout, ink, parentInk, paper, state }: PaperLifecyclesProps) {
  return (
    <>
      {draws.map((draw) =>
        draw.kind === 'disc' ? (
          <LifecycleDisc
            key={draw.lifecycle.key}
            lifecycleKey={draw.lifecycle.key}
            kind={draw.lifecycle.kind}
            id={draw.id}
            progressOf={progressOf}
            layout={layout}
            ink={ink}
            paper={paper}
            state={state}
          />
        ) : (
          <LifecycleLine
            key={draw.lifecycle.key}
            lifecycleKey={draw.lifecycle.key}
            kind={draw.lifecycle.kind}
            fromId={draw.from}
            toId={draw.to}
            width={PAPER_LINE_STYLE[draw.line.type].width}
            dashed={!!PAPER_LINE_STYLE[draw.line.type].dashed}
            colour={draw.line.type === 'parent' ? parentInk : ink}
            ink={ink}
            paper={paper}
            progressOf={progressOf}
            layout={layout}
            state={state}
          />
        )
      )}
    </>
  );
}

/** A Person's disc popping in, with a ring going out, or shrinking away as ink specks blow off it. */
function LifecycleDisc({
  lifecycleKey,
  kind,
  id,
  progressOf,
  layout,
  ink,
  paper,
  state,
}: {
  lifecycleKey: string;
  kind: LifecycleKind;
  id: string;
  progressOf: ProgressOf;
  layout: PaperLayout;
  ink: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
}) {
  const discRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);
  const ringLine = useRef<ElementRef<typeof Line>>(null);
  const specksRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, DISC_SEGMENTS), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    []
  );
  const speckMaterial = useMemo(() => new THREE.MeshBasicMaterial(), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => () => speckMaterial.dispose(), [speckMaterial]);

  const seeds = useMemo(() => (kind === 'dissolve' ? seedCanvasParticles(SPECKS, 'dissolve') : []), [kind]);
  const circle = useMemo(
    () =>
      Array.from({ length: RING_SEGMENTS + 1 }, (_, i) => {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        return [Math.cos(a), Math.sin(a), 0] as [number, number, number];
      }),
    []
  );
  const colours = useMemo(() => ({ ink: new THREE.Color(ink), paper: new THREE.Color(paper), out: new THREE.Color() }), [ink, paper]);
  const scratch = useMemo(
    () => ({
      centre: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      at: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
    }),
    []
  );

  useFrame(({ camera }) => {
    const disc = discRef.current;
    const ring = ringRef.current;
    const specks = specksRef.current;
    if (!disc) return;
    const progress = progressOf(lifecycleKey);
    const placed = layout.get(id);
    const shown = progress !== null && !!placed;
    disc.visible = shown;
    if (ring) ring.visible = shown && kind === 'spawn';
    if (specks) specks.visible = shown;
    if (progress === null || !placed) return;

    const { centre, right, up, at, scale, matrix } = scratch;
    placeOf(layout, state.current.drift, id, centre);
    const kept = inkOf(state.current, id);
    const frame = paperLifecycleDisc(kind, progress);
    disc.position.copy(centre);
    disc.quaternion.copy(camera.quaternion);
    disc.scale.setScalar(Math.max(placed.radius * frame.scale, 1e-3));
    fadeInk(colours.ink, colours.paper, frame.ink * kept, material.color);

    if (ring && kind === 'spawn') {
      const wave = paperSpawnRing(progress);
      ring.position.copy(centre);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(Math.max(placed.radius * wave.scale, 1e-3));
      const lineMaterial = ringLine.current?.material as THREE.Material | undefined;
      if (lineMaterial) lineMaterial.opacity = wave.ink * kept;
    }

    if (specks && kind === 'dissolve') {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      paperDissolveSpecks(seeds, progress, placed.radius).forEach((speck, i) => {
        at.copy(centre).addScaledVector(right, speck.x).addScaledVector(up, speck.y);
        scale.setScalar(Math.max(speck.r, 1e-3));
        specks.setMatrixAt(i, matrix.compose(at, camera.quaternion, scale));
        specks.setColorAt(i, fadeInk(colours.ink, colours.paper, speck.ink, colours.out));
      });
      specks.instanceMatrix.needsUpdate = true;
      if (specks.instanceColor) specks.instanceColor.needsUpdate = true;
      specks.computeBoundingSphere();
    }
  });

  return (
    <>
      <mesh ref={discRef} geometry={geometry} material={material} visible={false} />
      {kind === 'spawn' && (
        <group ref={ringRef} visible={false}>
          <Line ref={ringLine} points={circle} fog color={ink} lineWidth={RING_WIDTH_PX} transparent depthWrite={false} />
        </group>
      )}
      {kind === 'dissolve' && <instancedMesh ref={specksRef} args={[geometry, speckMaterial, SPECKS]} visible={false} />}
    </>
  );
}

/** A Kinship Link's line growing from the Person already there, or drawn back to nothing. */
function LifecycleLine({
  lifecycleKey,
  kind,
  fromId,
  toId,
  width,
  dashed,
  colour,
  ink,
  paper,
  progressOf,
  layout,
  state,
}: {
  lifecycleKey: string;
  kind: LifecycleKind;
  fromId: string;
  toId: string;
  width: number;
  dashed: boolean;
  colour: string;
  ink: string;
  paper: string;
  progressOf: ProgressOf;
  layout: PaperLayout;
  state: MutableRefObject<PaperEmphasisState>;
}) {
  const ref = useRef<ElementRef<typeof Line>>(null);
  const colours = useMemo(
    () => ({ line: new THREE.Color(colour), ink: new THREE.Color(ink), paper: new THREE.Color(paper) }),
    [colour, ink, paper]
  );
  const points = useMemo(() => [[0, 0, 0] as [number, number, number], [0, 0, 0] as [number, number, number]], []);
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);

  useFrame(() => {
    const segments = ref.current;
    if (!segments) return;
    const progress = progressOf(lifecycleKey);
    const shown = progress !== null && layout.has(fromId) && layout.has(toId);
    segments.visible = shown;
    if (!shown) return;

    const { from, to } = scratch;
    const { drift, emphasis } = state.current;
    const subject = emphasisSubject(emphasis);
    const own = subject === fromId || subject === toId;
    const kept = Math.min(inkOf(state.current, fromId), inkOf(state.current, toId));
    fadeInk(own ? colours.ink : colours.line, colours.paper, kept, (segments.material as unknown as { color: THREE.Color }).color);
    placeOf(layout, drift, fromId, from);
    placeOf(layout, drift, toId, to);
    to.lerpVectors(from, to, paperLinkDrawn(kind, progress));
    const { geometry } = segments;
    const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const positions = start.data.array as Float32Array;
    from.toArray(positions, 0);
    to.toArray(positions, 3);
    start.data.needsUpdate = true;
    geometry.computeBoundingSphere();
    if (dashed) segments.computeLineDistances();
  });

  return (
    <Line
      ref={ref}
      points={points}
      segments
      fog
      renderOrder={PAPER_LINE_RENDER_ORDER}
      depthWrite={false}
      lineWidth={width}
      dashed={dashed}
      {...PAPER_DASH}
    />
  );
}
