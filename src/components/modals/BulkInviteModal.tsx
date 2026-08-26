import React, { useState, useEffect, useMemo } from 'react';
import Button from '@mui/material/Button';
import { useAuth } from '../../contexts/AuthContext';
import { FamilyNode, FamilyLink } from '../../types/graph';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { get1DegreeRelatives, KinshipDegree1Category } from '../../lib/familyGraph';

interface BulkInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  allNodes: FamilyNode[];
  allLinks: FamilyLink[];
  userNodeId: string;
  inviteForNodeId?: string;
  onSuccess: () => void;
}

interface RelativeWithInvite {
  node: FamilyNode;
  relationship: string;
  existingInvites: number;
  selected: boolean;
  generatedToken?: string;
}

export default function BulkInviteModal({
  isOpen,
  onClose,
  allNodes,
  allLinks,
  userNodeId,
  inviteForNodeId,
  onSuccess,
}: BulkInviteModalProps) {
  const { user, session } = useAuth();
  const [relatives, setRelatives] = useState<RelativeWithInvite[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Get relatives on mount: single node (admin) or 1-degree (own node)
  useEffect(() => {
    if (!isOpen || !allNodes.length) return;
    setStep('select');
    setError(null);

    try {
      if (inviteForNodeId) {
        const node = allNodes.find(n => n.id === inviteForNodeId);
        if (!node) {
          setRelatives([]);
          return;
        }
        const relativesData: RelativeWithInvite[] = [{ node, relationship: 'Family', existingInvites: 0, selected: true }];
        setRelatives(relativesData);
        fetchExistingInvites(relativesData);
        return;
      }

      if (!userNodeId) return;

      const linksCopy = Array.isArray(allLinks) ? [...allLinks] : [];
      const degree1Relatives = get1DegreeRelatives(userNodeId, linksCopy);

      const relationshipLabelMap: Record<KinshipDegree1Category, string> = {
        parent: 'Parent',
        child: 'Child',
        spouse: 'Spouse',
        sibling: 'Sibling',
      };

      const relativesData = degree1Relatives
        .map(rel => {
          const node = allNodes.find(n => n.id === rel.nodeId);
          if (!node) return null;
          return {
            node,
            relationship: relationshipLabelMap[rel.relationship] || 'Family',
            existingInvites: 0,
            selected: false,
          };
        })
        .filter(Boolean) as RelativeWithInvite[];

      const order = ['Parent', 'Child', 'Spouse', 'Sibling'];
      relativesData.sort((a, b) => {
        const aIdx = order.indexOf(a.relationship);
        const bIdx = order.indexOf(b.relationship);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        return formatNodeDisplayName(a.node).localeCompare(formatNodeDisplayName(b.node));
      });

      setRelatives(relativesData);
      if (relativesData.length > 0) fetchExistingInvites(relativesData);
    } catch (err) {
      console.error('[BulkInvite] Error initializing:', err);
      setError('Failed to initialize relatives list.');
    }
  }, [isOpen, userNodeId, inviteForNodeId, allNodes, allLinks]);

  const fetchExistingInvites = async (relativesData: RelativeWithInvite[]) => {
    if (!relativesData.length) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const authToken = session?.access_token;
    if (!authToken) return;

    try {
      const nodeIds = relativesData.map(r => r.node.id).join(',');
      const response = await fetch(`${supabaseUrl}/rest/v1/node_invites?node_id=in.(${nodeIds})&select=node_id,expires_at,claimed_by_user_id`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${authToken}` },
      });
      if (!response.ok) return;
      const invites = await response.json();
      const now = new Date();
      const counts: Record<string, number> = {};
      invites.forEach((invite: any) => {
        if (new Date(invite.expires_at) > now && !invite.claimed_by_user_id) {
          counts[invite.node_id] = (counts[invite.node_id] || 0) + 1;
        }
      });
      setRelatives((prev: RelativeWithInvite[]) => prev.map(r => ({ ...r, existingInvites: counts[r.node.id] || 0 })));
    } catch (err) { console.error('[BulkInvite] Failed to count existing invites', err); }
  };

  const toggleSelection = (nodeId: string) => {
    setRelatives(prev => prev.map(r => r.node.id === nodeId ? { ...r, selected: !r.selected } : r));
  };

  const generateInvites = async () => {
    const selected = relatives.filter(r => r.selected);
    if (!selected.length) return;
    setIsGenerating(true);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const authToken = session?.access_token;

    if (!authToken) {
      setError('You must be signed in to generate invites.');
      setIsGenerating(false);
      return;
    }

    const results: RelativeWithInvite[] = [];
    let lastError = '';

    // Invalidate any existing unclaimed invites for the selected nodes
    try {
      const selectedNodeIds = selected.map(r => r.node.id).join(',');
      const nowIso = new Date().toISOString();
      const patchRes = await fetch(
        `${supabaseUrl}/rest/v1/node_invites?node_id=in.(${selectedNodeIds})&claimed_by_user_id=is.null`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${authToken}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            expires_at: nowIso,
          }),
        }
      );
      if (!patchRes.ok) {
        console.warn(`[BulkInvite] Failed to invalidate existing invites (status ${patchRes.status})`);
      }
    } catch (err) {
      console.error('[BulkInvite] Failed to invalidate existing invites:', err);
      // Continue anyway; failure to invalidate should not block new invites
    }

    for (const relative of selected) {
      try {
        const token = `invite-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 7);
        
        const res = await fetch(`${supabaseUrl}/rest/v1/node_invites`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'apikey': supabaseKey, 
            'Authorization': `Bearer ${authToken}`,
            'Prefer': 'return=minimal' 
          },
          body: JSON.stringify({ 
            node_id: relative.node.id, 
            token, 
            expires_at: expiresAt.toISOString(), 
            created_by_user_id: user?.id 
          }),
        });

        if (res.ok) {
          results.push({ ...relative, generatedToken: token });
        } else {
          const errorData = await res.json().catch(() => ({}));
          lastError = errorData.message || `Error ${res.status}`;
        }
      } catch (err: any) { 
        lastError = err.message;
      }
    }

    setIsGenerating(false);
    if (!results.length) {
      console.error('[BulkInvite] Failed to create invites:', lastError);
      setError('Failed to create invites. Please try again.');
    } else {
      setRelatives(prev => prev.map(r => {
        const res = results.find(res => res.node.id === r.node.id);
        return res ? { ...r, generatedToken: res.generatedToken, selected: false } : r;
      }));
      setStep('review');
      onSuccess();
    }
  };

  const copyLink = (token: string) => {
    // Ensure we always use the production domain for invites, even if the admin is on a preview/deployment URL
    const baseUrl = window.location.hostname.includes('vercel.app') 
      ? 'https://3d-family-tree-vert.vercel.app' 
      : window.location.origin;
      
    navigator.clipboard.writeText(`${baseUrl}/invite/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const groupedRelatives = useMemo(() => {
    const groups: Record<string, RelativeWithInvite[]> = {};
    relatives.forEach(r => {
      const key = r.relationship.endsWith('s') ? r.relationship : `${r.relationship}s`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [relatives]);

  if (!isOpen) return null;

  const inviteTargetNode = inviteForNodeId ? allNodes.find((n) => n.id === inviteForNodeId) : undefined;

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <h2 style={{ marginTop: 0, color: 'white' }}>
          {step === 'select'
            ? inviteForNodeId
              ? `Generate Invite for ${inviteTargetNode ? formatNodeDisplayName(inviteTargetNode) : 'this person'}`
              : 'Send Invites to Your Family'
            : 'Generated Invites'}
        </h2>
        {step === 'select' ? (
          <>
            <p style={{ color: '#aaa', marginBottom: '20px', lineHeight: '1.5' }}>
              {inviteForNodeId
                ? 'Create a link so this person can claim their profile. Link expires in 7 days.'
                : 'Select family members to invite. Links expire in 7 days.'}
            </p>
            {error && <div style={errorStyle}>{error}</div>}
            <div style={listContainerStyle}>
              {Object.keys(groupedRelatives).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  {inviteForNodeId ? 'Node not found.' : 'No family members found to invite.'}
                </div>
              ) : (
                Object.entries(groupedRelatives).map(([relationship, items]) => (
                  <div key={relationship} style={groupStyle}>
                    <h3 style={groupHeaderStyle}>{relationship} ({items.length})</h3>
                    {items.map(r => (
                      <div key={r.node.id} style={{ ...relativeItemStyle, opacity: r.generatedToken ? 0.6 : 1 }}>
                        <label style={checkboxLabelStyle}>
                          <input type="checkbox" checked={r.selected} onChange={() => toggleSelection(r.node.id)} disabled={!!r.generatedToken || isGenerating} style={checkboxStyle} />
                          <span style={nameStyle}>{formatNodeDisplayName(r.node)}</span>
                        </label>
                        {r.existingInvites > 0 && <span style={existingBadgeStyle}>{r.existingInvites} active invite</span>}
                        {r.generatedToken && <span style={generatedBadgeStyle}>✓ Created</span>}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div style={actionsStyle}>
              <Button variant="outlined" onClick={onClose}>Cancel</Button>
              <Button variant="contained" color="primary" onClick={generateInvites} disabled={!relatives.some(r => r.selected) || isGenerating}>
                {isGenerating ? 'Generating...' : `Generate ${relatives.filter(r => r.selected).length} Invite${relatives.filter(r => r.selected).length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={generatedListStyle}>
              {relatives.filter(r => r.generatedToken).map(r => (
                <div key={r.node.id} style={generatedItemStyle}>
                  <div style={generatedHeaderStyle}><strong>{formatNodeDisplayName(r.node)}</strong><span style={relationshipTagStyle}>{r.relationship}</span></div>
                  <div style={linkRowStyle}>
                    <code style={tokenStyle}>{r.generatedToken}</code>
                    <Button variant="contained" color={copiedToken === r.generatedToken ? 'success' : 'primary'} size="small" onClick={() => copyLink(r.generatedToken!)}>
                      {copiedToken === r.generatedToken ? 'Copied!' : 'Copy Link'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div style={actionsStyle}><Button variant="contained" color="primary" onClick={onClose}>Done</Button></div>
          </>
        )}
      </div>
    </div>
  );
}

const modalOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContentStyle: React.CSSProperties = { backgroundColor: '#1a1a1a', color: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', border: '1px solid #333' };
const listContainerStyle: React.CSSProperties = { maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' };
const groupStyle: React.CSSProperties = { marginBottom: '20px' };
const groupHeaderStyle: React.CSSProperties = { margin: '0 0 10px 0', paddingBottom: '8px', borderBottom: '1px solid #333', color: '#aaa', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' };
const relativeItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#252525', borderRadius: '8px', marginBottom: '8px', border: '1px solid #333' };
const checkboxLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 };
const checkboxStyle: React.CSSProperties = { width: '20px', height: '20px', cursor: 'pointer' };
const nameStyle: React.CSSProperties = { fontSize: '1rem', fontWeight: 'bold' };
const existingBadgeStyle: React.CSSProperties = { fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', borderRadius: '4px' };
const generatedBadgeStyle: React.CSSProperties = { fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderRadius: '4px' };
const errorStyle: React.CSSProperties = { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '12px', borderRadius: '6px', marginBottom: '15px', fontSize: '0.9rem' };
const actionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' };
const generatedListStyle: React.CSSProperties = { maxHeight: '350px', overflowY: 'auto', marginBottom: '20px' };
const generatedItemStyle: React.CSSProperties = { backgroundColor: '#252525', border: '1px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '12px' };
const generatedHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' };
const relationshipTagStyle: React.CSSProperties = { fontSize: '0.75rem', padding: '4px 10px', backgroundColor: 'rgba(102, 126, 134, 0.2)', color: '#667eea', borderRadius: '12px', textTransform: 'uppercase' };
const linkRowStyle: React.CSSProperties = { display: 'flex', gap: '10px', alignItems: 'center' };
const tokenStyle: React.CSSProperties = { flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', backgroundColor: '#1a1a1a', padding: '8px 12px', borderRadius: '4px', color: '#aaa', wordBreak: 'break-all' };
