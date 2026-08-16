import React, { useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { FamilyNode, RelativeDirection } from '../types/graph';
import { ForceGraphRef, LiveNodePosition } from '../types/forceGraph';
import { GhostNodeCard, GHOST_CARD_WIDTH } from './cards/GhostNodeCard';
import { relationColor } from './cards/relationStyle';
import { useGhostPreview } from '../hooks/useGhostPreview';

/**
 * Docked action panel for the 3D view (LIN-46, ADR 0002).
 *
 * Every hit target lives here rather than floating at the anchor planet.
 * Prototyping (branch `prototype/3d-overlay-chrome`) showed floating chrome and
 * in-scene sprites both looked better but were harder to use: in a crowded 3D
 * scene they get occluded, drift off-screen, and shrink to a few pixels with
 * distance. A docked panel has none of those failure modes.
 *
 * What keeps this from being an ordinary form is the Ghost Preview it drives —
 * a decorative marker in the scene showing where the new relative will land.
 */

const PANEL_LEFT = 24;
const PANEL_PADDING = 12;
const PANEL_WIDTH = GHOST_CARD_WIDTH + PANEL_PADDING * 2;
/** Where the leader line meets the panel — derived, so resizing cannot detach it. */
const PANEL_RIGHT_EDGE = PANEL_LEFT + PANEL_WIDTH;

const HANDLES: { relation: RelativeDirection; label: string }[] = [
  { relation: 'parent', label: '+ Parent' },
  { relation: 'child', label: '+ Child' },
  { relation: 'spouse', label: '+ Spouse' },
];

export interface Manipulation3DPanelProps {
  selectedNode: FamilyNode | null;
  /** Action Handles appear only when the active user may edit this person. */
  canEdit: boolean;
  existingNodes: FamilyNode[];
  fgRef: ForceGraphRef;
  /** Live simulated nodes — the array handed to the graphData prop. */
  nodes: LiveNodePosition[];
  onCreateRelative?: (params: {
    firstName: string;
    relation: RelativeDirection;
    targetNodeId: string;
  }) => Promise<void> | void;
  onConnectExistingRelative?: (params: {
    existingNodeId: string;
    relation: RelativeDirection;
    targetNodeId: string;
  }) => Promise<void> | void;
}

/**
 * The leader line and ring, isolated in their own component.
 *
 * The anchor is re-projected every frame, so this re-renders continuously while
 * the simulation settles or the camera moves. Keeping it separate means that
 * churn never reaches the panel — and, critically, never reaches the text input
 * inside GhostNodeCard.
 */
const AnchorLeaderLine: React.FC<{
  fgRef: ForceGraphRef;
  nodes: LiveNodePosition[];
  nodeId: string;
  color: string;
}> = ({ fgRef, nodes, nodeId, color }) => {
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);

  // Read through a ref so a new array identity does not restart the loop.
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    let frameId = 0;
    const viewSpace = new THREE.Vector3();

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const fg = fgRef.current;
      const project = fg?.graph2ScreenCoords;
      const camera = fg?.camera?.();
      const live = nodesRef.current.find((n) => n.id === nodeId);
      if (!project || !camera || !live || typeof live.x !== 'number') return;

      // graph2ScreenCoords projects without any frustum test, so a point behind
      // the camera comes back point-mirrored into view — the ring would then
      // draw around an unrelated planet. Check view-space depth ourselves.
      viewSpace.set(live.x, live.y as number, live.z as number).applyMatrix4(camera.matrixWorldInverse);
      if (viewSpace.z > 0) {
        setScreen((prev) => (prev === null ? prev : null));
        return;
      }

      const next = project(live.x, live.y as number, live.z as number);
      if (!next) return;
      setScreen((prev) =>
        prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5
          ? prev
          : { x: next.x, y: next.y }
      );
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [fgRef, nodeId]);

  if (!screen) return null;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, zIndex: 1200, pointerEvents: 'none' }}
      width="100%"
      height="100%"
    >
      <line
        x1={screen.x}
        y1={screen.y}
        x2={PANEL_RIGHT_EDGE}
        y2="50%"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        opacity={0.6}
      />
      <circle
        cx={screen.x}
        cy={screen.y}
        r={7}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.9}
      />
    </svg>
  );
};

export const Manipulation3DPanel: React.FC<Manipulation3DPanelProps> = ({
  selectedNode,
  canEdit,
  existingNodes,
  fgRef,
  nodes,
  onCreateRelative,
  onConnectExistingRelative,
}) => {
  const [relation, setRelation] = useState<RelativeDirection | null>(null);
  const [previewName, setPreviewName] = useState('');

  const selectedId = selectedNode?.id ?? null;
  const visible = Boolean(selectedNode && canEdit);

  useGhostPreview({
    fgRef,
    nodes,
    anchorNodeId: relation ? selectedId : null,
    relation,
    name: previewName,
    enabled: visible,
  });

  // Abandon any in-flight action when the selection moves elsewhere.
  useEffect(() => {
    setRelation(null);
    setPreviewName('');
  }, [selectedId]);

  const closeGhostNode = useCallback(() => {
    setRelation(null);
    setPreviewName('');
  }, []);

  const handleSubmit = useCallback(
    async (firstName: string) => {
      if (!selectedId || !relation) return;
      await Promise.resolve(
        onCreateRelative?.({ firstName, relation, targetNodeId: selectedId })
      );
      closeGhostNode();
    },
    [selectedId, relation, onCreateRelative, closeGhostNode]
  );

  const handleConnectExisting = useCallback(
    async (existingNodeId: string) => {
      if (!selectedId || !relation) return;
      await Promise.resolve(
        onConnectExistingRelative?.({ existingNodeId, relation, targetNodeId: selectedId })
      );
      closeGhostNode();
    },
    [selectedId, relation, onConnectExistingRelative, closeGhostNode]
  );

  if (!selectedNode || !canEdit) return null;

  const accent = relation ? relationColor(relation) : '#a78bfa';

  return (
    <>
      <AnchorLeaderLine fgRef={fgRef} nodes={nodes} nodeId={selectedNode.id} color={accent} />

      <div
        style={{
          position: 'absolute',
          left: PANEL_LEFT,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1250,
          width: PANEL_WIDTH,
          boxSizing: 'border-box',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12,
          padding: PANEL_PADDING,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.65)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedNode.firstName}
        </div>

        {!relation &&
          HANDLES.map(({ relation: rel, label }) => (
            <button
              key={rel}
              type="button"
              onClick={() => setRelation(rel)}
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                border: `1.5px solid ${relationColor(rel)}`,
                borderRadius: 999,
                color: relationColor(rel),
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 10px',
                textAlign: 'left',
              }}
            >
              {label}
            </button>
          ))}

        {relation && (
          <GhostNodeCard
            relation={relation}
            anchorNodeId={selectedNode.id}
            anchorFirstName={selectedNode.firstName}
            existingNodes={existingNodes}
            onSubmit={handleSubmit}
            onConnectExisting={handleConnectExisting}
            onCancel={closeGhostNode}
            onNameChange={setPreviewName}
          />
        )}
      </div>
    </>
  );
};
