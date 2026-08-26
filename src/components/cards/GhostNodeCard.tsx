import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FamilyNode, RelativeDirection } from '../../types/graph';
import { matchExistingPersons } from '../../lib/personMatch';
import { relationColor, relationLabel } from './relationStyle';

/**
 * The Ghost Node card: name input, duplicate autocomplete, submit and cancel.
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
  /** The whole Tree Record, unfiltered — a filter must not hide a duplicate. */
  existingNodes: FamilyNode[];
  /** Ids currently drawn, so matches the filter is hiding can say so. */
  visibleIds?: ReadonlySet<string>;
  /** Ids already linked to the anchor, so they cannot be linked twice. */
  connectedIds?: ReadonlySet<string>;
  onSubmit: (name: string) => Promise<void> | void;
  onConnectExisting: (existingNodeId: string) => Promise<void> | void;
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
  onSubmit,
  onConnectExisting,
  onCancel,
  onNameChange,
}) => {
  const [name, setName] = useState('');
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

  const resolution = useMemo(
    () =>
      matchExistingPersons({
        query: name,
        intent: 'creating',
        pool: existingNodes,
        excludePersonId: anchorNodeId,
        visibleIds,
        connectedIds,
      }),
    [name, existingNodes, anchorNodeId, visibleIds, connectedIds]
  );

  const matches = resolution.kind === 'none' ? [] : resolution.matches;
  const hiddenMatchCount = resolution.kind === 'none' ? 0 : resolution.totalMatchCount - matches.length;
  // An exact given-name collision is a real question, so Enter waits for an
  // answer. Anything looser stays advisory — see ADR-0005.
  const mustConfirm = resolution.kind === 'must-confirm' && !confirmedDifferentPerson;
  const exactMatchName = matches.find((m) => m.isExactGivenName)?.person.firstName ?? name.trim();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting || mustConfirm) return;

    setIsSubmitting(true);
    try {
      await Promise.resolve(onSubmit(trimmed));
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
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(16px)',
        border: `1.5px dashed ${color}`,
        borderRadius: '10px',
        boxShadow: `0 0 20px ${color}33, 0 8px 30px rgba(0,0,0,0.6)`,
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
          disabled={!name.trim() || isSubmitting || mustConfirm}
          style={{
            background: name.trim() && !mustConfirm ? color : 'rgba(255,255,255,0.1)',
            color: name.trim() && !mustConfirm ? '#0f172a' : 'rgba(255,255,255,0.4)',
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

      {/* Person Match dropdown: connect to one of these, or say it is someone new */}
      {matches.length > 0 && (
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px',
              padding: '2px 4px',
            }}
          >
            <span style={{ fontSize: '9px', color: '#c084fc', fontWeight: 600 }}>
              Existing relative matches:
            </span>
            {resolution.kind === 'must-confirm' && (
              <button
                type="button"
                onClick={() => setConfirmedDifferentPerson(true)}
                disabled={confirmedDifferentPerson}
                style={{
                  background: confirmedDifferentPerson
                    ? 'rgba(168, 85, 247, 0.25)'
                    : 'transparent',
                  border: '1px solid rgba(168, 85, 247, 0.5)',
                  borderRadius: '4px',
                  color: '#e9d5ff',
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
          {matches.map(({ person, isVisible, isAlreadyConnected }) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onConnectExisting(person.id)}
              disabled={isAlreadyConnected}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                padding: '3px 6px',
                color: isAlreadyConnected ? '#94a3b8' : '#e2e8f0',
                fontSize: '10px',
                cursor: isAlreadyConnected ? 'default' : 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (isAlreadyConnected) return;
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {person.firstName}
                {!isVisible && (
                  <span style={{ fontWeight: 400, color: '#94a3b8' }}> · hidden by filter</span>
                )}
              </span>
              <span style={{ fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {isAlreadyConnected
                  ? 'already connected'
                  : `🔗 Link (${person.familyCluster ?? 'General'})`}
              </span>
            </button>
          ))}
          {hiddenMatchCount > 0 && (
            <div style={{ fontSize: '9px', color: '#64748b', padding: '0 4px 2px' }}>
              +{hiddenMatchCount} more not shown
            </div>
          )}
        </div>
      )}
    </div>
  );
};
