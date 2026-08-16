import React from 'react';
import { FamilyNode } from '../types/graph';
import { TargetOption } from './cards/connectCandidates';
import { CONNECT_ACCENT } from './cards/relationStyle';

/**
 * The body of the docked panel while Connect Mode is aiming (LIN-50).
 *
 * The list is the answer to the problem 2D never had: a legitimate target can
 * be occluded, off-screen or a few pixels wide, so aiming alone would leave
 * people unlinkable from whatever viewpoint the user happens to be at. It
 * reuses the existing search result set rather than introducing a second way
 * to find someone.
 *
 * Presentational and unpositioned — the panel places it, and owns none of the
 * Connect Mode state it displays.
 */
export interface ConnectTargetingBodyProps {
  sourceNode: FamilyNode;
  /** The rows to offer — already ranked and capped by `buildTargetOptions`. */
  options: TargetOption[];
  /** Everyone linkable, which is usually more than the list can hold. */
  candidateCount: number;
  /** The whole pool the list was drawn from, before its cap. */
  optionTotal: number;
  /** How many of those the camera cannot currently see. */
  unreachableCount: number;
  /** The last aim that landed on someone who cannot be a target. */
  rejected: { node: FamilyNode; reason: string } | null;
  query: string;
  onQueryChange?: (query: string) => void;
  onPickTarget: (node: FamilyNode) => void;
  onExit: () => void;
}

export const ConnectTargetingBody: React.FC<ConnectTargetingBodyProps> = ({
  sourceNode,
  options,
  candidateCount,
  optionTotal,
  unreachableCount,
  rejected,
  query,
  onQueryChange,
  onPickTarget,
  onExit,
}) => {
  const truncated = Math.max(0, optionTotal - options.length);

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: CONNECT_ACCENT }}>
        🔗 Connect {sourceNode.firstName} to…
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
        {candidateCount === 0
          ? 'No one in view can be linked to this person yet.'
          : 'Click a glowing planet, or pick from the list.'}
        {unreachableCount > 0 && (
          <>
            {' '}
            <span style={{ color: '#fbbf24' }}>
              {unreachableCount} of {candidateCount} are out of view — search for them by name.
            </span>
          </>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => onQueryChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onExit();
          }
        }}
        placeholder="Search anyone by name…"
        dir="auto"
        aria-label="Search for a person to connect"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          color: '#fff',
          fontSize: 11,
          outline: 'none',
          padding: '6px 8px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}
      >
        {options.map(({ node, candidacy, visibility }) => (
          <button
            key={node.id}
            type="button"
            disabled={!candidacy.ok}
            onClick={() => onPickTarget(node)}
            title={candidacy.ok ? undefined : candidacy.reason}
            style={{
              alignItems: 'center',
              background: candidacy.ok ? 'rgba(192, 132, 252, 0.12)' : 'rgba(255,255,255,0.03)',
              border: candidacy.ok
                ? `1px solid ${CONNECT_ACCENT}66`
                : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: candidacy.ok ? '#fff' : 'rgba(255,255,255,0.35)',
              cursor: candidacy.ok ? 'pointer' : 'not-allowed',
              display: 'flex',
              fontSize: 11,
              gap: 6,
              justifyContent: 'space-between',
              padding: '5px 8px',
              textAlign: 'left',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.firstName}
              {node.familyCluster && (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {node.familyCluster}</span>
              )}
            </span>
            {candidacy.ok && visibility !== 'onscreen' && (
              <span
                style={{ color: '#fbbf24', flexShrink: 0 }}
                title={visibility === 'behind' ? 'Behind the camera' : 'Off-screen'}
              >
                ↗
              </span>
            )}
          </button>
        ))}
        {options.length === 0 && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {query.trim() ? 'No one matches that search.' : 'Nothing to link to here.'}
          </div>
        )}
      </div>

      {/* Saying how many were left out, rather than claiming the list is all of them. */}
      {truncated > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {truncated} more — narrow it with a search.
        </div>
      )}

      {rejected && (
        <div style={{ fontSize: 10, color: '#f87171', lineHeight: 1.4 }}>
          {rejected.node.firstName}: {rejected.reason}
        </div>
      )}

      <button
        type="button"
        onClick={onExit}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer',
          fontSize: 11,
          padding: '5px 8px',
        }}
      >
        Cancel (Esc)
      </button>
    </>
  );
};
