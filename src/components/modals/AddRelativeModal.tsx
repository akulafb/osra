import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import Button from '@mui/material/Button';
import { useTheme, type Theme } from '@mui/material/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useCanvasMode } from '../../hooks/useCanvasMode';
import { FamilyLink, FamilyNode, PersonGender } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import {
  connectedPersonIds,
  readMatchResolution,
  SPELLING_MATCH_LABEL,
} from '../../lib/personMatch';
import { usePersonMatch } from '../../hooks/usePersonMatch';
import {
  createTreeRecord,
  parentRoleForGender,
  pendingKinshipLinks,
  relativeToKinshipLink,
  relativeToKinshipLinks,
  type AddLinkParams,
} from '../../lib/treeRecord';
import { NO_OTHER_PARENT, otherParentChoice, stillOfferedOtherParent } from '../../lib/otherParent';
import { useOtherParentPick } from '../../hooks/useOtherParentPick';
import { useWorkingRecord } from '../../contexts/WorkingRecordContext';
import { linkWriteOutcome } from '../../hooks/useWorkingRecord';
import { addRelativeOverlayStyle } from './addRelativeOverlay';

interface AddRelativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: FamilyNode;
  /** The whole Tree Record, unfiltered — a filter must not hide a Person Match. */
  existingNodes: FamilyNode[];
  /** Ids currently drawn, so matches the filter is hiding can say so. */
  visibleIds?: ReadonlySet<string>;
  /** Every Kinship Link in the Tree Record; already-linked matches are marked. */
  existingLinks?: FamilyLink[];
  /** Called when user selects/clears a connect-to-existing target (for tree preview). */
  onPendingConnectTargetChange?: (existingNodeId: string | null) => void;
}

type RelationshipType = 'parent' | 'child' | 'spouse' | 'sibling';

const MAX_NAME_LENGTH = 200;

