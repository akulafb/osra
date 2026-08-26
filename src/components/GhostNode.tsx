import React, { useMemo } from 'react';
import { Node2D, FamilyNode, RelativeDirection } from '../types/graph';
import { GhostNodeCard, GHOST_CARD_WIDTH } from './cards/GhostNodeCard';
import { relationColor } from './cards/relationStyle';

/**
 * 2D shell for the Ghost Node: places the shared card in graph coordinates and
 * draws the dashed connector back to its anchor. All input behaviour lives in
 * `GhostNodeCard`, which the 3D view mounts in a screen-docked panel instead.
 */
export interface GhostNodeProps {
  anchorNode: Node2D;
  relation: RelativeDirection;
  existingNodes: FamilyNode[];
  /** Passed straight to the card; see `GhostNodeCardProps`. */
  visibleIds?: ReadonlySet<string>;
  connectedIds?: ReadonlySet<string>;
  onSubmit: (name: string) => Promise<void> | void;
  onConnectExisting: (existingNodeId: string) => Promise<void> | void;
  onCancel: () => void;
}

export const GHOST_NODE_WIDTH = GHOST_CARD_WIDTH;
export const GHOST_NODE_HEIGHT = 80;

export function getGhostNodePosition(anchorNode: Node2D, relation: RelativeDirection): { x: number; y: number } {
  switch (relation) {
    case 'parent':
      return {
        x: anchorNode.x,
        y: anchorNode.y - GHOST_NODE_HEIGHT - 35,
      };
    case 'spouse':
      return {
        x: anchorNode.x + anchorNode.width / 2 + GHOST_NODE_WIDTH / 2 + 30,
        y: anchorNode.y,
      };
    case 'child':
    default:
      return {
        x: anchorNode.x,
        y: anchorNode.y + anchorNode.height + 35,
      };
  }
}

/**
 * Tall enough for the card with its Person Match dropdown open. Safe to fix at the
 * maximum because the viewport is click-transparent (see `pointerEvents` below),
 * so an oversized box costs nothing.
 */
const GHOST_VIEWPORT_HEIGHT = GHOST_NODE_HEIGHT + 140;

export const GhostNode: React.FC<GhostNodeProps> = ({
  anchorNode,
  relation,
  existingNodes,
  visibleIds,
  connectedIds,
  onSubmit,
  onConnectExisting,
  onCancel,
}) => {
  const pos = useMemo(() => getGhostNodePosition(anchorNode, relation), [anchorNode, relation]);
  const color = relationColor(relation);

  const anchorCenterX = anchorNode.x;
  const anchorCenterY = anchorNode.y + anchorNode.height / 2;
  const ghostCenterX = pos.x;
  const ghostCenterY = pos.y + GHOST_NODE_HEIGHT / 2;

  return (
    <g className="ghost-node-layer">
      {/* Dashed connector line */}
      <line
        x1={anchorCenterX}
        y1={anchorCenterY}
        x2={ghostCenterX}
        y2={ghostCenterY}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="5 4"
        opacity={0.8}
      />

      {/* Ghost Card via foreignObject */}
      {/*
        The viewport is sized for the dropdown-open case and made click-through,
        so only the card itself takes pointer events. Sizing it to the content
        instead would mean the card reporting its height back up, which can only
        land after paint — leaving a frame where the box is the wrong size and
        either clips the dropdown or swallows clicks on the Tree Nodes beneath.
      */}
      <foreignObject
        x={pos.x - GHOST_NODE_WIDTH / 2}
        y={pos.y}
        width={GHOST_NODE_WIDTH + 60}
        height={GHOST_VIEWPORT_HEIGHT}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <div style={{ pointerEvents: 'auto', width: 'fit-content' }}>
          <GhostNodeCard
            relation={relation}
            anchorNodeId={anchorNode.id}
            anchorFirstName={anchorNode.firstName}
            existingNodes={existingNodes}
            visibleIds={visibleIds}
            connectedIds={connectedIds}
            onSubmit={onSubmit}
            onConnectExisting={onConnectExisting}
            onCancel={onCancel}
          />
        </div>
      </foreignObject>
    </g>
  );
};
