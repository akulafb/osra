import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Node2D, FamilyNode } from '../types/graph';
import { RelativeDirection } from './NodeCard';
import { nodeSearchHaystack } from '../utils/nodeDisplayName';

export interface GhostNodeProps {
  anchorNode: Node2D;
  relation: RelativeDirection;
  existingNodes: FamilyNode[];
  onSubmit: (name: string) => Promise<void> | void;
  onConnectExisting: (existingNodeId: string) => Promise<void> | void;
  onCancel: () => void;
}

export const GHOST_NODE_WIDTH = 190;
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

export const GhostNode: React.FC<GhostNodeProps> = ({
  anchorNode,
  relation,
  existingNodes,
  onSubmit,
  onConnectExisting,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pos = useMemo(() => getGhostNodePosition(anchorNode, relation), [anchorNode, relation]);

  useEffect(() => {
    // Focus input on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const duplicateCandidates = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return existingNodes
      .filter(
        (node) =>
          node.id !== anchorNode.id &&
          nodeSearchHaystack(node).toLowerCase().includes(q)
      )
      .slice(0, 4);
  }, [name, existingNodes, anchorNode.id]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await Promise.resolve(onSubmit(trimmed));
    } catch (err) {
      console.error('[GhostNode] Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const relationLabel = useMemo(() => {
    switch (relation) {
      case 'parent':
        return `+ Parent of ${anchorNode.firstName}`;
      case 'spouse':
        return `+ Spouse of ${anchorNode.firstName}`;
      case 'child':
      default:
        return `+ Child of ${anchorNode.firstName}`;
    }
  }, [relation, anchorNode.firstName]);

  const relationColor = useMemo(() => {
    switch (relation) {
      case 'parent':
        return '#fef08a';
      case 'spouse':
        return '#f472b6';
      case 'child':
      default:
        return '#93c5fd';
    }
  }, [relation]);

  // Coordinates for dashed connector line
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
        stroke={relationColor}
        strokeWidth={2}
        strokeDasharray="5 4"
        opacity={0.8}
      />

      {/* Ghost Card via foreignObject */}
      <foreignObject
        x={pos.x - GHOST_NODE_WIDTH / 2}
        y={pos.y}
        width={GHOST_NODE_WIDTH + 60}
        height={GHOST_NODE_HEIGHT + (duplicateCandidates.length > 0 ? 120 : 20)}
        style={{ overflow: 'visible' }}
      >
        <div
          style={{
            width: `${GHOST_NODE_WIDTH}px`,
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(16px)',
            border: `1.5px dashed ${relationColor}`,
            borderRadius: '10px',
            boxShadow: `0 0 20px ${relationColor}33, 0 8px 30px rgba(0,0,0,0.6)`,
            padding: '8px 10px',
            boxSizing: 'border-box',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            animation: 'ghostCardPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10px',
              fontWeight: 700,
              color: relationColor,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {relationLabel}
            </span>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0 2px',
                lineHeight: 1,
              }}
              title="Cancel (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              onKeyDown={handleKeyDown}
              placeholder="First name..."
              disabled={isSubmitting}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'rgba(30, 41, 59, 0.9)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '5px 8px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              style={{
                background: name.trim() ? relationColor : 'rgba(255,255,255,0.1)',
                color: name.trim() ? '#0f172a' : 'rgba(255,255,255,0.4)',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: name.trim() && !isSubmitting ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              title="Spawn relative (Enter)"
            >
              {isSubmitting ? '...' : '↵'}
            </button>
          </form>

          {/* Duplicate candidates autocomplete dropdown */}
          {duplicateCandidates.length > 0 && (
            <div
              style={{
                marginTop: '4px',
                background: 'rgba(10, 15, 30, 0.98)',
                border: '1px solid rgba(168, 85, 247, 0.5)',
                borderRadius: '6px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: '9px', color: '#c084fc', fontWeight: 600, padding: '2px 4px' }}>
                Existing relative matches:
              </div>
              {duplicateCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onConnectExisting(candidate.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    color: '#e2e8f0',
                    fontSize: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168, 85, 247, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{candidate.firstName}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                    🔗 Link ({candidate.familyCluster ?? 'General'})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
};
