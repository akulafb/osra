import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { Session } from '@supabase/supabase-js';
import { validateOrphanNodeName } from '../../lib/adminGraphValidation';
import { createTreeRecord } from '../../lib/treeRecord';

const MAX_NAME = 200;
const MAX_CLUSTER = 100;

interface AdminAddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  isAdmin: boolean;
  userId: string;
  onSuccess: () => void;
}

export default function AdminAddPersonModal({
  isOpen,
  onClose,
  session,
  isAdmin,
  userId,
  onSuccess,
}: AdminAddPersonModalProps) {
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
      await record.addPerson({
        firstName: name.trim().slice(0, MAX_NAME),
        paternalCluster: paternal.trim().slice(0, MAX_CLUSTER) || null,
        maternalCluster: maternal.trim().slice(0, MAX_CLUSTER) || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={contentStyle}>
        <h2 style={{ marginTop: 0, color: '#fff' }}>Add person (standalone)</h2>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>
          Creates a new person with no relationships yet. You can add links afterward.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>First name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
            style={inputStyle}
            required
            disabled={submitting}
          />
          <label style={labelStyle}>Paternal family cluster (optional)</label>
          <input
            value={paternal}
            onChange={(e) => setPaternal(e.target.value.slice(0, MAX_CLUSTER))}
            style={inputStyle}
            disabled={submitting}
          />
          <label style={labelStyle}>Maternal family cluster (optional)</label>
          <input
            value={maternal}
            onChange={(e) => setMaternal(e.target.value.slice(0, MAX_CLUSTER))}
            style={inputStyle}
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#aaa',
  fontSize: '0.8rem',
  marginTop: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#111',
  color: '#fff',
  marginTop: 4,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const contentStyle: React.CSSProperties = {
  background: '#1a1a24',
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: '100%',
  border: '1px solid rgba(255,255,255,0.1)',
};
