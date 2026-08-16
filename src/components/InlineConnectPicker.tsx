import React, { useState, useMemo, useEffect } from 'react';
import { Node2D, FamilyGraph } from '../types/graph';
import { validateProposedLink } from '../lib/adminGraphValidation';

export interface InlineConnectPickerProps {
  sourceNode: Node2D;
  targetNode: Node2D;
  graphData: FamilyGraph;
  onConfirm: (
    type: 'parent' | 'marriage' | 'divorce',
    parentRole?: 'mother' | 'father' | null,
    parentIsSource?: boolean
  ) => Promise<void> | void;
  onCancel: () => void;
}

export const PICKER_WIDTH = 260;
export const PICKER_HEIGHT = 220;

export const InlineConnectPicker: React.FC<InlineConnectPickerProps> = ({
  sourceNode,
  targetNode,
  graphData,
  onConfirm,
  onCancel,
}) => {
  const [selectedRel, setSelectedRel] = useState<'parent-source' | 'parent-target' | 'marriage' | 'divorce'>('marriage');
  const [parentRole, setParentRole] = useState<'mother' | 'father' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Position between source and target, or centered on target
  const posX = (sourceNode.x + targetNode.x) / 2;
  const posY = Math.min(sourceNode.y, targetNode.y) - 40;

  // Validate options
  const options = useMemo(() => {
    // 1. Source is parent of Target
    const vSourceParent = validateProposedLink(graphData, {
      source: sourceNode.id,
      target: targetNode.id,
      type: 'parent',
      parentRole: parentRole,
    });

    // 2. Target is parent of Source
    const vTargetParent = validateProposedLink(graphData, {
      source: targetNode.id,
      target: sourceNode.id,
      type: 'parent',
      parentRole: parentRole,
    });

    // 3. Marriage
    const vMarriage = validateProposedLink(graphData, {
      source: sourceNode.id,
      target: targetNode.id,
      type: 'marriage',
    });

    // 4. Divorce
    const vDivorce = validateProposedLink(graphData, {
      source: sourceNode.id,
      target: targetNode.id,
      type: 'divorce',
    });

    return {
      sourceParent: vSourceParent,
      targetParent: vTargetParent,
      marriage: vMarriage,
      divorce: vDivorce,
    };
  }, [graphData, sourceNode.id, targetNode.id, parentRole]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (selectedRel === 'parent-source') {
        if (!options.sourceParent.ok) {
          setSubmitError(options.sourceParent.message);
          return;
        }
        await Promise.resolve(onConfirm('parent', parentRole, true));
      } else if (selectedRel === 'parent-target') {
        if (!options.targetParent.ok) {
          setSubmitError(options.targetParent.message);
          return;
        }
        await Promise.resolve(onConfirm('parent', parentRole, false));
      } else if (selectedRel === 'marriage') {
        if (!options.marriage.ok) {
          setSubmitError(options.marriage.message);
          return;
        }
        await Promise.resolve(onConfirm('marriage', null));
      } else if (selectedRel === 'divorce') {
        if (!options.divorce.ok) {
          setSubmitError(options.divorce.message);
          return;
        }
        await Promise.resolve(onConfirm('divorce', null));
      }
    } catch (err) {
      console.error('[InlineConnectPicker] Error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div
          style={{
            width: `${PICKER_WIDTH}px`,
            background: 'rgba(15, 23, 42, 0.98)',
            backdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(168, 85, 247, 0.8)',
            borderRadius: '12px',
            boxShadow: '0 0 25px rgba(168, 85, 247, 0.35), 0 10px 40px rgba(0,0,0,0.7)',
            padding: '12px 14px',
            boxSizing: 'border-box',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'ghostCardPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              paddingBottom: '6px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc' }}>
              Connect {sourceNode.firstName} ↔ {targetNode.firstName}
            </div>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0',
                lineHeight: 1,
              }}
              title="Cancel (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Relationship choices */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* 1. Source is parent of Target */}
            <button
              type="button"
              disabled={!options.sourceParent.ok}
              onClick={() => setSelectedRel('parent-source')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '6px',
                border: selectedRel === 'parent-source' ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                background: selectedRel === 'parent-source' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                color: options.sourceParent.ok ? '#fff' : 'rgba(255,255,255,0.3)',
                cursor: options.sourceParent.ok ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                fontWeight: 600,
                textAlign: 'left',
              }}
              title={!options.sourceParent.ok ? options.sourceParent.message : undefined}
            >
              <span>👶 {sourceNode.firstName} is parent of {targetNode.firstName}</span>
              {selectedRel === 'parent-source' && <span style={{ color: '#38bdf8' }}>✓</span>}
            </button>

            {/* 2. Target is parent of Source */}
            <button
              type="button"
              disabled={!options.targetParent.ok}
              onClick={() => setSelectedRel('parent-target')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '6px',
                border: selectedRel === 'parent-target' ? '1.5px solid #fef08a' : '1px solid rgba(255,255,255,0.1)',
                background: selectedRel === 'parent-target' ? 'rgba(254, 240, 138, 0.2)' : 'rgba(255,255,255,0.04)',
                color: options.targetParent.ok ? '#fff' : 'rgba(255,255,255,0.3)',
                cursor: options.targetParent.ok ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                fontWeight: 600,
                textAlign: 'left',
              }}
              title={!options.targetParent.ok ? options.targetParent.message : undefined}
            >
              <span>🧑‍🦳 {targetNode.firstName} is parent of {sourceNode.firstName}</span>
              {selectedRel === 'parent-target' && <span style={{ color: '#fef08a' }}>✓</span>}
            </button>

            {/* 3. Marriage */}
            <button
              type="button"
              disabled={!options.marriage.ok}
              onClick={() => setSelectedRel('marriage')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '6px',
                border: selectedRel === 'marriage' ? '1.5px solid #f472b6' : '1px solid rgba(255,255,255,0.1)',
                background: selectedRel === 'marriage' ? 'rgba(244, 114, 182, 0.2)' : 'rgba(255,255,255,0.04)',
                color: options.marriage.ok ? '#fff' : 'rgba(255,255,255,0.3)',
                cursor: options.marriage.ok ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                fontWeight: 600,
                textAlign: 'left',
              }}
              title={!options.marriage.ok ? options.marriage.message : undefined}
            >
              <span>💍 Married / Partners</span>
              {selectedRel === 'marriage' && <span style={{ color: '#f472b6' }}>✓</span>}
            </button>

            {/* 4. Divorce */}
            <button
              type="button"
              disabled={!options.divorce.ok}
              onClick={() => setSelectedRel('divorce')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '6px',
                border: selectedRel === 'divorce' ? '1.5px solid #94a3b8' : '1px solid rgba(255,255,255,0.1)',
                background: selectedRel === 'divorce' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(255,255,255,0.04)',
                color: options.divorce.ok ? '#fff' : 'rgba(255,255,255,0.3)',
                cursor: options.divorce.ok ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                fontWeight: 600,
                textAlign: 'left',
              }}
              title={!options.divorce.ok ? options.divorce.message : undefined}
            >
              <span>💔 Divorced</span>
              {selectedRel === 'divorce' && <span style={{ color: '#94a3b8' }}>✓</span>}
            </button>
          </div>

          {/* Optional Parent Role Selector for parent links */}
          {(selectedRel === 'parent-source' || selectedRel === 'parent-target') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>Role:</span>
              <button
                type="button"
                onClick={() => setParentRole(parentRole === 'father' ? null : 'father')}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: parentRole === 'father' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
                  background: parentRole === 'father' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  color: '#fff',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Father
              </button>
              <button
                type="button"
                onClick={() => setParentRole(parentRole === 'mother' ? null : 'mother')}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: parentRole === 'mother' ? '1px solid #f472b6' : '1px solid rgba(255,255,255,0.15)',
                  background: parentRole === 'mother' ? 'rgba(244, 114, 182, 0.25)' : 'transparent',
                  color: '#fff',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Mother
              </button>
            </div>
          )}

          {/* Error Message if any */}
          {submitError && (
            <div style={{ fontSize: '10px', color: '#f87171', fontWeight: 600 }}>
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirm}
              style={{
                flex: 1.5,
                padding: '6px',
                borderRadius: '6px',
                border: 'none',
                background: '#a855f7',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: isSubmitting ? 'default' : 'pointer',
                boxShadow: '0 0 12px rgba(168, 85, 247, 0.5)',
              }}
            >
              {isSubmitting ? 'Linking…' : 'Establish Link'}
            </button>
          </div>
        </div>
      </foreignObject>
    </g>
  );
};
