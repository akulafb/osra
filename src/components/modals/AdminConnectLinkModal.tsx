import React, { useMemo, useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Alert from '@mui/material/Alert';
import type { Session } from '@supabase/supabase-js';
import type { FamilyGraph } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { validateProposedLink, type ProposedLink } from '../../lib/adminGraphValidation';
import { createTreeRecord } from '../../lib/treeRecord';

type RelChoice = 'marriage' | 'divorce' | 'parent';

interface AdminConnectLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: FamilyGraph;
  fromId: string;
  toId: string;
  session: Session | null;
  isAdmin: boolean;
  userId: string;
  onSuccess: () => void;
}

export default function AdminConnectLinkModal({
  isOpen,
  onClose,
  graph,
  fromId,
  toId,
  session,
  isAdmin,
  userId,
  onSuccess,
}: AdminConnectLinkModalProps) {
  const [rel, setRel] = useState<RelChoice>('marriage');
  const [parentIsFrom, setParentIsFrom] = useState(true);
  const [parentRole, setParentRole] = useState<'mother' | 'father' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRel('marriage');
    setParentIsFrom(true);
    setParentRole('');
    setError(null);
    setSubmitting(false);
  }, [isOpen, fromId, toId]);

  const fromNode = graph.nodes.find((n) => n.id === fromId);
  const toNode = graph.nodes.find((n) => n.id === toId);

  const proposed = useMemo((): ProposedLink | null => {
    if (!fromNode || !toNode) return null;
    if (rel === 'marriage' || rel === 'divorce') {
      return { source: fromId, target: toId, type: rel };
    }
    const parentId = parentIsFrom ? fromId : toId;
    const childId = parentIsFrom ? toId : fromId;
    const pr = parentRole === '' ? null : parentRole;
    return {
      source: parentId,
      target: childId,
      type: 'parent',
      parentRole: pr,
    };
  }, [fromId, toId, rel, parentIsFrom, parentRole, fromNode, toNode]);

  const validationResult = useMemo(() => {
    if (!proposed) return { ok: false as const, message: 'Missing nodes.' };
    return validateProposedLink(graph, proposed);
  }, [graph, proposed]);

  if (!isOpen || !fromNode || !toNode) return null;

  const handleRelChange = (e: SelectChangeEvent<RelChoice>) => {
    setRel(e.target.value as RelChoice);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposed || !validationResult.ok) return;
    setSubmitting(true);
    setError(null);
    try {
      const record = createTreeRecord({
        userId,
        isAdmin,
        sessionToken: session?.access_token,
      });
      await record.addLink({
        sourceId: proposed.source,
        targetId: proposed.target,
        type: proposed.type,
        parentRole: proposed.parentRole ?? null,
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
        <h2 style={{ marginTop: 0, color: '#fff' }}>Connect people</h2>
        <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
          {formatNodeDisplayName(fromNode)} ↔ {formatNodeDisplayName(toNode)}
        </p>
        <form onSubmit={handleSubmit}>
          <FormControl fullWidth margin="normal" size="small">
            <InputLabel id="admin-rel-label" sx={{ color: '#aaa' }}>
              Relationship
            </InputLabel>
            <Select<RelChoice>
              labelId="admin-rel-label"
              label="Relationship"
              value={rel}
              onChange={handleRelChange}
              sx={{ color: '#fff' }}
            >
              <MenuItem value="marriage">Partners (marriage)</MenuItem>
              <MenuItem value="divorce">Former partners (divorce)</MenuItem>
              <MenuItem value="parent">Parent and child</MenuItem>
            </Select>
          </FormControl>

          {rel === 'parent' && (
            <>
              <FormLabel sx={{ color: '#ccc', mt: 1 }}>Who is the parent?</FormLabel>
              <RadioGroup
                value={parentIsFrom ? 'from' : 'to'}
                onChange={(_, v) => setParentIsFrom(v === 'from')}
              >
                <FormControlLabel
                  value="from"
                  control={<Radio sx={{ color: '#888' }} />}
                  label={formatNodeDisplayName(fromNode)}
                  sx={{ color: '#eee' }}
                />
                <FormControlLabel
                  value="to"
                  control={<Radio sx={{ color: '#888' }} />}
                  label={formatNodeDisplayName(toNode)}
                  sx={{ color: '#eee' }}
                />
              </RadioGroup>
              <FormControl fullWidth margin="normal" size="small">
                <InputLabel id="admin-pr-label" sx={{ color: '#aaa' }}>
                  Parent role (optional)
                </InputLabel>
                <Select
                  labelId="admin-pr-label"
                  label="Parent role (optional)"
                  value={parentRole}
                  onChange={(e) =>
                    setParentRole(e.target.value as 'mother' | 'father' | '')
                  }
                  sx={{ color: '#fff' }}
                >
                  <MenuItem value="">Not specified</MenuItem>
                  <MenuItem value="mother">Mother</MenuItem>
                  <MenuItem value="father">Father</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {!validationResult.ok && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {validationResult.message}
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
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || !validationResult.ok}
            >
              {submitting ? 'Saving…' : 'Create link'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  maxWidth: 440,
  width: '100%',
  border: '1px solid rgba(255,255,255,0.1)',
};
