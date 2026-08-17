import React from 'react';
import { Node2D, FamilyGraph } from '../types/graph';
import { ConnectPickerCard, PICKER_CARD_WIDTH } from './cards/ConnectPickerCard';

/**
 * 2D shell for the inline kinship picker: places the shared card between the
 * two Tree Nodes and draws the preview line joining them. All choice and
 * validation behaviour lives in `ConnectPickerCard`.
 */
export interface InlineConnectPickerProps {
  sourceNode: Node2D;
  targetNode: Node2D;
  graphData: FamilyGraph;
  isAdmin?: boolean;
  onConfirm: (
    type: 'parent' | 'marriage' | 'divorce',
    parentRole?: 'mother' | 'father' | null,
    parentIsSource?: boolean
  ) => Promise<void> | void;
  onCancel: () => void;
}

export const PICKER_WIDTH = PICKER_CARD_WIDTH;
export const PICKER_HEIGHT = 220;

export const InlineConnectPicker: React.FC<InlineConnectPickerProps> = ({
  sourceNode,
  targetNode,
  graphData,
  isAdmin,
  onConfirm,
  onCancel,
}) => {
  // Position between source and target, or centered on target
  const posX = (sourceNode.x + targetNode.x) / 2;
  const posY = Math.min(sourceNode.y, targetNode.y) - 40;

  return (
    <g className="inline-connect-picker-layer">
      {/* Connecting preview line */}
      <line
        x1={sourceNode.x}
        y1={sourceNode.y + sourceNode.height / 2}
        x2={targetNode.x}
        y2={targetNode.y + targetNode.height / 2}
        stroke="#c084fc"
        strokeWidth={2.5}
        strokeDasharray="6 4"
        opacity={0.95}
      />

      <foreignObject
        x={posX - PICKER_WIDTH / 2}
        y={Math.max(20, posY)}
        width={PICKER_WIDTH}
        height={PICKER_HEIGHT + 60}
        style={{ overflow: 'visible' }}
      >
        <ConnectPickerCard
          sourceId={sourceNode.id}
          sourceFirstName={sourceNode.firstName}
          targetId={targetNode.id}
          targetFirstName={targetNode.firstName}
          graphData={graphData}
          isAdmin={isAdmin}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </foreignObject>
    </g>
  );
};