function subscribePreviewNarrow(cb: () => void) {
  const mq = window.matchMedia('(max-width: 768px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getPreviewNarrowSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function getPreviewNarrowServer() {
  return false;
}

export default function AddRelativeModal({
  isOpen,
  onClose,
  targetNode,
  existingNodes,
  visibleIds,
  existingLinks,
  onPendingConnectTargetChange,
}: AddRelativeModalProps) {
  const { user, isAdmin, session } = useAuth();
  const { write } = useWorkingRecord();
  const theme = useTheme();
  const { modal, panel, primary } = theme.palette;
  const isPaper = useCanvasMode().mode === 'paper';
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('child');
  const [parentRole, setParentRole] = useState<'mother' | 'father' | null>(null);
  const [gender, setGender] = useState<PersonGender | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedDifferentPerson, setConfirmedDifferentPerson] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);

  const connectedIds = useMemo(
    () => connectedPersonIds(existingLinks ?? [], targetNode.id),
    [existingLinks, targetNode.id]
  );

  // The same Person Match path as the Ghost Node, Spelling Matches included.
  const resolution = usePersonMatch({
    query: name,
    intent: 'creating',
    pool: existingNodes,
    excludePersonId: targetNode.id,
    visibleIds,
    connectedIds,
  });

  // Only an exact given-name collision is a question worth blocking on; the
  // old guard fired on any substring, so "Bad" stopped the Badran cluster.
  // A Spelling Match is advice too — see ADR-0005.
  const { matches, hiddenMatchCount, mustConfirm: mustConfirmMatch } =
    readMatchResolution(resolution);
  const isPreviewConnectMode = Boolean(selectedExistingId);
  const previewNarrow = useSyncExternalStore(
    subscribePreviewNarrow,
    getPreviewNarrowSnapshot,
    getPreviewNarrowServer
  );

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setRelationship('child');
      setParentRole(null);
      setGender(null);
      setError(null);
      setConfirmedDifferentPerson(false);
      setSelectedExistingId(null);
      onPendingConnectTargetChange?.(null);
    }
  }, [isOpen, onPendingConnectTargetChange]);

  useEffect(() => {
    if (!isOpen) return;
    onPendingConnectTargetChange?.(selectedExistingId);
  }, [isOpen, selectedExistingId, onPendingConnectTargetChange]);

  // A parent link's role follows the parent's gender, and the server refuses
  // one that disagrees: when the anchor's gender is recorded, adding a child
  // has no "I am the…" choice to make.
  const anchorParentRole = parentRoleForGender(targetNode.gender);
  const childParentRole = anchorParentRole ?? parentRole;

  useEffect(() => {
    if (!isOpen) return;
    setConfirmedDifferentPerson(false);
    setSelectedExistingId(null);
  }, [name, relationship, parentRole, isOpen]);

  // A child gets the anchor's spouse as its other parent too (LIN-79); an
  // existing child who already has another parent gets none. Recomputed per
  // opening, so a pick from last time is not kept.
  const otherParent = useMemo(
    () =>
      isOpen && relationship === 'child'
        ? otherParentChoice(targetNode.id, existingLinks ?? [], selectedExistingId ?? undefined)
        : NO_OTHER_PARENT,
    [isOpen, relationship, targetNode.id, existingLinks, selectedExistingId]
  );
  const [otherParentId, setOtherParentId] = useOtherParentPick(otherParent);
  // At submit, the same rule as the canvas handlers: only someone the latest
  // links still offer for this child is linked.
  const otherParentToLink = (childId?: string) =>
    relationship === 'child'
      ? stillOfferedOtherParent(otherParentChoice(targetNode.id, existingLinks ?? [], childId), otherParentId)
      : null;
  const personName = (id: string) => {
    const person = existingNodes.find((p) => p.id === id);
    return person ? formatNodeDisplayName(person) : 'Unknown';
  };

  /**
   * Both paths apply to the Working Record before the request goes out, and
   * confirm, revert or drop against what it answers (D9). The modal still
   * awaits: it is the one surface that reports a rejection inline rather than
   * through a browser alert.
   */
  const linkExisting = async (existingId: string) => {
    if (!user) return;
    const record = createTreeRecord({
      userId: user.id,
      isAdmin,
      sessionToken: session?.access_token,
    });
    // A sibling shares parents rather than being linked to the anchor, so no
    // single Kinship Link says it; this is the long-standing approximation,
    // unchanged.
    const existingParentRole = parentRoleForGender(
      existingNodes.find((person) => person.id === existingId)?.gender
    );
    const linkedOtherParentId = otherParentToLink(existingId);
    const kinship: AddLinkParams =
      relationship === 'sibling'
        ? { sourceId: targetNode.id, targetId: existingId, type: 'parent', parentRole: null }
        : {
            ...relativeToKinshipLink(
              targetNode.id,
              existingId,
              relationship,
              relationship === 'parent' ? existingParentRole : childParentRole
            ),
            otherParentId: linkedOtherParentId,
          };

    await write(
      pendingKinshipLinks(kinship, existingNodes).map((link) => ({ kind: 'link-upsert' as const, link })),
      async () => linkWriteOutcome(await record.addLink(kinship))
    );
  };

  const createNew = async (sanitizedName: string) => {
    if (!user) return;
    const record = createTreeRecord({
      userId: user.id,
      isAdmin,
      sessionToken: session?.access_token,
    });
    // The Person's uuid is minted here so the optimistic Person and the row
    // the server writes are the same Person (D11).
    const personId = crypto.randomUUID();
    // The new Person is the parent when adding a parent, so the link's role
    // comes from the gender being entered; the server derives the same.
    const linkRole = relationship === 'parent' ? parentRoleForGender(gender) : childParentRole;
    const linkedOtherParentId = otherParentToLink();

    await write(
      [
        { kind: 'person-upsert', person: { id: personId, firstName: sanitizedName, gender } },
        ...relativeToKinshipLinks(
          targetNode.id,
          personId,
          relationship,
          existingLinks ?? [],
          linkRole,
          linkedOtherParentId
            ? existingNodes.find((p) => p.id === linkedOtherParentId) ?? { id: linkedOtherParentId }
            : null
        ).map((link) => ({ kind: 'link-upsert' as const, link })),
      ],
      async () => ({
        kind: 'confirmed',
        rows: await record.addPerson({
          id: personId,
          firstName: sanitizedName,
          gender,
          link: {
            targetId: targetNode.id,
            relation: relationship,
            parentRole: childParentRole,
            otherParentId: linkedOtherParentId,
          },
        }),
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!user || !sanitizedName) return;

    if (mustConfirmMatch && !confirmedDifferentPerson && !selectedExistingId) {
      setError('Choose an existing person to connect to, or confirm this is a different person.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (selectedExistingId) {
        await linkExisting(selectedExistingId);
      } else {
        await createNew(sanitizedName);
      }
      onClose();
    } catch (err) {
      console.error('[AddRelativeModal] Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectExisting = (id: string) => {
    setSelectedExistingId(id);
    setConfirmedDifferentPerson(false);
  };

  const handleConfirmDifferentPerson = () => {
    setConfirmedDifferentPerson(true);
    setSelectedExistingId(null);
  };

  if (!isOpen) return null;

  const overlayStyle = addRelativeOverlayStyle(theme, {
    previewConnect: isPreviewConnectMode,
    previewNarrow,
  });

  const panelStyle: React.CSSProperties = isPreviewConnectMode
    ? {
        ...modalContentStyle(theme),
        pointerEvents: 'auto',
        maxHeight: previewNarrow ? 'min(44vh, 420px)' : 'min(85vh, 900px)',
        overflowY: 'auto',
        alignSelf: previewNarrow ? 'stretch' : 'center',
        margin: previewNarrow ? '0' : '16px',
        marginLeft: previewNarrow ? '0' : 'auto',
        marginRight: previewNarrow ? '0' : '16px',
        marginTop: previewNarrow ? 'auto' : undefined,
        marginBottom: previewNarrow ? '0' : undefined,
        maxWidth: previewNarrow ? '100%' : 'min(420px, 92vw)',
        width: previewNarrow ? '100%' : undefined,
        borderRadius: previewNarrow ? '12px 12px 0 0' : '12px',
        boxShadow: `0 -8px 40px ${modal.previewShadow}`,
      }
    : modalContentStyle(theme);

  const primaryDisabled =
    isSubmitting ||
    !name.trim() ||
    (mustConfirmMatch && !confirmedDifferentPerson && !selectedExistingId);

  const primaryLabel = isSubmitting
    ? 'Working…'
    : selectedExistingId
      ? 'Connect to tree'
      : 'Add to tree';

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {isPreviewConnectMode && (
          <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: primary.main, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Preview: {isPaper ? 'dashed ink line' : 'cyan dashed line'} shows the link that will be created.
          </p>
        )}
        <h2 style={{ 
          marginTop: 0, 
          fontFamily: '"Lora", serif', 
          fontSize: '1.5rem',
          color: panel.ink.strong,
          marginBottom: '24px'
        }}>
          Add relative to {formatNodeDisplayName(targetNode)}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle(theme)}>FIRST NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Given name only"
              style={inputStyle(theme)}
              maxLength={MAX_NAME_LENGTH}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle(theme)}>RELATIONSHIP</label>
            <select
              value={relationship}
              onChange={(e) => {
                setRelationship(e.target.value as RelationshipType);
                if (e.target.value !== 'child') setParentRole(null);
              }}
              style={inputStyle(theme)}
            >
              <option value="child">Add as child</option>
              <option value="parent">Add as parent</option>
              <option value="spouse">Add as spouse</option>
              <option value="sibling">Add as sibling</option>
            </select>
          </div>

          {!selectedExistingId && (
            <div style={fieldStyle}>
              <label style={labelStyle(theme)}>GENDER</label>
              <select
                value={gender ?? ''}
                onChange={(e) => setGender(e.target.value ? (e.target.value as PersonGender) : null)}
                style={inputStyle(theme)}
              >
                <option value="">Not recorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          )}

          {relationship === 'child' && anchorParentRole && (
            <div style={fieldStyle}>
              <label style={labelStyle(theme)}>I AM THE…</label>
              <p style={{ margin: 0, fontSize: '0.9rem', color: panel.ink.strong }}>
                {anchorParentRole === 'mother' ? 'Mother' : 'Father'}
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: modal.ink.hint, fontStyle: 'italic' }}>
                From {formatNodeDisplayName(targetNode)}&apos;s recorded gender
              </p>
            </div>
          )}

          {relationship === 'child' && !anchorParentRole && (
            <div style={fieldStyle}>
              <label style={labelStyle(theme)}>I AM THE…</label>
              <select
                value={parentRole ?? ''}
                onChange={(e) =>
                  setParentRole(e.target.value ? (e.target.value as 'mother' | 'father') : null)
                }
                style={inputStyle(theme)}
              >
                <option value="">— Select (optional) —</option>
                <option value="mother">Mother</option>
                <option value="father">Father</option>
              </select>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: modal.ink.hint, fontStyle: 'italic' }}>
                Helps show children on both parents&apos; family trees
              </p>
            </div>
          )}

          {otherParent.kind === 'one' && (
            <div style={fieldStyle}>
              <label style={labelStyle(theme)}>OTHER PARENT</label>
              <p style={{ margin: 0, fontSize: '0.9rem', color: panel.ink.strong }}>{personName(otherParent.personId)}</p>
            </div>
          )}

          {otherParent.kind === 'choose' && (
            <div style={fieldStyle}>
              <label style={labelStyle(theme)}>OTHER PARENT</label>
              <select
                value={otherParentId ?? ''}
                onChange={(e) => setOtherParentId(e.target.value || null)}
                style={inputStyle(theme)}
              >
                {otherParent.candidates.map(({ personId, current }) => (
                  <option key={personId} value={personId}>
                    {current ? personName(personId) : `${personName(personId)} (former)`}
                  </option>
                ))}
                <option value="">Not known</option>
              </select>
            </div>
          )}

          {matches.length > 0 && (
            <div style={warningStyle(theme)}>
              <strong style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCHES DETECTED IN ARCHIVE</strong>
              <p style={{ fontSize: '0.8rem', margin: '8px 0', color: panel.ink.body }}>
                {mustConfirmMatch
                  ? 'Select someone to connect, or confirm this is a new entry.'
                  : 'Someone here may already be this person. Connecting is optional.'}
              </p>
              <ul style={{ margin: '12px 0', paddingLeft: '0', listStyle: 'none' }}>
                {matches.map(({ person, isSpellingVariant, isVisible, isAlreadyConnected }) => (
                  <li key={person.id} style={{ marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => selectExisting(person.id)}
                      disabled={isAlreadyConnected}
                      style={{
                        ...matchRowStyle(theme),
                        cursor: isAlreadyConnected ? 'default' : 'pointer',
                        opacity: isAlreadyConnected ? 0.55 : 1,
                        borderColor:
                          selectedExistingId === person.id ? primary.main : panel.border.subtle,
                        backgroundColor:
                          selectedExistingId === person.id
                            ? panel.tint.accent
                            : modal.optionSurface,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: panel.ink.strong }}>
                        {formatNodeDisplayName(person)}
                      </span>
                      {(isSpellingVariant || !isVisible || isAlreadyConnected) && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: modal.ink.meta,
                            display: 'block',
                            marginTop: '2px',
                          }}
                        >
                          {[
                            isSpellingVariant ? SPELLING_MATCH_LABEL : null,
                            !isVisible ? 'hidden by filter' : null,
                            isAlreadyConnected ? 'already connected' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: modal.ink.hint,
                          fontFamily: 'monospace',
                          display: 'block',
                          wordBreak: 'break-all',
                          marginTop: '2px'
                        }}
                      >
                        {person.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {hiddenMatchCount > 0 && (
                <p style={{ fontSize: '0.7rem', margin: '0 0 8px 0', color: panel.ink.faint }}>
                  +{hiddenMatchCount} more match{hiddenMatchCount === 1 ? '' : 'es'} not shown.
                </p>
              )}
              {/* Only a must-confirm resolution blocks submit, so only it needs an answer. */}
              {mustConfirmMatch && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '16px' }}>
                <input
                  type="checkbox"
                  checked={confirmedDifferentPerson}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleConfirmDifferentPerson();
                    } else {
                      setConfirmedDifferentPerson(false);
                    }
                  }}
                  style={{ accentColor: primary.main }}
                />
                <span style={{ fontSize: '0.8rem', color: modal.ink.secondary }}>I am adding a totally different person</span>
              </label>
              )}
            </div>
          )}

          {error && <div style={errorStyle(theme)}>{error}</div>}

          <div style={actionsStyle}>
            <Button 
              variant="text" 
              onClick={onClose} 
              disabled={isSubmitting}
              sx={{ color: panel.ink.faint, fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={primaryDisabled}
              sx={{ 
                background: modal.submit,
                fontWeight: 700,
                letterSpacing: '0.05em',
                px: 3
              }}
            >
              {primaryLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalContentStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.surface,
  backdropFilter: 'blur(24px)',
  color: palette.panel.ink.strong,
  padding: '40px',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '480px',
  boxShadow: `0 20px 60px ${palette.panel.shadow.raised}`,
  border: `1px solid ${palette.panel.border.accent}`,
});

const fieldStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const labelStyle = ({ palette }: Theme): React.CSSProperties => ({
  display: 'block',
  marginBottom: '10px',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: palette.primary.main,
});

const inputStyle = ({ palette }: Theme): React.CSSProperties => ({
  width: '100%',
  padding: '14px',
  borderRadius: '4px',
  border: `1px solid ${palette.modal.field.border}`,
  backgroundColor: palette.modal.field.surface,
  color: palette.panel.ink.strong,
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  fontFamily: '"Inter", sans-serif',
});

const warningStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.notice.surface,
  border: `1px solid ${palette.modal.notice.border}`,
  color: palette.primary.main,
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '24px',
});

const matchRowStyle = ({ palette }: Theme): React.CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  padding: '12px 16px',
  borderRadius: '4px',
  border: `1px solid ${palette.panel.border.subtle}`,
  color: palette.panel.ink.strong,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
});

const errorStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.status.errorSurface,
  border: `1px solid ${palette.modal.status.errorBorder}`,
  color: palette.error.main,
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
  fontSize: '0.85rem',
});

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '16px',
  marginTop: '40px',
};
