import { useLayoutEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { emphasisSubject, linesOf } from '../../lib/paperHover';
import { fadeInk, inkOf, lineEndInks, placeOf, type PaperEmphasisState } from './paperEmphasis';
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
      {showArrows && <PaperArrows lines={lines} layout={layout} color={parentInk} paper={paper} state={state} />}
    </>
  );
}

type LineSegments = ElementRef<typeof Line>;

/**
 * One draw call for every line of one kind. Each end of a line fades with its
 * own Person, and the hovered or focused Person's own lines darken to full ink.
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
  const drawn = useRef<{ geometry?: object; colours?: object; emphasis?: PaperEmphasisState['emphasis']; drift?: PaperEmphasisState['drift'] }>({});
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const segments = ref.current;
    if (!segments) return;
    const { geometry } = segments;
    const { emphasis, drift } = state.current;
    const last = drawn.current;
    const fresh = last.geometry !== geometry;

    if (fresh || drift !== last.drift) {
      const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
      const positions = start.data.array as Float32Array;
      lines.forEach((line, i) => {
        placeOf(layout, drift, line.sourceId, scratch).toArray(positions, i * 6);
        placeOf(layout, drift, line.targetId, scratch).toArray(positions, i * 6 + 3);
      });
      start.data.needsUpdate = true;
      geometry.computeBoundingSphere();
      if (style.dashed) segments.computeLineDistances();
    }

    if (fresh || colours !== last.colours || emphasis !== last.emphasis) {
      const own = new Set(linesOf(lines, emphasisSubject(emphasis)));
      const rgb = new Float32Array(lines.length * 6);
      lines.forEach((line, i) => {
        const colour = own.has(line) ? colours.ink : colours.line;
        const [source, target] = lineEndInks(state.current, line);
        fadeInk(colour, colours.paper, source, colours.out).toArray(rgb, i * 6);
        fadeInk(colour, colours.paper, target, colours.out).toArray(rgb, i * 6 + 3);
      });
      geometry.setColors(rgb);
    }

    drawn.current = { geometry, colours, emphasis, drift };
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

/** A small cone on each parent line, just short of the child's disc, pointing at the child; it leans with its line and fades with the child's end of it. */
function PaperArrows({
  lines,
  layout,
  color,
  paper,
  state,
}: {
  lines: readonly PaperLine[];
  layout: PaperLayout;
  color: string;
  paper: string;
  state: MutableRefObject<PaperEmphasisState>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.ConeGeometry(ARROW_RADIUS, ARROW_LENGTH, 12), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial(), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => material.dispose(), [material]);

  const arrows = useMemo(
    () => lines.filter((line) => line.type === 'parent' && layout.has(line.sourceId) && layout.has(line.targetId)),
    [lines, layout]
  );
  const colours = useMemo(() => ({ line: new THREE.Color(color), paper: new THREE.Color(paper), out: new THREE.Color() }), [color, paper]);
  const scratch = useMemo(
    () => ({
      parent: new THREE.Vector3(),
      child: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      quaternion: new THREE.Quaternion(),
      matrix: new THREE.Matrix4(),
      one: new THREE.Vector3(1, 1, 1),
    }),
    []
  );
  const drawn = useRef<{ mesh?: object; colours?: object; emphasis?: PaperEmphasisState['emphasis']; drift?: PaperEmphasisState['drift'] }>({});

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { emphasis, drift } = state.current;
    const last = drawn.current;
    const fresh = last.mesh !== mesh;

    if (fresh || drift !== last.drift) {
      const { parent, child, direction, up, quaternion, matrix, one } = scratch;
      arrows.forEach((line, i) => {
        placeOf(layout, drift, line.sourceId, parent);
        placeOf(layout, drift, line.targetId, child);
        direction.subVectors(child, parent);
        if (direction.lengthSq() === 0) direction.copy(up);
        direction.normalize();
        quaternion.setFromUnitVectors(up, direction);
        child.addScaledVector(direction, -(layout.get(line.targetId)!.radius + 1 + ARROW_LENGTH / 2));
        mesh.setMatrixAt(i, matrix.compose(child, quaternion, one));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    if (fresh || colours !== last.colours || emphasis !== last.emphasis) {
      arrows.forEach((line, i) => {
        mesh.setColorAt(i, fadeInk(colours.line, colours.paper, inkOf(state.current, line.targetId), colours.out));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    drawn.current = { mesh, colours, emphasis, drift };
  });

  return <instancedMesh key={arrows.length} ref={meshRef} args={[geometry, material, arrows.length]} />;
}
