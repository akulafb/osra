import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { FamilyNode, RelativeDirection } from '../../types/graph';
import { readMatchResolution, SPELLING_MATCH_LABEL } from '../../lib/personMatch';
import { usePersonMatch } from '../../hooks/usePersonMatch';
import { relationColor, relationLabel } from './relationStyle';
import { OtherParentPicker } from './OtherParentPicker';
import { NO_OTHER_PARENT, type OtherParentChoice } from '../../lib/otherParent';
import { useOtherParentPick } from '../../hooks/useOtherParentPick';

/**
 * The Ghost Node card: name input, Person Match dropdown, submit and cancel.
 *
 * Presentational and unpositioned — it renders at whatever origin its host
 * gives it. The 2D view mounts it inside an SVG `<foreignObject>` in graph
 * coordinates; the 3D view mounts it in a screen-docked panel. Knows nothing
 * about SVG, `Node2D`, or where on screen it sits.
 */
export interface GhostNodeCardProps {
  relation: RelativeDirection;
  /** Excluded from Person Matches — you cannot be your own relative. */
  anchorNodeId: string;
  /** Shown in the header, e.g. "+ Parent of Fahd". */
  anchorFirstName: string;
  /** The whole Tree Record, unfiltered — a filter must not hide a Person Match. */
  existingNodes: FamilyNode[];
  /** Ids currently drawn, so matches the filter is hiding can say so. */
  visibleIds?: ReadonlySet<string>;
  /** Ids already linked to the anchor, so they cannot be linked twice. */
  connectedIds?: ReadonlySet<string>;
  /**
   * With `relation: 'child'`: who else the new child's parent could be, from
   * the anchor's spouses (LIN-79). The card passes the pick up; the host
   * decides what is linked.
   */
  otherParentChoice?: OtherParentChoice;
  onSubmit: (name: string, otherParentId: string | null) => Promise<void> | void;
  onConnectExisting: (existingNodeId: string, otherParentId: string | null) => Promise<void> | void;
  onCancel: () => void;
  /**
   * Observes the name as it is typed. The 3D view mirrors it onto the Ghost
   * Preview in the scene; 2D ignores it. Called synchronously from the change
   * handler, so hosts never render a frame behind what the input shows.
   */
  onNameChange?: (name: string) => void;
}

export const GHOST_CARD_WIDTH = 190;

