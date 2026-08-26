import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Button from '@mui/material/Button';
import FamilyTree3D from './FamilyTree3D';
import { FamilyTree2D } from './FamilyTree2D';
import { useViewMode } from '../hooks/useViewMode';
import { useBackgroundTheme } from '../hooks/useBackgroundTheme';
import { useFamilyData } from '../hooks/useFamilyData';
import { useNewNodesSinceSignIn } from '../hooks/useNewNodesSinceSignIn';
import { FamilyNode, FamilyLink } from '../types/graph';
import { useAuth } from '../contexts/AuthContext';
import AdminManageLinksModal from './modals/AdminManageLinksModal';
import AdminAddPersonModal from './modals/AdminAddPersonModal';
import { canEdit, canManageInvites } from '../lib/permissions';
import { filterGraphData, filterGraphDataFor3D } from '../lib/filterGraphData';
import { searchNodes } from '../utils/treeSearch';
import { useDirectManipulation } from '../hooks/useDirectManipulation';
import AddRelativeModal from './modals/AddRelativeModal';
import EditNodeModal from './modals/EditNodeModal';
import BulkInviteModal from './modals/BulkInviteModal';
import { FamilyChat } from './FamilyChat';
import { NewMembersModal } from './NewMembersModal';
import { PersonDetailDrawer } from './PersonDetailDrawer';
import { isMobile } from '../utils/device';
import { RelativeDirection } from '../types/graph';
import { createTreeRecord, relativeToKinshipLink } from '../lib/treeRecord';
import { useLifecycles } from '../hooks/useLifecycles';

