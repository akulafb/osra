import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useTheme, type Theme } from '@mui/material/styles';
import { validateOrphanNodeName } from '../../lib/adminGraphValidation';
import { MAX_CLUSTER_LENGTH, MAX_PERSON_NAME_LENGTH } from '../../lib/treeRecord';
import type { Recorder } from '../../lib/recorder';

interface AdminAddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  recorder: Recorder;
}

export default function AdminAddPersonModal({
  isOpen,
  onClose,
  recorder,
}: AdminAddPersonModalProps) {
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
      await recorder.addStandalonePerson({
        firstName: name,
        paternalCluster: paternal,
        maternalCluster: maternal,
      });
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
        <p style={{ color: modal.adminTool.ink.faint, fontSize: '0.85rem' }}>
          Creates a new person with no relationships yet. You can add links afterward.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={labelStyle(theme)}>First name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_PERSON_NAME_LENGTH))}
            style={inputStyle(theme)}
            required
            disabled={submitting}
          />
          <label style={labelStyle(theme)}>Paternal family cluster (optional)</label>
          <input
            value={paternal}
            onChange={(e) => setPaternal(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
            style={inputStyle(theme)}
            disabled={submitting}
          />
          <label style={labelStyle(theme)}>Maternal family cluster (optional)</label>
          <input
            value={maternal}
            onChange={(e) => setMaternal(e.target.value.slice(0, MAX_CLUSTER_LENGTH))}
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
  color: palette.modal.adminTool.ink.muted,
  fontSize: '0.8rem',
  marginTop: 8,
});

const inputStyle = ({ palette }: Theme): React.CSSProperties => ({
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid ${palette.modal.adminForm.field.border}`,
  background: palette.modal.adminForm.field.surface,
  color: palette.panel.ink.strong,
  marginTop: 4,
});

const overlayStyle = ({ palette }: Theme): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: palette.modal.adminForm.scrim,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
});

const contentStyle = ({ palette }: Theme): React.CSSProperties => ({
  background: palette.modal.adminForm.surface,
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: '100%',
  border: `1px solid ${palette.panel.border.subtle}`,
});
