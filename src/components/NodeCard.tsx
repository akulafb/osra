import React from 'react';
import { Node2D } from '../types/graph';
import { getClusterColors } from '../utils/familyColors';

export type RelativeDirection = 'parent' | 'child' | 'spouse';

export interface NodeCardProps {
  node: Node2D;
  isSelected: boolean;
  onClick: (node: Node2D) => void;
  onDoubleClick?: (node: Node2D) => void;
  /** When viewing a cluster, maternal-only children use lighter tint */
  activePreset?: string | null;
  /** Temporary glow for "Find me!" highlight */
  isHighlighted?: boolean;
  /** Search match highlight (bright red glow) */
  isSearchHighlighted?: boolean;
  /** Whether the current user has permission to edit/add/delete around this node */
  canEdit?: boolean;
  /** Direct Action Handle callbacks */
  onAddRelative?: (node: Node2D, relation: RelativeDirection) => void;
  onStartConnect?: (node: Node2D) => void;
  onStartDissolve?: (node: Node2D) => void;
}

/** Lighten colors for maternal-only nodes (same hue, lighter tint) */
function lightenColors(base: { bg: string; border: string; text: string }) {
  // Parse hex to RGB and mix with white (60% white) for lighter tint
  const hexToRgb = (hex: string) => {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  };
  const rgb = hexToRgb(base.border);
  const lightBorder = rgb
    ? `rgb(${Math.round(rgb[0] * 0.4 + 255 * 0.6)}, ${Math.round(rgb[1] * 0.4 + 255 * 0.6)}, ${Math.round(rgb[2] * 0.4 + 255 * 0.6)})`
    : base.border;
  return {
    bg: base.bg.replace(/[\d.]+\)$/, '0.08)'),
    border: lightBorder,
    text: base.text,
  };
}

