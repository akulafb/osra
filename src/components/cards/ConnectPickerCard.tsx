import React, { useState, useMemo } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import { FamilyGraph } from '../../types/graph';
import {
  buildConnectOptions,
  resolveConnectSelection,
  ConnectSelection,
  KinshipLinkType,
  ParentRole,
} from './connectOptions';
import { OtherParentPicker } from './OtherParentPicker';
import { NO_OTHER_PARENT, otherParentChoice } from '../../lib/otherParent';
import { useOtherParentPick } from '../../hooks/useOtherParentPick';

/**
 * The inline kinship picker: choose which Kinship Link joins two people, with
 * impossible choices disabled up front.
 *
 * Presentational and unpositioned — the 2D view mounts it inside an SVG
 * `<foreignObject>`; the 3D view (LIN-48, not yet built) will mount it in a
 * screen-docked panel.
 */
export interface ConnectPickerCardProps {
  sourceId: string;
  sourceFirstName: string;
  targetId: string;
  targetFirstName: string;
  graphData: FamilyGraph;
  isAdmin?: boolean;
  onConfirm: (
    type: KinshipLinkType,
    parentRole?: ParentRole,
    parentIsSource?: boolean,
    /** For a parent link: the parent's spouse, linked to the child too (LIN-79). */
    otherParentId?: string | null
  ) => Promise<void> | void;
  onCancel: () => void;
}

export const PICKER_CARD_WIDTH = 260;

export const ConnectPickerCard: React.FC<ConnectPickerCardProps> = ({
  sourceId,
  sourceFirstName,
  targetId,
  targetFirstName,
  graphData,
  isAdmin = true,
  onConfirm,
  onCancel,
}) => {
  const { panel, hud } = useTheme().palette;
  const [selectedRel, setSelectedRel] = useState<ConnectSelection>('marriage');
  const [parentRole, setParentRole] = useState<ParentRole>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const options = useMemo(
    () => buildConnectOptions(graphData, sourceId, targetId, parentRole, isAdmin),
    [graphData, sourceId, targetId, parentRole, isAdmin]
  );

  const choice = useMemo(() => {
    if (selectedRel === 'parent-source') return otherParentChoice(sourceId, graphData.links, targetId);
    if (selectedRel === 'parent-target') return otherParentChoice(targetId, graphData.links, sourceId);
    return NO_OTHER_PARENT;
  }, [selectedRel, graphData.links, sourceId, targetId]);
  const [otherParentId, setOtherParentId] = useOtherParentPick(choice);

  const handleConfirm = async () => {
    const resolved = resolveConnectSelection(selectedRel, options, parentRole);
    if (!resolved.ok) {
      setSubmitError(resolved.message);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { type, parentRole: role, parentIsSource } = resolved.confirmation;
      await Promise.resolve(onConfirm(type, role, parentIsSource, type === 'parent' ? otherParentId : null));
    } catch (err) {
      console.error('[ConnectPickerCard] Error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Could not establish link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const choiceStyle = (
    selection: ConnectSelection,
    accent: string,
    enabled: boolean
  ): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    borderRadius: '6px',
    border: selectedRel === selection ? `1.5px solid ${accent}` : `1px solid ${panel.border.subtle}`,
    background: selectedRel === selection ? alpha(accent, 0.2) : hud.picker.choice,
    color: enabled ? panel.ink.strong : panel.ink.ghost,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: '11px',
    fontWeight: 600,
    textAlign: 'left',
  });

  const choices: {
    selection: ConnectSelection;
    accent: string;
    validation: { ok: boolean; message?: string };
    label: React.ReactNode;
  }[] = [
    {
      selection: 'parent-source',
      accent: hud.kinship.parentSource,
      validation: options.sourceParent,
      label: <span>👶 {sourceFirstName} is parent of {targetFirstName}</span>,
    },
    {
      selection: 'parent-target',
      accent: hud.kinship.parentTarget,
      validation: options.targetParent,
      label: <span>🧑‍🦳 {targetFirstName} is parent of {sourceFirstName}</span>,
    },
    {
      selection: 'marriage',
      accent: hud.kinship.marriage,
      validation: options.marriage,
      label: <span>💍 Married / Partners</span>,
    },
    {
      selection: 'divorce',
      accent: hud.kinship.divorce,
      validation: options.divorce,
      label: <span>💔 Divorced</span>,
    },
  ];

  const isParentChoice = selectedRel === 'parent-source' || selectedRel === 'parent-target';

  return (
    <div
      style={{
        width: `${PICKER_CARD_WIDTH}px`,
        background: hud.picker.surface,
        backdropFilter: 'blur(20px)',
        border: `1.5px solid ${hud.picker.border}`,
        borderRadius: '12px',
        boxShadow: `0 0 25px ${hud.picker.glow}, 0 10px 40px ${hud.card.shadow}`,
        padding: '12px 14px',
        boxSizing: 'border-box',
        color: panel.ink.strong,
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
          borderBottom: `1px solid ${panel.border.subtle}`,
          paddingBottom: '6px',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, color: hud.card.highlight }}>
          Connect {sourceFirstName} ↔ {targetFirstName}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: panel.ink.muted,
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
        {choices.map(({ selection, accent, validation, label }) => (
          <button
            key={selection}
            type="button"
            disabled={!validation.ok}
            onClick={() => setSelectedRel(selection)}
            style={choiceStyle(selection, accent, validation.ok)}
            title={!validation.ok ? validation.message : undefined}
          >
            {label}
            {selectedRel === selection && <span style={{ color: accent }}>✓</span>}
          </button>
        ))}
      </div>

      {/* Optional Parent Role Selector for parent links */}
      {isParentChoice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
          <span style={{ color: panel.ink.body }}>Role:</span>
          {(['father', 'mother'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setParentRole(parentRole === role ? null : role)}
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                border:
                  parentRole === role
                    ? `1px solid ${role === 'father' ? hud.kinship.father : hud.kinship.mother}`
                    : `1px solid ${hud.card.border}`,
                background:
                  parentRole === role
                    ? role === 'father'
                      ? hud.kinship.fatherTint
                      : hud.kinship.motherTint
                    : 'transparent',
                color: panel.ink.strong,
                fontSize: '9px',
                cursor: 'pointer',
              }}
            >
              {role === 'father' ? 'Father' : 'Mother'}
            </button>
          ))}
        </div>
      )}

      <OtherParentPicker choice={choice} people={graphData.nodes} value={otherParentId} onChange={setOtherParentId} />

      {/* Error Message if any */}
      {submitError && (
        <div style={{ fontSize: '10px', color: hud.card.error, fontWeight: 600 }}>{submitError}</div>
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
            border: `1px solid ${hud.card.controlBorder}`,
            background: 'transparent',
            color: hud.card.inkSecondary,
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
            background: hud.picker.confirm,
            color: panel.ink.strong,
            fontSize: '11px',
            fontWeight: 700,
            cursor: isSubmitting ? 'default' : 'pointer',
            boxShadow: `0 0 12px ${hud.picker.confirmGlow}`,
          }}
        >
          {isSubmitting ? 'Linking…' : 'Establish Link'}
        </button>
      </div>
    </div>
  );
};
