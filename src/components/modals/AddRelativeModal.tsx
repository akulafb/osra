import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import Button from '@mui/material/Button';
import { useAuth } from '../../contexts/AuthContext';
import { FamilyLink, FamilyNode } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { connectedPersonIds, matchExistingPersons } from '../../lib/personMatch';
import { createTreeRecord, relativeToKinshipLink } from '../../lib/treeRecord';

interface AddRelativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: FamilyNode;
  /** Called after a successful add/link; awaited before closing so the tree shows the real edge before the cyan preview is removed. */
  onSuccess: () => void | Promise<void>;
  /** The whole Tree Record, unfiltered — a filter must not hide a duplicate. */
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
  onSuccess,
  existingNodes,
  visibleIds,
  existingLinks,
  onPendingConnectTargetChange,
}: AddRelativeModalProps) {
  const { user, isAdmin, session } = useAuth();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('child');
  const [parentRole, setParentRole] = useState<'mother' | 'father' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedDifferentPerson, setConfirmedDifferentPerson] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);

  const connectedIds = useMemo(
    () => connectedPersonIds(existingLinks ?? [], targetNode.id),
    [existingLinks, targetNode.id]
  );

  const resolution = useMemo(
    () =>
      matchExistingPersons({
        query: name,
        intent: 'creating',
        pool: existingNodes,
        excludePersonId: targetNode.id,
        visibleIds,
        connectedIds,
      }),
    [name, existingNodes, targetNode.id, visibleIds, connectedIds]
  );

  const matches = resolution.kind === 'none' ? [] : resolution.matches;
  const hiddenMatchCount =
    resolution.kind === 'none' ? 0 : resolution.totalMatchCount - matches.length;
  // Only an exact given-name collision is a question worth blocking on; the
  // old guard fired on any substring, so "Bad" stopped the Badran cluster.
  const hasDuplicateConflict = resolution.kind === 'must-confirm';
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

  useEffect(() => {
    if (!isOpen) return;
    setConfirmedDifferentPerson(false);
    setSelectedExistingId(null);
  }, [name, relationship, parentRole, isOpen]);

  const callLinkExisting = async (existingId: string) => {
    if (!user) return;
    const record = createTreeRecord({
      userId: user.id,
      isAdmin,
      sessionToken: session?.access_token,
    });
    if (relationship === 'sibling') {
      // Direct kinship mapping for sibling is handled via parent links or link_existing_relative_secure
      // Since treeRecord handles spouse/child/parent, relativeToKinshipLink converts relative to kinship
      // For sibling, link_existing_relative_secure is used internally by addLink if needed or through custom spec
      await record.addLink({
        sourceId: targetNode.id,
        targetId: existingId,
        type: 'parent',
        parentRole: null,
      });
    } else {
      const kinship = relativeToKinshipLink(targetNode.id, existingId, relationship, parentRole);
      await record.addLink(kinship);
    }
  };

  const callCreateNew = async (sanitizedName: string) => {
    if (!user) return;
    const record = createTreeRecord({
      userId: user.id,
      isAdmin,
      sessionToken: session?.access_token,
    });
    await record.addPerson({
      firstName: sanitizedName,
      link: {
        targetId: targetNode.id,
        relation: relationship,
        parentRole,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!user || !sanitizedName) return;

    if (hasDuplicateConflict && !confirmedDifferentPerson && !selectedExistingId) {
      setError('Choose an existing person to connect to, or confirm this is a different person.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (selectedExistingId) {
        await callLinkExisting(selectedExistingId);
      } else {
        await callCreateNew(sanitizedName);
      }
      await Promise.resolve(onSuccess());
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

  const overlayStyle: React.CSSProperties = isPreviewConnectMode
    ? {
        ...modalOverlayStyle,
        backgroundColor: 'transparent',
        pointerEvents: 'none',
        justifyContent: previewNarrow ? 'flex-end' : 'flex-end',
        alignItems: previewNarrow ? 'stretch' : 'center',
        flexDirection: previewNarrow ? 'column' : 'row',
      }
    : modalOverlayStyle;

  const panelStyle: React.CSSProperties = isPreviewConnectMode
    ? {
        ...modalContentStyle,
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
        boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
      }
    : modalContentStyle;

  const primaryDisabled =
    isSubmitting ||
    !name.trim() ||
    (hasDuplicateConflict && !confirmedDifferentPerson && !selectedExistingId);

  const primaryLabel = isSubmitting
    ? 'Working…'
    : selectedExistingId
      ? 'Connect to tree'
      : 'Add to tree';

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {isPreviewConnectMode && (
          <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#D4AF37', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Preview: cyan dashed line shows the link that will be created.
          </p>
        )}
        <h2 style={{ 
          marginTop: 0, 
          fontFamily: '"Lora", serif', 
          fontSize: '1.5rem',
          color: 'white',
          marginBottom: '24px'
        }}>
          Add relative to {formatNodeDisplayName(targetNode)}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>FIRST NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Given name only"
              style={inputStyle}
              maxLength={MAX_NAME_LENGTH}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>RELATIONSHIP</label>
            <select
              value={relationship}
              onChange={(e) => {
                setRelationship(e.target.value as RelationshipType);
                if (e.target.value !== 'child') setParentRole(null);
              }}
              style={inputStyle}
            >
              <option value="child">Add as child</option>
              <option value="parent">Add as parent</option>
              <option value="spouse">Add as spouse</option>
              <option value="sibling">Add as sibling</option>
            </select>
          </div>

          {relationship === 'child' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>I AM THE…</label>
              <select
                value={parentRole ?? ''}
                onChange={(e) =>
                  setParentRole(e.target.value ? (e.target.value as 'mother' | 'father') : null)
                }
                style={inputStyle}
              >
                <option value="">— Select (optional) —</option>
                <option value="mother">Mother</option>
                <option value="father">Father</option>
              </select>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                Helps show children on both parents&apos; family trees
              </p>
            </div>
          )}

          {matches.length > 0 && (
            <div style={warningStyle}>
              <strong style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCHES DETECTED IN ARCHIVE</strong>
              <p style={{ fontSize: '0.8rem', margin: '8px 0', color: 'rgba(255,255,255,0.7)' }}>
                {hasDuplicateConflict
                  ? 'Select someone to connect, or confirm this is a new entry.'
                  : 'Someone here may already be this person. Connecting is optional.'}
              </p>
              <ul style={{ margin: '12px 0', paddingLeft: '0', listStyle: 'none' }}>
                {matches.map(({ person, isVisible, isAlreadyConnected }) => (
                  <li key={person.id} style={{ marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => selectExisting(person.id)}
                      disabled={isAlreadyConnected}
                      style={{
                        ...matchRowStyle,
                        cursor: isAlreadyConnected ? 'default' : 'pointer',
                        opacity: isAlreadyConnected ? 0.55 : 1,
                        borderColor:
                          selectedExistingId === person.id ? '#D4AF37' : 'rgba(255,255,255,0.1)',
                        backgroundColor:
                          selectedExistingId === person.id
                            ? 'rgba(212, 175, 55, 0.1)'
                            : 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'white' }}>
                        {formatNodeDisplayName(person)}
                      </span>
                      {(!isVisible || isAlreadyConnected) && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: 'rgba(255,255,255,0.55)',
                            display: 'block',
                            marginTop: '2px',
                          }}
                        >
                          {[
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
                          color: 'rgba(255,255,255,0.4)',
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
                <p style={{ fontSize: '0.7rem', margin: '0 0 8px 0', color: 'rgba(255,255,255,0.5)' }}>
                  +{hiddenMatchCount} more match{hiddenMatchCount === 1 ? '' : 'es'} not shown.
                </p>
              )}
              {/* Only a must-confirm resolution blocks submit, so only it needs an answer. */}
              {hasDuplicateConflict && (
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
                  style={{ accentColor: '#D4AF37' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>I am adding a totally different person</span>
              </label>
              )}
            </div>
          )}

          {error && <div style={errorStyle}>{error}</div>}

          <div style={actionsStyle}>
            <Button 
              variant="text" 
              onClick={onClose} 
              disabled={isSubmitting}
              sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={primaryDisabled}
              sx={{ 
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
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

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 2000,
  backdropFilter: 'blur(8px)',
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'rgba(5, 5, 5, 0.85)',
  backdropFilter: 'blur(24px)',
  color: 'white',
  padding: '40px',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '480px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid rgba(212, 175, 55, 0.2)',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '10px',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: '#D4AF37',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: '4px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'rgba(255,255,255,0.03)',
  color: 'white',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  fontFamily: '"Inter", sans-serif',
};

const warningStyle: React.CSSProperties = {
  backgroundColor: 'rgba(212, 175, 55, 0.05)',
  border: '1px solid rgba(212, 175, 55, 0.3)',
  color: '#D4AF37',
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '24px',
};

const matchRowStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '12px 16px',
  borderRadius: '4px',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const errorStyle: React.CSSProperties = {
  backgroundColor: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#ef4444',
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
  fontSize: '0.85rem',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '16px',
  marginTop: '40px',
};