const HIGHLIGHT_GLOW_COLOR = '#10b981';
const SEARCH_GLOW_COLOR = '#ef4444';

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isSelected,
  onClick,
  onDoubleClick,
  activePreset,
  isHighlighted = false,
  isSearchHighlighted = false,
  canEdit = false,
  onAddRelative,
  onStartConnect,
  onStartDissolve,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const isMaternalOnly =
    activePreset &&
    node.maternalFamilyCluster === activePreset &&
    node.familyCluster !== activePreset;
  const baseColors = getClusterColors(
    isMaternalOnly ? activePreset : node.familyCluster
  );
  const colors = isMaternalOnly ? lightenColors(baseColors) : baseColors;

  const firstName = node.firstName.trim();
  const lastName = (node.familyCluster ?? '').trim();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(node);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(node);
  };

  const showActionHandles = canEdit && (isHovered || isSelected);

  return (
    <g
      transform={`translate(${node.x - node.width / 2}, ${node.y})`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        cursor: 'pointer',
      }}
      className={`node-card ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${isSearchHighlighted ? 'search-highlighted' : ''}`}
    >
      {/* Search match highlight (red glow, takes precedence) */}
      {isSearchHighlighted && (
        <rect
          x={-10}
          y={-10}
          width={node.width + 20}
          height={node.height + 20}
          rx={16}
          fill="none"
          stroke={SEARCH_GLOW_COLOR}
          strokeWidth={4}
          opacity={0.8}
          style={{ transition: 'opacity 0.3s ease' }}
        />
      )}
      {/* Find me! highlight glow */}
      {isHighlighted && !isSearchHighlighted && (
        <rect
          x={-8}
          y={-8}
          width={node.width + 16}
          height={node.height + 16}
          rx={14}
          fill="none"
          stroke={HIGHLIGHT_GLOW_COLOR}
          strokeWidth={3}
          opacity={0.5}
          style={{ transition: 'opacity 0.3s ease' }}
        />
      )}

      {/* Card shadow */}
      <rect
        x={2}
        y={2}
        width={node.width}
        height={node.height}
        rx={8}
        fill="rgba(0, 0, 0, 0.3)"
      />

      {/* Main card */}
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        rx={8}
        fill={colors.bg}
        stroke={isSelected ? '#fff' : colors.border}
        strokeWidth={isSelected ? 3 : 2}
        style={{
          transition: 'all 0.2s ease',
        }}
      />

      {/* Selection glow effect */}
      {isSelected && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={12}
          fill="none"
          stroke={colors.border}
          strokeWidth={2}
          opacity={0.3}
        />
      )}

      {/* First name */}
      <text
        x={node.width / 2}
        y={node.height / 2 - 2}
        textAnchor="middle"
        fill={colors.text}
        fontSize={12}
        fontWeight={600}
        style={{ pointerEvents: 'none' }}
      >
        {firstName.length > 14 ? firstName.slice(0, 13) + '...' : firstName}
      </text>

      {/* Last name */}
      {lastName && (
        <text
          x={node.width / 2}
          y={node.height / 2 + 16}
          textAnchor="middle"
          fill={colors.text}
          fontSize={11}
          opacity={0.9}
          style={{ pointerEvents: 'none' }}
        >
          {lastName.length > 14 ? lastName.slice(0, 13) + '...' : lastName}
        </text>
      )}

      {/* Cluster indicator dot */}
      <circle
        cx={node.width - 10}
        cy={10}
        r={4}
        fill={colors.border}
      />

      {/* Claimed tick (subtle) */}
      {node.isClaimed && (
        <text
          x={node.width - 10}
          y={node.height - 8}
          textAnchor="end"
          fill={colors.text}
          fontSize={10}
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        >
          ✓
        </text>
      )}

      {/* Directional Action Handles (visible when authorized + hovered/selected) */}
      {showActionHandles && (
        <g className="action-handles-group" style={{ transition: 'opacity 0.2s ease' }}>
          {/* Top Handle: + Parent */}
          <g
            className="action-handle handle-parent"
            transform={`translate(${node.width / 2}, -12)`}
            onClick={(e) => {
              e.stopPropagation();
              onAddRelative?.(node, 'parent');
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={-30}
              y={-10}
              width={60}
              height={20}
              rx={10}
              fill="rgba(15, 23, 42, 0.95)"
              stroke="rgba(212, 175, 55, 0.9)"
              strokeWidth={1.5}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fill="#fef08a"
              fontSize={10}
              fontWeight={700}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              + Parent
            </text>
          </g>

          {/* Bottom Handle: + Child */}
          <g
            className="action-handle handle-child"
            transform={`translate(${node.width / 2}, ${node.height + 12})`}
            onClick={(e) => {
              e.stopPropagation();
              onAddRelative?.(node, 'child');
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={-28}
              y={-10}
              width={56}
              height={20}
              rx={10}
              fill="rgba(15, 23, 42, 0.95)"
              stroke="rgba(59, 130, 246, 0.9)"
              strokeWidth={1.5}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fill="#93c5fd"
              fontSize={10}
              fontWeight={700}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              + Child
            </text>
          </g>

          {/* Side Handle: + Spouse */}
          <g
            className="action-handle handle-spouse"
            transform={`translate(${node.width + 32}, ${node.height / 2})`}
            onClick={(e) => {
              e.stopPropagation();
              onAddRelative?.(node, 'spouse');
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={-30}
              y={-10}
              width={60}
              height={20}
              rx={10}
              fill="rgba(15, 23, 42, 0.95)"
              stroke="rgba(236, 72, 153, 0.9)"
              strokeWidth={1.5}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fill="#f472b6"
              fontSize={10}
              fontWeight={700}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              + Spouse
            </text>
          </g>

          {/* Action Toolbar: Connect & Dissolve */}
          <g
            className="action-handle-toolbar"
            transform={`translate(${node.width / 2}, ${node.height + 34})`}
          >
            {/* Connect Button */}
            <g
              transform="translate(-30, 0)"
              onClick={(e) => {
                e.stopPropagation();
                onStartConnect?.(node);
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={-25}
                y={-8}
                width={50}
                height={16}
                rx={8}
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(168, 85, 247, 0.85)"
                strokeWidth={1.2}
              />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fill="#c084fc"
                fontSize={9}
                fontWeight={600}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                🔗 Link
              </text>
            </g>

            {/* Dissolve Button */}
            <g
              transform="translate(30, 0)"
              onClick={(e) => {
                e.stopPropagation();
                onStartDissolve?.(node);
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={-27}
                y={-8}
                width={54}
                height={16}
                rx={8}
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(239, 68, 68, 0.85)"
                strokeWidth={1.2}
              />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fill="#f87171"
                fontSize={9}
                fontWeight={600}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                🗑️ Delete
              </text>
            </g>
          </g>
        </g>
      )}
    </g>
  );
};

export default React.memo(NodeCard);
