import React, { useMemo, useState, useEffect, useRef } from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { Session } from '@supabase/supabase-js';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { getNodeId } from '../../lib/familyGraph';
import {
  validateProposedLink,
  type ExcludeLinkSpec,
  type ProposedLink,
} from '../../lib/adminGraphValidation';
import { createTreeRecord } from '../../lib/treeRecord';
import { useWorkingRecord } from '../../contexts/WorkingRecordContext';

interface AdminManageLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: FamilyGraph;
  nodeId: string;
  session: Session | null;
  isAdmin: boolean;
  /**
   * Dissolve a Kinship Link. Owned by the host so the deletion runs inside the
   * Dissolve lifecycle rather than as a second, unanimated delete path.
   */
  onDissolveLink: (params: { id: string; aId: string; bId: string }) => Promise<void>;
}

function toExcludeSpec(link: FamilyLink): ExcludeLinkSpec {
  return {
    source: getNodeId(link.source),
    target: getNodeId(link.target),
    type: link.type,
    parentRole: link.parentRole ?? null,
  };
}

export default function AdminManageLinksModal({
  isOpen,
  onClose,
  graph,
  nodeId,
  session,
  isAdmin,
  onDissolveLink,
}: AdminManageLinksModalProps) {
  const { write } = useWorkingRecord();
  const [editing, setEditing] = useState<FamilyLink | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editType, setEditType] = useState<FamilyLink['type']>('parent');
  const [editRole, setEditRole] = useState<'mother' | 'father' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Portal Select menus into the overlay so they stack above the modal card (body portal + z-index on Paper is unreliable here). */
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const selectMenuProps = useMemo(
    () => ({
      disableScrollLock: true,
      container: () => overlayRef.current ?? document.body,
      sx: { zIndex: 4000 },
      PaperProps: { sx: { maxHeight: 280, zIndex: 4000 } },
    }),
    []
  );

  const incident = useMemo(
    () =>
      graph.links.filter((l) => {
        const s = getNodeId(l.source);
        const t = getNodeId(l.target);
        return s === nodeId || t === nodeId;
      }),
    [graph.links, nodeId]
  );

  useEffect(() => {
    if (!isOpen) {
      setEditing(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!editing) return;
    setEditSource(getNodeId(editing.source));
    setEditTarget(getNodeId(editing.target));
    setEditType(editing.type);
    setEditRole(
      editing.parentRole === 'mother' || editing.parentRole === 'father'
        ? editing.parentRole
        : ''
    );
  }, [editing]);

  const proposedEdit = useMemo((): ProposedLink | null => {
    if (!editing) return null;
    return {
      source: editSource,
      target: editTarget,
      type: editType,
      parentRole: editType === 'parent' ? (editRole === '' ? null : editRole) : null,
    };
  }, [editing, editSource, editTarget, editType, editRole]);

  const editValidation = useMemo(() => {
    if (!editing || !proposedEdit) return { ok: true as const };
    return validateProposedLink(graph, proposedEdit, {
      excludeLink: toExcludeSpec(editing),
    });
  }, [graph, editing, proposedEdit]);

  if (!isOpen) return null;

  const nodeById = (id: string): FamilyNode | undefined =>
    graph.nodes.find((n) => n.id === id);

  const otherLabel = (link: FamilyLink): string => {
    const sid = getNodeId(link.source);
    const tid = getNodeId(link.target);
    const oid = sid === nodeId ? tid : sid;
    const n = nodeById(oid);
    return n ? formatNodeDisplayName(n) : oid;
  };

  const handleDelete = async (link: FamilyLink) => {
    if (!link.id) {
      setError('This link has no id; reload the tree and try again.');
      return;
    }
    if (!window.confirm('Delete this link? This cannot be undone.')) return;
    setSubmitting(true);
    setError(null);
    try {
      // The host runs the write inside a Dissolve, so a link deleted here
      // frays on the canvas exactly as one deleted in the tree does (LIN-55).
      await onDissolveLink({
        id: link.id,
        aId: getNodeId(link.source),
        bId: getNodeId(link.target),
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.id || !proposedEdit || !editValidation.ok) return;
    const linkId = editing.id;
    const parentRole =
      proposedEdit.type === 'parent' ? proposedEdit.parentRole ?? null : null;
    setSubmitting(true);
    setError(null);
    try {
      const record = createTreeRecord({
        userId: session?.user?.id || '',
        isAdmin,
        sessionToken: session?.access_token,
      });
      // The re-pointed Kinship Link redraws now and the server row replaces it
      // on confirmation (D9, D12).
      await write(
        [
          {
            kind: 'link-upsert',
            link: {
              id: linkId,
              source: proposedEdit.source,
              target: proposedEdit.target,
              type: proposedEdit.type,
              parentRole,
            },
          },
        ],
        async () => ({
          kind: 'confirmed',
          rows: await record.editLink({
            id: linkId,
            sourceId: proposedEdit.source,
            targetId: proposedEdit.target,
            type: proposedEdit.type,
            parentRole,
          }),
        })
      );
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={overlayRef} style={overlayStyle}>
      <div style={contentStyle}>
        <h2 style={{ marginTop: 0, color: '#fff' }}>Links for this person</h2>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>
          Edit or delete relationships. Changes are checked so the tree stays consistent.
        </p>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
          {incident.map((link) => (
            <li
              key={link.id ?? `${link.source}-${link.target}-${link.type}`}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid #333',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: '#ddd', flex: '1 1 200px' }}>
                <strong>{link.type}</strong> → {otherLabel(link)}
                {link.parentRole ? ` (${link.parentRole})` : ''}
              </span>
              <Button
                size="small"
                variant="outlined"
                disabled={submitting || !link.id}
                onClick={() => setEditing(link)}
              >
                Edit
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                disabled={submitting || !link.id}
                onClick={() => handleDelete(link)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
        {incident.length === 0 && (
          <p style={{ color: '#888' }}>No links touch this person.</p>
        )}

        {editing && (
          <form
            onSubmit={handleSaveEdit}
            style={{
              borderTop: '1px solid #444',
              paddingTop: 16,
              marginTop: 8,
            }}
          >
            <h3 style={{ color: '#fff', fontSize: '1rem' }}>Edit link</h3>
            <FormControl fullWidth margin="dense" size="small">
              <InputLabel id="es" sx={{ color: '#aaa' }}>
                Source (parent for parent links)
              </InputLabel>
              <Select
                labelId="es"
                label="Source (parent for parent links)"
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                sx={{ color: '#fff' }}
                MenuProps={selectMenuProps}
              >
                {graph.nodes.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {formatNodeDisplayName(n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="dense" size="small">
              <InputLabel id="et" sx={{ color: '#aaa' }}>
                Target (child for parent links)
              </InputLabel>
              <Select
                labelId="et"
                label="Target (child for parent links)"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                sx={{ color: '#fff' }}
                MenuProps={selectMenuProps}
              >
                {graph.nodes.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {formatNodeDisplayName(n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="dense" size="small">
              <InputLabel id="ety" sx={{ color: '#aaa' }}>
                Type
              </InputLabel>
              <Select
                labelId="ety"
                label="Type"
                value={editType}
                onChange={(e) =>
                  setEditType(e.target.value as FamilyLink['type'])
                }
                sx={{ color: '#fff' }}
                MenuProps={selectMenuProps}
              >
                <MenuItem value="parent">parent</MenuItem>
                <MenuItem value="marriage">marriage</MenuItem>
                <MenuItem value="divorce">divorce</MenuItem>
              </Select>
            </FormControl>
            {editType === 'parent' && (
              <FormControl fullWidth margin="dense" size="small">
                <InputLabel id="epr" sx={{ color: '#aaa' }}>
                  Parent role
                </InputLabel>
                <Select
                  labelId="epr"
                  label="Parent role"
                  value={editRole}
                  onChange={(e) =>
                    setEditRole(e.target.value as 'mother' | 'father' | '')
                  }
                  sx={{ color: '#fff' }}
                  MenuProps={selectMenuProps}
                >
                  <MenuItem value="">Not specified</MenuItem>
                  <MenuItem value="mother">Mother</MenuItem>
                  <MenuItem value="father">Father</MenuItem>
                </Select>
              </FormControl>
            )}
            {!editValidation.ok && 'message' in editValidation && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {editValidation.message}
              </Alert>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting || !editValidation.ok}
              >
                Save link
              </Button>
              <Button type="button" onClick={() => setEditing(null)} disabled={submitting}>
                Cancel edit
              </Button>
            </div>
          </form>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button onClick={onClose}>Close</Button>
        </div>
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
  overflow: 'auto',
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 0,
  background: '#1a1a24',
  borderRadius: 12,
  padding: 24,
  maxWidth: 520,
  width: '100%',
  border: '1px solid rgba(255,255,255,0.1)',
  maxHeight: '90vh',
  overflow: 'auto',
};