export const FamilyTree: React.FC = () => {
  const { user, userProfile, isAdmin, session } = useAuth();
  const { mode, switchMode, isHydrated } = useViewMode();
  const { theme: backgroundTheme, setTheme: setBackgroundTheme } = useBackgroundTheme();
  const { graphData, isLoading, error, refetch } = useFamilyData();
  const {
    newMembers,
    showSeeWhosNewButton,
    buttonGlowActive,
  } = useNewNodesSinceSignIn(user?.id, graphData);

  const interaction = useDirectManipulation();
  const selectedNode = useMemo(() => {
    if (!interaction.selectedNodeId || !graphData?.nodes) return null;
    return graphData.nodes.find((n) => n.id === interaction.selectedNodeId) ?? null;
  }, [interaction.selectedNodeId, graphData?.nodes]);

  const [newMembersModalOpen, setNewMembersModalOpen] = useState(false);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [visibleClusters3D, setVisibleClusters3D] = useState<Set<string>>(new Set());
  const prevUniqueClustersRef = useRef<string[]>([]);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkInviteOpen, setIsBulkInviteOpen] = useState(false);
  const [canEditSelected, setCanEditSelected] = useState(false);
  const [pendingConnectExistingId, setPendingConnectExistingId] = useState<string | null>(null);

  const [adminManageLinksOpen, setAdminManageLinksOpen] = useState(false);
  const [adminAddPersonOpen, setAdminAddPersonOpen] = useState(false);

  const handlePendingConnectTargetChange = useCallback((id: string | null) => {
    setPendingConnectExistingId(id);
  }, []);

  useEffect(() => {
    if (!isAddModalOpen) setPendingConnectExistingId(null);
  }, [isAddModalOpen]);

  const pendingLinkPreview = useMemo(() => {
    if (!isAddModalOpen || !selectedNode || !pendingConnectExistingId) return null;
    return { anchorId: selectedNode.id, existingId: pendingConnectExistingId };
  }, [isAddModalOpen, selectedNode, pendingConnectExistingId]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchOpenRequested, setSearchOpenRequested] = useState(0);
  const [searchNavigateTrigger, setSearchNavigateTrigger] = useState(0);

  // Check permissions when node is selected
  useEffect(() => {
    if (selectedNode && user && graphData?.links && userProfile?.node_id) {
      const result = canEdit(selectedNode.id, userProfile.node_id, userProfile.role === 'admin', graphData.links as FamilyLink[]);
      setCanEditSelected(result);
    } else {
      setCanEditSelected(false);
    }
  }, [selectedNode, user, userProfile, graphData]);

  // Get unique family clusters
  const uniqueClusters = useMemo(() => {
    if (!graphData?.nodes) return [];
    const clusters = new Set<string>();
    graphData.nodes.forEach(n => {
      if (n.familyCluster) clusters.add(n.familyCluster);
    });
    return Array.from(clusters).sort();
  }, [graphData]);

  useEffect(() => {
    const oldList = prevUniqueClustersRef.current;
    const oldSet = new Set(oldList);
    setVisibleClusters3D((prev) => {
      const next = new Set<string>();
      if (prev.size === 0) {
        uniqueClusters.forEach((c) => next.add(c));
        prevUniqueClustersRef.current = [...uniqueClusters];
        return next;
      }
      for (const name of uniqueClusters) {
        if (!oldSet.has(name)) {
          next.add(name);
        } else if (prev.has(name)) {
          next.add(name);
        }
      }
      prevUniqueClustersRef.current = [...uniqueClusters];
      return next;
    });
  }, [uniqueClusters]);

  const ensureClusterVisible3D = useCallback((cluster: string) => {
    if (!cluster) return;
    setVisibleClusters3D((prev) => {
      if (prev.has(cluster)) return prev;
      const n = new Set(prev);
      n.add(cluster);
      return n;
    });
  }, []);

  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSetCollapsedNodes = useCallback((nodes: Set<string>) => {
    setCollapsedNodes(nodes);
  }, []);

  const handleModeChange = useCallback((newMode: '3D' | '2D') => {
    switchMode(newMode);
  }, [switchMode]);

  const handlePresetSelect = useCallback((preset: string | null) => {
    setActivePreset(preset);
  }, []);

  const handleFindMeRequest = useCallback((userCluster: string) => {
    setActivePreset(userCluster);
  }, []);

  /**
   * Spawn and Dissolve (LIN-55, ADR-0007).
   *
   * One module owns the phase, the clock and the unwind for both lifecycles
   * and both subjects. What used to be here — three ids, three `setTimeout`s
   * on three durations that disagreed, and a rollback that cleared a flag — is
   * gone; this component only says *what* happened and to *whom*.
   */
  const lifecycles = useLifecycles(mode === '3D' ? '3d' : '2d');

  /**
   * Whether this user may dissolve a given Tree Node.
   *
   * Asked per node rather than only of the selection, because the 2D view
   * offers a handle on every card: gating the handle on edit rights alone let
   * a 1-degree relative click ✓ and get silence.
   */
  const canDissolveNode = useCallback(
    (nodeId: string): boolean => {
      if (!isAdmin || !user || !graphData?.links) return false;
      return canEdit(
        nodeId,
        userProfile?.node_id ?? null,
        isAdmin,
        graphData.links as FamilyLink[]
      );
    },
    [isAdmin, user, userProfile?.node_id, graphData?.links]
  );

  /**
   * The drawer's Delete. It used to be a second delete path with a native
   * `window.confirm` and no animation; it now asks the same question the
   * canvas does, and the same Dissolve answers it (LIN-55).
   */
  const handleAdminDeleteSelectedNode = useCallback(() => {
    if (!selectedNode || !canDissolveNode(selectedNode.id)) return;
    interaction.startDissolve(selectedNode.id);
  }, [selectedNode, canDissolveNode, interaction]);

  const handleCreateRelativeDirect = useCallback(
    async (params: { firstName: string; relation: RelativeDirection; targetNodeId: string }) => {
      if (!user) return;
      try {
        const record = createTreeRecord({
          userId: user.id,
          isAdmin,
          sessionToken: session?.access_token,
        });
        const res = await record.addPerson({
          firstName: params.firstName,
          link: {
            targetId: params.targetNodeId,
            relation: params.relation,
          },
        });
        // Refetch graph data from Supabase so the new node is present in the layout
        await refetch();
        // The Person and the Kinship Link that carried them in are two
        // subjects of the same Spawn, on the same clock.
        if (res && res.id) {
          lifecycles.start('spawn', { kind: 'node', id: res.id });
          lifecycles.start('spawn', {
            kind: 'link',
            aId: params.targetNodeId,
            bId: res.id,
          });
        }
      } catch (e) {
        console.error('[handleCreateRelativeDirect] Error:', e);
        window.alert(e instanceof Error ? e.message : 'Failed to create relative.');
      }
    },
    [user, isAdmin, session?.access_token, refetch, lifecycles]
  );

  const handleConnectExistingRelativeDirect = useCallback(
    async (params: { existingNodeId: string; relation: RelativeDirection; targetNodeId: string }) => {
      if (!user) return;
      try {
        const record = createTreeRecord({
          userId: user.id,
          isAdmin,
          sessionToken: session?.access_token,
        });
        const kinship = relativeToKinshipLink(
          params.targetNodeId,
          params.existingNodeId,
          params.relation
        );
        await record.addLink(kinship);
        await refetch();
        lifecycles.start('spawn', {
          kind: 'link',
          aId: params.targetNodeId,
          bId: params.existingNodeId,
        });
      } catch (e) {
        console.error('[handleConnectExistingRelativeDirect] Error:', e);
        window.alert(e instanceof Error ? e.message : 'Failed to connect relative.');
      }
    },
    [user, isAdmin, session?.access_token, refetch, lifecycles]
  );

  const handleConfirmDissolveDirect = useCallback(
    async (node: FamilyNode) => {
      if (!user || !canDissolveNode(node.id)) return;
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      try {
        // Optimistic: the Dissolve starts now and the write runs underneath
        // it. The lifecycle unwinds itself if the write rejects.
        await lifecycles.run({
          kind: 'dissolve',
          subject: { kind: 'node', id: node.id },
          commit: () => record.removePerson({ id: node.id }),
        });
        await refetch();
        if (selectedNode?.id === node.id) {
          interaction.deselect();
        }
      } catch (e) {
        console.error('[handleConfirmDissolveDirect] Error:', e);
        // The lifecycle has already unwound the visual. Restoring the *data*
        // is a refetch until LIN-58 provides a store that can be updated
        // rather than only re-downloaded (ADR-0007).
        await refetch();
        window.alert(e instanceof Error ? e.message : 'Delete failed.');
      }
    },
    [user, isAdmin, session, refetch, selectedNode?.id, interaction, lifecycles, canDissolveNode]
  );

  /**
   * Dissolve a Kinship Link, for the admin link manager. Same lifecycle as an
   * in-canvas Dissolve — the modal supplies the confirmation, the canvas plays
   * the animation.
   */
  const handleDissolveLink = useCallback(
    async (params: { id: string; aId: string; bId: string }) => {
      if (!user) return;
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      try {
        await lifecycles.run({
          kind: 'dissolve',
          subject: { kind: 'link', aId: params.aId, bId: params.bId },
          commit: () => record.removeLink({ id: params.id }),
        });
        await refetch();
      } catch (e) {
        await refetch();
        throw e;
      }
    },
    [user, isAdmin, session, refetch, lifecycles]
  );

  const handleDirectConnectNodes = useCallback(
    async (params: {
      sourceNodeId: string;
      targetNodeId: string;
      type: 'parent' | 'marriage' | 'divorce';
      parentRole?: 'mother' | 'father' | null;
    }) => {
      if (!user) return;
      try {
        const record = createTreeRecord({
          userId: user.id,
          isAdmin,
          sessionToken: session?.access_token,
        });
        await record.addLink({
          sourceId: params.sourceNodeId,
          targetId: params.targetNodeId,
          type: params.type,
          parentRole: params.parentRole,
        });
        await refetch();
        lifecycles.start('spawn', {
          kind: 'link',
          aId: params.sourceNodeId,
          bId: params.targetNodeId,
        });
      } catch (e) {
        console.error('[handleDirectConnectNodes] Error:', e);
        window.alert(e instanceof Error ? e.message : 'Failed to create kinship link.');
      }
    },
    [isAdmin, user, session, refetch, lifecycles]
  );

  // Visible nodes for search (depends on mode)
  const visibleNodes = useMemo(() => {
    if (!graphData) return [];
    if (mode === '3D') {
      return filterGraphDataFor3D(
        graphData,
        collapsedNodes,
        visibleClusters3D,
        uniqueClusters
      ).nodes;
    }
    const filtered = filterGraphData(graphData, collapsedNodes, activePreset);
    return filtered.nodes;
  }, [graphData, mode, collapsedNodes, activePreset, visibleClusters3D, uniqueClusters]);

  // Person Matching searches the whole Tree Record and labels the rest as
  // hidden, so the modals need to know what the active filter is drawing.
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const searchMatches = useMemo(
    () => searchNodes(visibleNodes, searchQuery),
    [visibleNodes, searchQuery]
  );

  const searchHighlightedNodeId = searchMatches[searchIndex]?.id ?? null;

  const seeWhosNewButtonSx = {
    fontWeight: 700,
    ...(buttonGlowActive && {
      '@keyframes seeWhosNewGlow': {
        '0%, 100%': {
          boxShadow: '0 0 14px rgba(168, 85, 247, 0.65)',
        },
        '50%': {
          boxShadow: '0 0 28px rgba(236, 72, 153, 0.9)',
        },
      },
      animation: 'seeWhosNewGlow 1.15s ease-in-out infinite',
    }),
  } as const;

  const handleSearchPrev = useCallback(() => {
    setSearchIndex((i) => (i <= 0 ? searchMatches.length - 1 : i - 1));
    setSearchNavigateTrigger((n) => n + 1);
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setSearchIndex((i) => (i >= searchMatches.length - 1 ? 0 : i + 1));
    setSearchNavigateTrigger((n) => n + 1);
  }, [searchMatches.length]);

  const handleSearchClose = useCallback(() => {
    setSearchQuery('');
    setSearchIndex(0);
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchIndex(0);
    }
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpenRequested((n) => n + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isHydrated || isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100vh',
          minHeight: '100vh',
          background: '#0a0a0a',
          color: '#fff',
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div style={{ textAlign: 'center', minWidth: '200px' }}>
          <div>Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span> Family Tree...</div>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid rgba(255,255,255,0.3)',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '16px auto',
            }}
            role="status"
            aria-label="Loading"
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100vh',
        background: '#0a0a0a',
        color: '#ef4444',
        textAlign: 'center',
        padding: '20px',
      }}>
        <div>
          <h2>Error Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span> Family Tree</h2>
          <p>{error}</p>
          <Button variant="contained" color="primary" onClick={() => refetch()} sx={{ marginTop: '16px' }}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        textAlign: 'center',
      }}>
        <div>
          <h2>No Family Data</h2>
          <p>No family members found in the database.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: '#0a0a0a',
    }}>
      {mode === '2D' && showSeeWhosNewButton && newMembers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 1010,
            minWidth: 180,
            width: 'min(92vw, 260px)',
          }}
        >
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setNewMembersModalOpen(true)}
            fullWidth
            sx={seeWhosNewButtonSx}
          >
            See who&apos;s new!
          </Button>
        </div>
      )}

      <NewMembersModal
        open={newMembersModalOpen}
        onClose={() => setNewMembersModalOpen(false)}
        members={newMembers}
      />

      <PersonDetailDrawer
        selectedNode={selectedNode}
        onClose={() => interaction.deselect()}
        canEditSelected={canEditSelected}
        isAdmin={isAdmin}
        userProfile={userProfile}
        graphData={graphData}
        onEdit={() => setIsEditModalOpen(true)}
        onAdd={() => setIsAddModalOpen(true)}
        onInvite={() => setIsBulkInviteOpen(true)}
        onConnect={() => selectedNode && interaction.startConnect(selectedNode.id)}
        onManageLinks={() => setAdminManageLinksOpen(true)}
        onDelete={handleAdminDeleteSelectedNode}
      />

      {/* Modals */}
      {selectedNode && (
        <>
          <AddRelativeModal 
            isOpen={isAddModalOpen} 
            onClose={() => setIsAddModalOpen(false)} 
            targetNode={selectedNode} 
            onSuccess={refetch} 
            existingNodes={graphData?.nodes || []} 
            visibleIds={visibleIds}
            existingLinks={graphData?.links || []}
            onPendingConnectTargetChange={handlePendingConnectTargetChange}
          />
          <EditNodeModal 
            isOpen={isEditModalOpen} 
            onClose={() => setIsEditModalOpen(false)} 
            targetNode={selectedNode} 
            onSuccess={refetch} 
            existingNodes={graphData?.nodes || []} 
            visibleIds={visibleIds}
          />
        </>
      )}
      {isAdmin && graphData && selectedNode && (
        <AdminManageLinksModal
          isOpen={adminManageLinksOpen}
          onClose={() => setAdminManageLinksOpen(false)}
          graph={graphData}
          nodeId={selectedNode.id}
          session={session}
          isAdmin={isAdmin}
          onSuccess={() => {
            void refetch();
          }}
          onDissolveLink={handleDissolveLink}
        />
      )}
      {isAdmin && user && (
        <AdminAddPersonModal
          isOpen={adminAddPersonOpen}
          onClose={() => setAdminAddPersonOpen(false)}
          session={session}
          isAdmin={isAdmin}
          userId={user.id}
          onSuccess={() => {
            void refetch();
          }}
        />
      )}
      {userProfile?.node_id && (
        <BulkInviteModal 
          isOpen={isBulkInviteOpen} 
          onClose={() => setIsBulkInviteOpen(false)} 
          allNodes={graphData?.nodes || []} 
          allLinks={graphData?.links ? [...graphData.links] : []} 
          userNodeId={userProfile.node_id} 
          inviteForNodeId={selectedNode && selectedNode.id !== userProfile.node_id && canManageInvites(selectedNode.id, userProfile.node_id, userProfile.role === 'admin', (graphData?.links ?? []) as FamilyLink[]) ? selectedNode.id : undefined}
          onSuccess={() => {}} 
        />
      )}

      {/* Main View Content */}
      <div style={{
        width: '100%',
        height: '100%',
      }}>
        {mode === '3D' ? (
          <FamilyTree3D
            graphData={graphData}
            interaction={interaction}
            selectedNode={selectedNode}
            backgroundTheme={backgroundTheme}
            onBackgroundThemeChange={setBackgroundTheme}
            collapsedNodes={collapsedNodes}
            onToggleCollapse={handleToggleCollapse}
            onSetCollapsedNodes={handleSetCollapsedNodes}
            mode={mode}
            onModeChange={handleModeChange}
            isAddModalOpen={isAddModalOpen}
            isEditModalOpen={isEditModalOpen}
            isBulkInviteOpen={isBulkInviteOpen}
            searchHighlightedNodeId={searchHighlightedNodeId}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchMatches={searchMatches}
            searchIndex={searchIndex}
            onSearchPrev={handleSearchPrev}
            onSearchNext={handleSearchNext}
            onSearchClose={handleSearchClose}
            searchOpenRequested={searchOpenRequested}
            searchNavigateTrigger={searchNavigateTrigger}
            searchDisabled={false}
            visibleClusters3D={visibleClusters3D}
            onVisibleClusters3DChange={setVisibleClusters3D}
            uniqueClusters={uniqueClusters}
            onEnsureClusterVisible3D={ensureClusterVisible3D}
            seeWhosNewButtonSlot={
              showSeeWhosNewButton && newMembers.length > 0 ? (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => setNewMembersModalOpen(true)}
                  fullWidth
                  sx={seeWhosNewButtonSx}
                >
                  See who&apos;s new!
                </Button>
              ) : null
            }
            pendingLinkPreview={pendingLinkPreview}
            isAdmin={isAdmin}
            onAdminAddPersonClick={() => setAdminAddPersonOpen(true)}
            canEditSelected={canEditSelected}
            onCreateRelative={handleCreateRelativeDirect}
            onConnectExistingRelative={handleConnectExistingRelativeDirect}
            onDirectConnectNodes={handleDirectConnectNodes}
            lifecycles={lifecycles}
            canDissolveSelected={!!selectedNode && canDissolveNode(selectedNode.id)}
            onDissolveNode={handleConfirmDissolveDirect}
          />
        ) : (
          <FamilyTree2D
            graphData={graphData}
            interaction={interaction}
            layoutType="tree"
            activePreset={activePreset}
            backgroundTheme={backgroundTheme}
            onBackgroundThemeChange={setBackgroundTheme}
            isMobile={isMobile()}
            collapsedNodes={collapsedNodes}
            onToggleCollapse={handleToggleCollapse}
            onSetCollapsedNodes={handleSetCollapsedNodes}
            mode={mode}
            onModeChange={handleModeChange}
            uniqueClusters={uniqueClusters}
            onPresetSelect={handlePresetSelect}
            userNodeId={userProfile?.node_id ?? null}
            onFindMeRequest={handleFindMeRequest}
            searchHighlightedNodeId={searchHighlightedNodeId}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchMatches={searchMatches}
            searchIndex={searchIndex}
            onSearchPrev={handleSearchPrev}
            onSearchNext={handleSearchNext}
            onSearchClose={handleSearchClose}
            searchOpenRequested={searchOpenRequested}
            searchNavigateTrigger={searchNavigateTrigger}
            searchDisabled={!activePreset}
            pendingLinkPreview={pendingLinkPreview}
            isAdmin={isAdmin}
            onAdminAddPersonClick={() => setAdminAddPersonOpen(true)}
            onCreateRelative={handleCreateRelativeDirect}
            onConnectExistingRelative={handleConnectExistingRelativeDirect}
            onDirectConnectNodes={handleDirectConnectNodes}
            lifecycles={lifecycles}
            canDissolveNode={canDissolveNode}
            onConfirmDissolve={handleConfirmDissolveDirect}
          />
        )}
      </div>

      {/* Family Chat Bot */}
      <FamilyChat />
    </div>
  );
};

export default FamilyTree;
