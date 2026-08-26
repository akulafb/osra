import React, { useState, useEffect, useMemo } from 'react';
import Button from '@mui/material/Button';
import { useAuth } from '../../contexts/AuthContext';
import { FamilyNode } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { createTreeRecord } from '../../lib/treeRecord';
import { matchExistingPersons } from '../../lib/personMatch';

const MAX_NAME_LENGTH = 200;
const MAX_CLUSTER_LENGTH = 100;

interface EditNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: FamilyNode;
  onSuccess: () => void;
  /** The whole Tree Record, unfiltered — a filter must not hide a collision. */
  existingNodes: FamilyNode[];
  /** Ids currently drawn, so matches the filter is hiding can say so. */
  visibleIds?: ReadonlySet<string>;
}

export default function EditNodeModal({
  isOpen,
  onClose,
  targetNode,
  onSuccess,
  existingNodes,
  visibleIds,
}: EditNodeModalProps) {
  const { user, isAdmin, session } = useAuth();
  const [name, setName] = useState('');
  const [familyCluster, setFamilyCluster] = useState('');
  const [maternalFamilyCluster, setMaternalFamilyCluster] = useState('');
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
      setError(null);
      setSuccessMessage(null);
      setConfirmedDifferentPerson(false);
    }
  }, [isOpen, targetNode]);

  // Renaming asks "am I colliding with someone?" — the same matching every other
  // path uses, so a rename can no longer miss a cluster match the Ghost Node sees.
  const resolution = useMemo(
    () =>
      matchExistingPersons({
        query: name,
        intent: 'renaming',
        pool: existingNodes,
        excludePersonId: targetNode.id,
        visibleIds,
        currentGivenName: targetNode.firstName,
      }),
    [name, existingNodes, targetNode.id, targetNode.firstName, visibleIds]
  );

  const matches = resolution.kind === 'none' ? [] : resolution.matches;
  const hiddenMatchCount =
    resolution.kind === 'none' ? 0 : resolution.totalMatchCount - matches.length;
  // An exact collision has to be answered before Save; anything looser stays advisory.
  const mustConfirm = resolution.kind === 'must-confirm' && !confirmedDifferentPerson;

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

      await record.editPerson({
        id: targetNode.id,
        firstName: sanitizedName,
        paternalCluster: isAdmin ? familyCluster : undefined,
        maternalCluster: isAdmin ? maternalFamilyCluster : undefined,
      });

      setSuccessMessage('Changes saved successfully!');
      onSuccess();

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
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <h2 style={{ 
          marginTop: 0, 
          fontFamily: '"Lora", serif', 
          fontSize: '1.5rem',
          color: 'white',
          marginBottom: '24px'
        }}>
          Edit {formatNodeDisplayName(targetNode)}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>FIRST NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Given name"
              style={inputStyle}
              maxLength={MAX_NAME_LENGTH}
              required
              disabled={isSubmitting}
            />
            <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              Paternal / maternal family clusters are set below (admin) or inherited from the tree.
            </p>
          </div>

          {/* Admin-only: Family Cluster fields */}
          {isAdmin && (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  PATERNAL FAMILY CLUSTER (ADMIN ONLY)
                </label>
                <input
                  type="text"
                  value={familyCluster}
                  onChange={(e) => setFamilyCluster(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
                  placeholder="e.g. Badran, Kutob, etc."
                  style={inputStyle}
                  maxLength={MAX_CLUSTER_LENGTH}
                  disabled={isSubmitting}
                />
                <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                  Primary family name (3D positioning, display)
                </p>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  MATERNAL FAMILY CLUSTER (ADMIN ONLY)
                </label>
                <input
                  type="text"
                  value={maternalFamilyCluster}
                  onChange={(e) => setMaternalFamilyCluster(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
                  placeholder="e.g. mother's family name"
                  style={inputStyle}
                  maxLength={MAX_CLUSTER_LENGTH}
                  disabled={isSubmitting}
                />
                <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                  For children to appear on mother&apos;s family tree in 2D
                </p>
              </div>
            </>
          )}

          {/* Show current cluster for non-admins */}
          {!isAdmin && targetNode.familyCluster && (
            <div style={infoBoxStyle}>
              <strong style={{ fontSize: '0.65rem', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>FAMILY CLUSTER</strong>
              <span style={{ fontSize: '0.9rem', color: 'white' }}>{targetNode.familyCluster}</span>
            </div>
          )}

          {matches.length > 0 && (
            <div style={warningStyle}>
              <strong style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>SIMILAR NAMES IN ARCHIVE</strong>
              <ul style={{ margin: '12px 0', paddingLeft: '20px', color: 'rgba(255,255,255,0.8)' }}>
                {matches.map(({ person, isVisible }) => (
                  <li key={person.id} style={{ fontSize: '0.85rem' }}>
                    {formatNodeDisplayName(person)}
                    {!isVisible && (
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}> · hidden by filter</span>
                    )}
                  </li>
                ))}
              </ul>
              {hiddenMatchCount > 0 && (
                <p style={{ fontSize: '0.75rem', margin: '0 0 8px 0', color: 'rgba(255,255,255,0.5)' }}>
                  +{hiddenMatchCount} more match{hiddenMatchCount === 1 ? '' : 'es'} not shown.
                </p>
              )}
              {resolution.kind === 'must-confirm' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmedDifferentPerson}
                    onChange={(e) => setConfirmedDifferentPerson(e.target.checked)}
                    style={{ accentColor: '#D4AF37' }}
                    disabled={isSubmitting}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
                    This is a different person from the one above
                  </span>
                </label>
              ) : (
                <p style={{ fontSize: '0.75rem', margin: 0, fontStyle: 'italic', color: 'rgba(255,255,255,0.6)' }}>
                  Please ensure you&apos;re not creating a duplicate entry.
                </p>
              )}
            </div>
          )}

          {successMessage && <div style={successStyle}>{successMessage}</div>}
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
              disabled={isSubmitting || !name.trim() || mustConfirm}
              sx={{ 
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
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

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(212, 175, 55, 0.05)',
  border: '1px solid rgba(212, 175, 55, 0.2)',
  color: '#D4AF37',
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
};

const warningStyle: React.CSSProperties = {
  backgroundColor: 'rgba(212, 175, 55, 0.05)',
  border: '1px solid rgba(212, 175, 55, 0.3)',
  color: '#D4AF37',
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '24px',
};

const successStyle: React.CSSProperties = {
  backgroundColor: 'rgba(16, 185, 129, 0.1)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  color: '#10b981',
  padding: '16px',
  borderRadius: '4px',
  marginBottom: '24px',
  fontSize: '0.9rem',
  textAlign: 'center',
  fontWeight: 600,
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
  paddingTop: '20px',
  borderTop: '1px solid rgba(255,255,255,0.05)',
};

