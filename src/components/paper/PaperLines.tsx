import { useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { paperLineSegments } from './paperScene';

interface PaperLinesProps {
  lines: readonly PaperLine[];
  layout: PaperLayout;
  ink: string;
  parentInk: string;
  showArrows: boolean;
}

const ARROW_LENGTH = 5;
const ARROW_RADIUS = 1.6;

/**
 * The three kinds of Kinship Link in ink, one draw each: parent lines thin and
 * lighter, marriages thick, divorces dashed.
 */
export function PaperLines({ lines, layout, ink, parentInk, showArrows }: PaperLinesProps) {
  const segments = useMemo(() => paperLineSegments(lines, layout), [lines, layout]);

  return (
    <>
      {segments.parent.length > 0 && (
        <Line points={segments.parent} segments color={parentInk} lineWidth={1} />
      )}
      {segments.marriage.length > 0 && (
        <Line points={segments.marriage} segments color={ink} lineWidth={2.75} />
      )}
      {segments.divorce.length > 0 && (
        <Line points={segments.divorce} segments color={ink} lineWidth={1.5} dashed dashSize={3} gapSize={2.5} />
      )}
      {showArrows && <PaperArrows lines={lines} layout={layout} color={parentInk} />}
    </>
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
