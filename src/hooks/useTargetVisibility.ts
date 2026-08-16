import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ForceGraphRef, LiveNodePosition } from '../types/forceGraph';
import { classifyTargetVisibility, TargetVisibility } from '../utils/connectTargeting';

/**
 * Which Connect Mode candidates the camera can currently see (LIN-50).
 *
 * The fallback picker needs this to say which targets aiming cannot reach.
 * Sampled on a timer rather than every frame: the answer only has to be right
 * enough to badge a list, and re-projecting every candidate at 60fps — then
 * re-rendering the panel, and with it the text input inside it — would cost far
 * more than it is worth.
 */

export const TARGET_VISIBILITY_SAMPLE_MS = 250;

export function useTargetVisibility(params: {
  fgRef: ForceGraphRef;
  /** Live simulated nodes — the array handed to the graphData prop. */
  nodes: LiveNodePosition[];
  /** Ids to watch; everything else is left unmeasured. */
  targetIds: Set<string>;
  enabled: boolean;
}): Map<string, TargetVisibility> {
  const { fgRef, nodes, targetIds, enabled } = params;
  const [visibility, setVisibility] = useState<Map<string, TargetVisibility>>(new Map());

  // Read through refs so a new array or set identity does not restart the loop.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const targetIdsRef = useRef(targetIds);
  targetIdsRef.current = targetIds;

  useEffect(() => {
    if (!enabled) {
      setVisibility((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    let frameId = 0;
    let lastSampledAt = -Infinity;
    const viewSpace = new THREE.Vector3();

    const sample = (now: number) => {
      frameId = requestAnimationFrame(sample);
      if (now - lastSampledAt < TARGET_VISIBILITY_SAMPLE_MS) return;
      lastSampledAt = now;

      const fg = fgRef.current;
      const project = fg?.graph2ScreenCoords;
      const camera = fg?.camera?.();
      const canvas = fg?.renderer?.()?.domElement;
      if (!project || !camera) return;

      const viewport = {
        width: canvas?.clientWidth || window.innerWidth,
        height: canvas?.clientHeight || window.innerHeight,
      };

      const next = new Map<string, TargetVisibility>();
      for (const node of nodesRef.current) {
        if (!targetIdsRef.current.has(node.id)) continue;
        if (typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') {
          continue;
        }
        viewSpace.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
        next.set(
          node.id,
          classifyTargetVisibility({
            viewSpaceZ: viewSpace.z,
            screen: project(node.x, node.y, node.z),
            viewport,
          })
        );
      }

      setVisibility((prev) => (sameVisibility(prev, next) ? prev : next));
    };

    frameId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frameId);
  }, [enabled, fgRef]);

  return visibility;
}

function sameVisibility(
  a: Map<string, TargetVisibility>,
  b: Map<string, TargetVisibility>
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, value] of a) {
    if (b.get(id) !== value) return false;
  }
  return true;
}
