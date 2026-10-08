import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useTheme, type Theme } from '@mui/material/styles';
import type { Session } from '@supabase/supabase-js';
import { validateOrphanNodeName } from '../../lib/adminGraphValidation';
import { createTreeRecord } from '../../lib/treeRecord';
import { useWorkingRecord } from '../../contexts/WorkingRecordContext';

const MAX_NAME = 200;
const MAX_CLUSTER = 100;

interface AdminAddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  isAdmin: boolean;
  userId: string;
}

export default function AdminAddPersonModal({
  isOpen,
  onClose,
  session,
  isAdmin,
  userId,
}: AdminAddPersonModalProps) {
  const { write } = useWorkingRecord();
  const theme = useTheme();
  const { modal, panel } = theme.palette;
  const [name, setName] = useState('');
  const [paternal, setPaternal] = useState('');
  const [maternal, setMaternal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setPaternal('');
    setMaternal('');
    setError(null);
    setSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const nameCheck = validateOrphanNodeName(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateOrphanNodeName(name);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const record = createTreeRecord({
        userId,
        isAdmin,
        sessionToken: session?.access_token,
      });
      const personId = crypto.randomUUID();
      const firstName = name.trim().slice(0, MAX_NAME);
      const paternalCluster = paternal.trim().slice(0, MAX_CLUSTER) || null;
      const maternalCluster = maternal.trim().slice(0, MAX_CLUSTER) || null;

      // A standalone Person has no Kinship Link, so nothing but the Person
      // itself is optimistic here.
      await write(
        [
          {
            kind: 'person-upsert',
            person: {
              id: personId,
              firstName,
              familyCluster: paternalCluster ?? undefined,
              maternalFamilyCluster: maternalCluster ?? undefined,
            },
          },
        ],
        async () => ({
          kind: 'confirmed',
          rows: await record.addPerson({
            id: personId,
            firstName,
            paternalCluster,
            maternalCluster,
          }),
        })
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle(theme)}>
      <div style={contentStyle(theme)}>
        <h2 style={{ marginTop: 0, color: panel.ink.strong }}>Add person (standalone)</h2>
        <p style={{ color: modal.flat.ink.faint, fontSize: '0.85rem' }}>
          Creates a new person with no relationships yet. You can add links afterward.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={labelStyle(theme)}>First name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
            style={inputStyle(theme)}
            required
            disabled={submitting}
          />
          <label style={labelStyle(theme)}>Paternal family cluster (optional)</label>
          <input
            value={paternal}
            onChange={(e) => setPaternal(e.target.value.slice(0, MAX_CLUSTER))}
            style={inputStyle(theme)}
            disabled={submitting}
          />
          <label style={labelStyle(theme)}>Maternal family cluster (optional)</label>
          <input
            value={maternal}
            onChange={(e) => setMaternal(e.target.value.slice(0, MAX_CLUSTER))}
            style={inputStyle(theme)}
            disabled={submitting}
          />
          {!nameCheck.ok && name.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {nameCheck.message}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <Button type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = ({ palette }: Theme): React.CSSProperties => ({
  display: 'block',
  color: palette.modal.flat.ink.muted,
  fontSize: '0.8rem',
  marginTop: 8,
});

const inputStyle = ({ palette }: Theme): React.CSSProperties => ({
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid ${palette.modal.admin.field.border}`,
  background: palette.modal.admin.field.surface,
  color: palette.panel.ink.strong,
  marginTop: 4,
});

const overlayStyle = ({ palette }: Theme): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: palette.modal.admin.scrim,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
});

const contentStyle = ({ palette }: Theme): React.CSSProperties => ({
  background: palette.modal.admin.surface,
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: '100%',
  border: `1px solid ${palette.panel.border.subtle}`,
});