export const GhostNodeCard: React.FC<GhostNodeCardProps> = ({
  relation,
  anchorNodeId,
  anchorFirstName,
  existingNodes,
  visibleIds,
  connectedIds,
  otherParentChoice,
  onSubmit,
  onConnectExisting,
  onCancel,
  onNameChange,
}) => {
  const { panel, hud } = useTheme().palette;
  const [name, setName] = useState('');
  const choice = relation === 'child' && otherParentChoice ? otherParentChoice : NO_OTHER_PARENT;
  const [otherParentId, setOtherParentId] = useOtherParentPick(choice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedDifferentPerson, setConfirmedDifferentPerson] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const resolution = usePersonMatch({
    query: name,
    intent: 'creating',
    pool: existingNodes,
    excludePersonId: anchorNodeId,
    visibleIds,
    connectedIds,
  });

  // An exact given-name collision is a real question, so Enter waits for an
  // answer. Anything looser — a substring or a spelling match — stays advisory;
  // see ADR-0005.
  const { matches, hiddenMatchCount, mustConfirm: unresolved } = readMatchResolution(resolution);
  const mustConfirm = unresolved && !confirmedDifferentPerson;
  const exactMatchName = matches.find((m) => m.isExactGivenName)?.person.firstName ?? name.trim();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting || mustConfirm) return;

    setIsSubmitting(true);
    try {
      await Promise.resolve(onSubmit(trimmed, otherParentId));
    } catch (err) {
      console.error('[GhostNodeCard] Submit error:', err);
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

  const color = relationColor(relation);

  return (
    <div
      style={{
        width: `${GHOST_CARD_WIDTH}px`,
        background: hud.ghost.surface,
        backdropFilter: 'blur(16px)',
        border: `1.5px dashed ${color}`,
        borderRadius: '10px',
        boxShadow: `0 0 20px ${color}33, 0 8px 30px ${panel.shadow.raised}`,
        padding: '8px 10px',
        boxSizing: 'border-box',
        color: panel.ink.strong,
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
          color,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {relationLabel(relation, anchorFirstName)}
        </span>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: panel.ink.muted,
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
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            const next = e.target.value.slice(0, 100);
            setName(next);
            // A confirmation answers a question about one name; a different
            // name is a different question.
            setConfirmedDifferentPerson(false);
            onNameChange?.(next);
          }}
          onKeyDown={handleKeyDown}
          placeholder="First name..."
          disabled={isSubmitting}
          style={{
            flex: 1,
            minWidth: 0,
            background: hud.card.field,
            border: `1px solid ${hud.card.controlBorder}`,
            borderRadius: '6px',
            padding: '5px 8px',
            color: panel.ink.strong,
            fontSize: '12px',
            fontWeight: 600,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || isSubmitting || mustConfirm}
          style={{
            background: name.trim() && !mustConfirm ? color : hud.card.disabledFill,
            color: name.trim() && !mustConfirm ? hud.card.onAccent : hud.card.inkQuiet,
            border: 'none',
            borderRadius: '6px',
            padding: '5px 8px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: name.trim() && !isSubmitting && !mustConfirm ? 'pointer' : 'default',
            transition: 'all 0.15s ease',
          }}
          /* A refusal the user cannot see the reason for is the failure mode
             this block has to avoid, so the button says why it is disabled. */
          title={
            mustConfirm
              ? `Someone here is already called ${exactMatchName} — pick them, or confirm this is a different person`
              : 'Spawn relative (Enter)'
          }
        >
          {isSubmitting ? '...' : '↵'}
        </button>
      </form>

      <OtherParentPicker choice={choice} people={existingNodes} value={otherParentId} onChange={setOtherParentId} />

      {/* Person Match dropdown: connect to one of these, or say it is someone new */}
      {matches.length > 0 && (
        <div
          style={{
            marginTop: '4px',
            background: hud.ghost.matchSurface,
            border: `1px solid ${hud.ghost.matchBorder}`,
            borderRadius: '6px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            boxShadow: `0 4px 15px ${panel.shadow.floating}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px',
              padding: '2px 4px',
            }}
          >
            <span style={{ fontSize: '9px', color: hud.card.highlight, fontWeight: 600 }}>
              Existing relative matches:
            </span>
            {unresolved && (
              <button
                type="button"
                onClick={() => setConfirmedDifferentPerson(true)}
                disabled={confirmedDifferentPerson}
                style={{
                  background: confirmedDifferentPerson
                    ? hud.ghost.matchActive
                    : 'transparent',
                  border: `1px solid ${hud.ghost.matchBorder}`,
                  borderRadius: '4px',
                  color: hud.ghost.matchAction,
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  cursor: confirmedDifferentPerson ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="This is someone new, not any of these people"
              >
                {confirmedDifferentPerson ? '✓ Different person' : 'Different person'}
              </button>
            )}
          </div>
          {matches.map(({ person, isSpellingVariant, isVisible, isAlreadyConnected }) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onConnectExisting(person.id, otherParentId)}
              disabled={isAlreadyConnected}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '4px',
                background: panel.surface.control,
                border: `1px solid ${panel.border.subtle}`,
                borderRadius: '4px',
                padding: '3px 6px',
                color: isAlreadyConnected ? hud.ghost.matchMeta : hud.ghost.matchInk,
                fontSize: '10px',
                cursor: isAlreadyConnected ? 'default' : 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (isAlreadyConnected) return;
                e.currentTarget.style.background = hud.ghost.matchActive;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = panel.surface.control;
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {person.firstName}
                {isSpellingVariant && (
                  <span style={{ fontWeight: 400, color: hud.ghost.matchMeta }}> · {SPELLING_MATCH_LABEL}</span>
                )}
                {!isVisible && (
                  <span style={{ fontWeight: 400, color: hud.ghost.matchMeta }}> · hidden by filter</span>
                )}
              </span>
              <span style={{ fontSize: '9px', color: hud.ghost.matchMeta, whiteSpace: 'nowrap' }}>
                {isAlreadyConnected
                  ? 'already connected'
                  : `🔗 Link (${person.familyCluster ?? 'General'})`}
              </span>
            </button>
          ))}
          {hiddenMatchCount > 0 && (
            <div style={{ fontSize: '9px', color: hud.ghost.matchMore, padding: '0 4px 2px' }}>
              +{hiddenMatchCount} more not shown
            </div>
          )}
        </div>
      )}
    </div>
  );
};
