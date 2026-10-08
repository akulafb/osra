import { useLayoutEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { hoveredPerson } from '../../lib/paperHover';
import { fadeInk, inkOf, placeOf, type PaperEmphasisState } from './paperEmphasis';
import { paperLineSegments } from './paperScene';

interface PaperLinesProps {
  lines: readonly PaperLine[];
  layout: PaperLayout;
  ink: string;
  parentInk: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
  showArrows: boolean;
}

const ARROW_LENGTH = 5;
const ARROW_RADIUS = 1.6;

interface LineStyle {
  width: number;
  dashed?: boolean;
}

const LINE_STYLE: Record<FamilyLink['type'], LineStyle> = {
  parent: { width: 1 },
  marriage: { width: 2.75 },
  divorce: { width: 1.5, dashed: true },
};

export function PaperLines({ lines, layout, ink, parentInk, paper, state, showArrows }: PaperLinesProps) {
  const byType = useMemo(() => {
    const drawn = lines.filter((line) => layout.has(line.sourceId) && layout.has(line.targetId));
    return (['parent', 'marriage', 'divorce'] as const).map((type) => ({ type, lines: drawn.filter((line) => line.type === type) }));
  }, [lines, layout]);

  return (
    <>
      {byType.map(
        ({ type, lines: kind }) =>
          kind.length > 0 && (
            <PaperLineKind
              key={type}
              lines={kind}
              layout={layout}
              colour={type === 'parent' ? parentInk : ink}
              ink={ink}
              paper={paper}
              state={state}
              type={type}
            />
          )
      )}
      {showArrows && <PaperArrows lines={lines} layout={layout} color={parentInk} />}
    </>
  );
}

type LineSegments = ElementRef<typeof Line>;

/**
 * One draw call for every line of one kind. A line fades with the fainter of
 * its two Persons, and the hovered Person's own lines darken to full ink.
 */
function PaperLineKind({
  lines,
  layout,
  colour,
  ink,
  paper,
  state,
  type,
}: {
  lines: readonly PaperLine[];
  layout: PaperLayout;
  colour: string;
  ink: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
  type: FamilyLink['type'];
}) {
  const ref = useRef<LineSegments>(null);
  const style = LINE_STYLE[type];
  const points = useMemo(() => paperLineSegments(lines, layout)[type], [lines, layout, type]);
  const vertexColors = useMemo(() => points.map(() => [1, 1, 1] as [number, number, number]), [points]);
  const colours = useMemo(
    () => ({ line: new THREE.Color(colour), ink: new THREE.Color(ink), paper: new THREE.Color(paper), out: new THREE.Color() }),
    [colour, ink, paper]
  );
  const drawn = useRef<{ segments: LineSegments | null; emphasis?: PaperEmphasisState['emphasis']; drift?: PaperEmphasisState['drift'] }>({
    segments: null,
  });
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    drawn.current = { segments: null };
  }, [points, colours]);

  useFrame(() => {
    const segments = ref.current;
    if (!segments) return;
    const { emphasis, drift } = state.current;
    const last = drawn.current;
    const fresh = last.segments !== segments;

    if (fresh || drift !== last.drift) {
      const positions = new Float32Array(lines.length * 6);
      lines.forEach((line, i) => {
        placeOf(layout, drift, line.sourceId, scratch).toArray(positions, i * 6);
        placeOf(layout, drift, line.targetId, scratch).toArray(positions, i * 6 + 3);
      });
      segments.geometry.setPositions(positions);
      if (style.dashed) segments.computeLineDistances();
    }

    if (fresh || emphasis !== last.emphasis) {
      const hoveredId = hoveredPerson(emphasis);
      const rgb = new Float32Array(lines.length * 6);
      lines.forEach((line, i) => {
        const own = hoveredId !== null && (line.sourceId === hoveredId || line.targetId === hoveredId);
        const kept = Math.min(inkOf(state.current, line.sourceId), inkOf(state.current, line.targetId));
        fadeInk(own ? colours.ink : colours.line, colours.paper, kept, colours.out);
        colours.out.toArray(rgb, i * 6);
        colours.out.toArray(rgb, i * 6 + 3);
      });
      segments.geometry.setColors(rgb);
    }

    drawn.current = { segments, emphasis, drift };
  });

  return (
    <Line
      ref={ref}
      points={points}
      vertexColors={vertexColors}
      segments
      fog
      lineWidth={style.width}
      dashed={style.dashed}
      dashSize={3}
      gapSize={2.5}
    />
  );
}

/** A small cone on each parent line, just short of the child's disc, pointing at the child. */
function PaperArrows({ lines, layout, color }: { lines: readonly PaperLine[]; layout: PaperLayout; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.ConeGeometry(ARROW_RADIUS, ARROW_LENGTH, 12), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color }), [color]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => material.dispose(), [material]);

  const arrows = useMemo(
    () =>
      lines.flatMap((line) => {
        const parent = layout.get(line.sourceId);
        const child = layout.get(line.targetId);
        if (line.type !== 'parent' || !parent || !child) return [];
        const to = new THREE.Vector3(child.x, child.y, child.z);
        const direction = to.clone().sub(new THREE.Vector3(parent.x, parent.y, parent.z));
        if (direction.lengthSq() === 0) return [];
        direction.normalize();
        return [{ tip: to.addScaledVector(direction, -(child.radius + 1)), direction }];
      }),
    [lines, layout]
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    arrows.forEach(({ tip, direction }, i) => {
      quaternion.setFromUnitVectors(up, direction);
      const centre = tip.clone().addScaledVector(direction, -ARROW_LENGTH / 2);
      mesh.setMatrixAt(i, matrix.compose(centre, quaternion, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [arrows]);

  return <instancedMesh key={arrows.length} ref={meshRef} args={[geometry, material, arrows.length]} />;
}
