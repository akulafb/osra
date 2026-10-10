import { useLayoutEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { emphasisSubject, linesOf } from '../../lib/paperHover';
import { fadeInk, inkOf, lineEndInks, placeOf, type PaperEmphasisState } from './paperEmphasis';
import { PAPER_DASH, PAPER_LINE_RENDER_ORDER, PAPER_LINE_STYLE, paperLineSegments, setPaperColours, setPaperSegment } from './paperScene';

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

/** One draw call for every line of one kind; the hovered or focused Person's own lines darken to full ink. */
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
  const style = PAPER_LINE_STYLE[type];
  const points = useMemo(() => paperLineSegments(lines, layout), [lines, layout]);
  const vertexColors = useMemo(() => points.map(() => [1, 1, 1] as [number, number, number]), [points]);
  const rgb = useMemo(() => new Float32Array(lines.length * 6), [lines]);
  const colours = useMemo(
    () => ({ line: new THREE.Color(colour), ink: new THREE.Color(ink), paper: new THREE.Color(paper), out: new THREE.Color() }),
    [colour, ink, paper]
  );
  const drawn = useRef<{ geometry?: object; colours?: object } & Partial<Pick<PaperEmphasisState, 'emphasis' | 'drift' | 'spread'>>>({});
  const scratch = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3() }), []);

  useFrame(() => {
    const segments = ref.current;
    if (!segments) return;
    const { geometry } = segments;
    const { emphasis, drift, spread } = state.current;
    const last = drawn.current;
    const fresh = last.geometry !== geometry;

    if (fresh || drift !== last.drift || spread !== last.spread) {
      const { from, to } = scratch;
      let moved = false;
      lines.forEach((line, i) => {
        placeOf(layout, state.current, line.sourceId, from);
        placeOf(layout, state.current, line.targetId, to);
        if (setPaperSegment(geometry, i, from, to)) moved = true;
      });
      if (moved || fresh) geometry.computeBoundingSphere();
    }

    if (fresh || colours !== last.colours || emphasis !== last.emphasis) {
      const own = new Set(linesOf(lines, emphasisSubject(emphasis)));
      lines.forEach((line, i) => {
        const colour = own.has(line) ? colours.ink : colours.line;
        const [source, target] = lineEndInks(state.current, line);
        fadeInk(colour, colours.paper, source, colours.out).toArray(rgb, i * 6);
        fadeInk(colour, colours.paper, target, colours.out).toArray(rgb, i * 6 + 3);
      });
      setPaperColours(geometry, rgb);
    }

    drawn.current = { geometry, colours, emphasis, drift, spread };
  });

  return (
    <Line
      ref={ref}
      points={points}
      vertexColors={vertexColors}
      segments
      fog
      renderOrder={PAPER_LINE_RENDER_ORDER}
      depthWrite={false}
      lineWidth={style.width}
      dashed={style.dashed}
      {...PAPER_DASH}
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
  const drawn = useRef<{ mesh?: object; colours?: object } & Partial<Pick<PaperEmphasisState, 'emphasis' | 'drift' | 'spread'>>>({});

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { emphasis, drift, spread } = state.current;
    const last = drawn.current;
    const fresh = last.mesh !== mesh;

    if (fresh || drift !== last.drift || spread !== last.spread) {
      const { parent, child, direction, up, quaternion, matrix, one } = scratch;
      arrows.forEach((line, i) => {
        placeOf(layout, state.current, line.sourceId, parent);
        placeOf(layout, state.current, line.targetId, child);
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

    drawn.current = { mesh, colours, emphasis, drift, spread };
  });

  return <instancedMesh key={arrows.length} ref={meshRef} args={[geometry, material, arrows.length]} />;
}
