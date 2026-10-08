import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import { useTheme, type Theme } from '@mui/material/styles';
import { useAuth } from '../../contexts/AuthContext';
import { FamilyNode, PersonGender } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { createTreeRecord } from '../../lib/treeRecord';
import { readMatchResolution, SPELLING_MATCH_LABEL } from '../../lib/personMatch';
import { usePersonMatch } from '../../hooks/usePersonMatch';
import { useWorkingRecord } from '../../contexts/WorkingRecordContext';

const MAX_NAME_LENGTH = 200;
const MAX_CLUSTER_LENGTH = 100;

interface EditNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: FamilyNode;
  /** The whole Tree Record, unfiltered — a filter must not hide a Person Match. */
  existingNodes: FamilyNode[];
  /** Ids currently drawn, so matches the filter is hiding can say so. */
  visibleIds?: ReadonlySet<string>;
}

export default function EditNodeModal({
  isOpen,
  onClose,
  targetNode,
  existingNodes,
  visibleIds,
}: EditNodeModalProps) {
  const { user, isAdmin, session } = useAuth();
  const { write } = useWorkingRecord();
  const theme = useTheme();
  const { modal, panel, primary } = theme.palette;
  const [name, setName] = useState('');
  const [familyCluster, setFamilyCluster] = useState('');
  const [maternalFamilyCluster, setMaternalFamilyCluster] = useState('');
  const [gender, setGender] = useState<PersonGender | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmedDifferentPerson, setConfirmedDifferentPerson] = useState(false);

  // Reset state when modal opens with target node data
  useEffect(() => {
    if (isOpen && targetNode) {
      setName(targetNode.firstName);
      setFamilyCluster(targetNode.familyCluster || '');
      setMaternalFamilyCluster(targetNode.maternalFamilyCluster || '');
      setGender(targetNode.gender ?? null);
      setError(null);
      setSuccessMessage(null);
      setConfirmedDifferentPerson(false);
    }
  }, [isOpen, targetNode]);

  // Renaming asks "am I colliding with someone?" — the same matching every other
  // path uses, so a rename can no longer miss a cluster match the Ghost Node sees,
  // Spelling Matches included. An unchanged name resolves to none and is never
  // looked up. A closed modal asks nothing, so a name left in the field is not
  // looked up behind it. On reopen, the one render before the reset effect sets
  // the name still holds the old one; its lookup is only debounced, and the
  // reset cancels it before anything is sent.
  const resolution = usePersonMatch({
    query: isOpen ? name : '',
    intent: 'renaming',
    pool: existingNodes,
    excludePersonId: targetNode.id,
    visibleIds,
    currentGivenName: targetNode.firstName,
  });

  // An exact collision has to be answered before Save; anything looser stays advisory.
  const { matches, hiddenMatchCount, mustConfirm: unresolved } = readMatchResolution(resolution);
  const mustConfirm = unresolved && !confirmedDifferentPerson;

  // A confirmation answers a question about one name, not about the next one typed.
  useEffect(() => {
    setConfirmedDifferentPerson(false);
  }, [name]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!user || !sanitizedName) return;

    if (mustConfirm) {
      setError('Someone else is already called that — confirm this is a different person.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      const paternalCluster = isAdmin ? familyCluster : undefined;
      const maternalCluster = isAdmin ? maternalFamilyCluster : undefined;
      // Sent only when changed: a gender change makes the seam read the
      // Person's parent links back, since the server may have given them a role.
      const changedGender = gender !== (targetNode.gender ?? null) ? gender : undefined;

      // The edited Person goes onto the canvas now and the server row replaces
      // them wholesale on confirmation (D12) — including the two cluster fields
      // an admin left alone, which is why the unedited values are carried here
      // rather than dropped.
      await write(
        [
          {
            kind: 'person-upsert',
            person: {
              ...targetNode,
              firstName: sanitizedName,
              familyCluster: paternalCluster ?? targetNode.familyCluster,
              maternalFamilyCluster: maternalCluster ?? targetNode.maternalFamilyCluster,
              gender,
            },
          },
        ],
        async () => ({
          kind: 'confirmed',
          rows: await record.editPerson({
            id: targetNode.id,
            firstName: sanitizedName,
            gender: changedGender,
            paternalCluster,
            maternalCluster,
          }),
        })
      );

      setSuccessMessage('Changes saved successfully!');

      // Close modal after a brief delay so user sees success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[EditNodeModal] Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={modalOverlayStyle(theme)}>
      <div style={modalContentStyle(theme)}>
        <h2 style={{ 
          marginTop: 0, 
          fontFamily: '"Lora", serif', 
          fontSize: '1.5rem',
          color: panel.ink.strong,
          marginBottom: '24px'
        }}>
          Edit {formatNodeDisplayName(targetNode)}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle(theme)}>FIRST NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Given name"
              style={inputStyle(theme)}
              maxLength={MAX_NAME_LENGTH}
              required
              disabled={isSubmitting}
            />
            <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: modal.ink.hint, fontStyle: 'italic' }}>
              Paternal / maternal family clusters are set below (admin) or inherited from the tree.
            </p>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle(theme)}>GENDER</label>
            <select
              value={gender ?? ''}
              onChange={(e) => setGender(e.target.value ? (e.target.value as PersonGender) : null)}
              style={inputStyle(theme)}
              disabled={isSubmitting}
            >
              <option value="">Not recorded</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {/* Admin-only: Family Cluster fields */}
          {isAdmin && (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle(theme)}>
                  PATERNAL FAMILY CLUSTER (ADMIN ONLY)
                </label>
                <input
                  type="text"
                  value={familyCluster}
                  onChange={(e) => setFamilyCluster(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
                  placeholder="e.g. Badran, Kutob, etc."
                  style={inputStyle(theme)}
                  maxLength={MAX_CLUSTER_LENGTH}
                  disabled={isSubmitting}
                />
                <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: modal.ink.hint, fontStyle: 'italic' }}>
                  Primary family name (3D positioning, display)
                </p>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle(theme)}>
                  MATERNAL FAMILY CLUSTER (ADMIN ONLY)
                </label>
                <input
                  type="text"
                  value={maternalFamilyCluster}
                  onChange={(e) => setMaternalFamilyCluster(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
                  placeholder="e.g. mother's family name"
                  style={inputStyle(theme)}
                  maxLength={MAX_CLUSTER_LENGTH}
                  disabled={isSubmitting}
                />
                <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: modal.ink.hint, fontStyle: 'italic' }}>
                  For children to appear on mother&apos;s family tree in 2D
                </p>
              </div>
            </>
          )}

          {/* Show current cluster for non-admins */}
          {!isAdmin && targetNode.familyCluster && (
            <div style={infoBoxStyle(theme)}>
              <strong style={{ fontSize: '0.65rem', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>FAMILY CLUSTER</strong>
              <span style={{ fontSize: '0.9rem', color: panel.ink.strong }}>{targetNode.familyCluster}</span>
            </div>
          )}

          {matches.length > 0 && (
            <div style={warningStyle(theme)}>
              <strong style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCHES DETECTED IN ARCHIVE</strong>
              <ul style={{ margin: '12px 0', paddingLeft: '20px', color: modal.ink.secondary }}>
                {matches.map(({ person, isSpellingVariant, isVisible }) => (
                  <li key={person.id} style={{ fontSize: '0.85rem' }}>
                    {formatNodeDisplayName(person)}
                    {isSpellingVariant && (
                      <span style={{ color: panel.ink.faint }}> · {SPELLING_MATCH_LABEL}</span>
                    )}
                    {!isVisible && (
                      <span style={{ color: panel.ink.faint }}> · hidden by filter</span>
                    )}
                  </li>
                ))}
              </ul>
              {hiddenMatchCount > 0 && (
                <p style={{ fontSize: '0.75rem', margin: '0 0 8px 0', color: panel.ink.faint }}>
                  +{hiddenMatchCount} more match{hiddenMatchCount === 1 ? '' : 'es'} not shown.
                </p>
              )}
              {unresolved ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmedDifferentPerson}
                    onChange={(e) => setConfirmedDifferentPerson(e.target.checked)}
                    style={{ accentColor: primary.main }}
                    disabled={isSubmitting}
                  />
                  <span style={{ fontSize: '0.8rem', color: modal.ink.secondary }}>
                    This is a different person from the one above
                  </span>
                </label>
              ) : (
                <p style={{ fontSize: '0.75rem', margin: 0, fontStyle: 'italic', color: panel.ink.muted }}>
                  Check none of these is the person you are renaming into.
                </p>
              )}
            </div>
          )}

          {successMessage && <div style={successStyle(theme)}>{successMessage}</div>}
          {error && <div style={errorStyle(theme)}>{error}</div>}

          <div style={actionsStyle(theme)}>
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
              disabled={isSubmitting || !name.trim() || mustConfirm}
              sx={{ 
                background: modal.submit,
                fontWeight: 700,
                letterSpacing: '0.05em',
                px: 3
              }}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Styles
const modalOverlayStyle = ({ palette }: Theme): React.CSSProperties => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: palette.modal.scrim,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 2000,
  backdropFilter: 'blur(8px)',
});

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

const infoBoxStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.notice.surface,
  border: `1px solid ${palette.panel.border.accent}`,
  color: palette.primary.main,
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
});

const warningStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.notice.surface,
  border: `1px solid ${palette.modal.notice.border}`,
  color: palette.primary.main,
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '24px',
});

const successStyle = ({ palette }: Theme): React.CSSProperties => ({
  backgroundColor: palette.modal.status.successSurface,
  border: `1px solid ${palette.modal.status.successBorder}`,
  color: palette.success.main,
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
  fontSize: '0.9rem',
  textAlign: 'center',
  fontWeight: 600,
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

const actionsStyle = ({ palette }: Theme): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '16px',
  marginTop: '40px',
  paddingTop: '20px',
  borderTop: `1px solid ${palette.panel.border.hairline}`,
});

