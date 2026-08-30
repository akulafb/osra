import React, { useEffect } from 'react';
import { Node2D } from '../types/graph';
import { Lifecycle } from '../lib/lifecycle';
import { LifecycleController, useLifecycleProgress } from '../hooks/useLifecycles';
import { ParticleDissolve } from './ParticleDissolve';
import { SpawnBurst } from './SpawnBurst';

interface NodeLifecycleFxProps {
  lifecycle: Lifecycle;
  lifecycles: LifecycleController;
  /** The current layout, used once — to pin where the subject was. */
  nodes: Node2D[];
}

/**
 * The 2D rendering of one Tree Node lifecycle (LIN-55, ADR-0007).
 *
 * It draws from the lifecycle's geometry snapshot rather than from the live
 * layout. That is the whole point: a Dissolve outlives the node it is
 * dissolving — the Person leaves the Working Record the moment the change
 * applies — so anything keyed off the live node list unmounts mid-animation,
 * which is exactly how the old `onComplete` became unreachable.
 */
export const NodeLifecycleFx: React.FC<NodeLifecycleFxProps> = ({
  lifecycle,
  lifecycles,
  nodes,
}) => {
  const { subject, geometry, key, kind } = lifecycle;
  const nodeId = subject.kind === 'node' ? subject.id : null;
  const progress = useLifecycleProgress(lifecycles, kind, subject);

  // Pin the position the first time this lifecycle is drawn, while the node is
  // still in the layout. The module ignores later captures.
  useEffect(() => {
    if (geometry || !nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    lifecycles.captureGeometry(key, {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    });
  }, [geometry, nodeId, nodes, lifecycles, key]);

  if (!nodeId || !geometry || progress === null) return null;

  return kind === 'spawn' ? (
    <SpawnBurst
      x={geometry.x - geometry.width / 2}
      y={geometry.y}
      width={geometry.width}
      height={geometry.height}
      progress={progress}
    />
  ) : (
    <ParticleDissolve
      x={geometry.x}
      y={geometry.y + geometry.height / 2}
      width={geometry.width}
      height={geometry.height}
      progress={progress}
    />
  );
};
