import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Button from '@mui/material/Button';
import FamilyTree3D from './FamilyTree3D';
import { FamilyTree2D } from './FamilyTree2D';
import { useViewMode } from '../hooks/useViewMode';
import { useBackgroundTheme } from '../hooks/useBackgroundTheme';
import { useWorkingRecord } from '../contexts/WorkingRecordContext';
import { linkWriteOutcome } from '../hooks/useWorkingRecord';
import { useNewNodesSinceSignIn } from '../hooks/useNewNodesSinceSignIn';
import { FamilyNode } from '../types/graph';
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
import { createTreeRecord, relativeToKinshipLink, relativeToKinshipLinks } from '../lib/treeRecord';
import { useLifecycles } from '../hooks/useLifecycles';

/** What `treeRecord` sanitises a name to, so an optimistic Person reads the same as the confirmed one. */
const MAX_PERSON_NAME_LENGTH = 200;

/**
 * A rejected write has already reverted itself and unwound its lifecycle, so
 * all that is left is to say so.
 */
function reportWriteFailure(error: unknown, fallback: string): void {
  console.error('[FamilyTree] Write failed:', error);
  window.alert(error instanceof Error ? error.message : fallback);
}

export const FamilyTree: React.FC = () => {
  const { user, userProfile, isAdmin, session } = useAuth();
  const { mode, switchMode, isHydrated } = useViewMode();
  const { theme: backgroundTheme, setTheme: setBackgroundTheme } = useBackgroundTheme();
  const { working, confirmedNodes, confirmedLinks, isLoading, error, reload, write } =
    useWorkingRecord();
  const {
    newMembers,
    showSeeWhosNewButton,
    buttonGlowActive,
  } = useNewNodesSinceSignIn(user?.id, confirmedNodes);

  const interaction = useDirectManipulation();
  const selectedNode = useMemo(() => {
    if (!interaction.selectedNodeId || !working?.nodes) return null;
    return working.nodes.find((n) => n.id === interaction.selectedNodeId) ?? null;
  }, [interaction.selectedNodeId, working?.nodes]);

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

  // Permissions are derived from *confirmed* Kinship Links, never the
  // projection: the server computes the same 1-degree perimeter from persisted
  // rows, so an affordance granted by a pending link is an affordance for a
  // write the server refuses.
  useEffect(() => {
    if (selectedNode && user && userProfile?.node_id) {
      setCanEditSelected(
        canEdit(
          selectedNode.id,
          userProfile.node_id,
          userProfile.role === 'admin',
          confirmedLinks
        )
      );
    } else {
      setCanEditSelected(false);
    }
  }, [selectedNode, user, userProfile, confirmedLinks]);

  // Get unique family clusters
  const uniqueClusters = useMemo(() => {
    if (!working?.nodes) return [];
    const clusters = new Set<string>();
    working.nodes.forEach((n) => {
      if (n.familyCluster) clusters.add(n.familyCluster);
    });
    return Array.from(clusters).sort();
  }, [working]);

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
      if (!isAdmin || !user) return false;
      return canEdit(nodeId, userProfile?.node_id ?? null, isAdmin, confirmedLinks);
    },
    [isAdmin, user, userProfile?.node_id, confirmedLinks]
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

  /**
   * Spawn a Person and the Kinship Link that carries them in.
   *
   * The Person's uuid is minted here (D11) so the lifecycle can be keyed on it
   * before the network answers, the Spawn starts first, and `write` puts them
   * on the canvas before `commit` runs. Nothing here is awaited by the caller:
   * the Ghost Node used to sit in `isSubmitting` for four round-trips beside
   * the Tree Node it had already become, and now dismisses immediately.
   */
  const handleCreateRelativeDirect = useCallback(
    (params: { firstName: string; relation: RelativeDirection; targetNodeId: string }) => {
      if (!user) return;
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      const personId = crypto.randomUUID();
      const firstName = params.firstName.trim().slice(0, MAX_PERSON_NAME_LENGTH);
      const nodeSubject = { kind: 'node' as const, id: personId };
      const linkSubject = { kind: 'link' as const, aId: params.targetNodeId, bId: personId };

      // The Person and the Kinship Link are two subjects of the same Spawn, on
      // the same clock.
      lifecycles.start('spawn', nodeSubject);
      lifecycles.start('spawn', linkSubject);

      // The two cluster fields are derived server-side from the anchor and the
      // anchor's spouse, so they are deliberately absent until the server says
      // what they are rather than guessed and corrected.
      void write(
        [
          { kind: 'person-upsert', person: { id: personId, firstName } },
          ...relativeToKinshipLinks(
            params.targetNodeId,
            personId,
            params.relation,
            working?.links ?? []
          ).map((link) => ({ kind: 'link-upsert' as const, link })),
        ],
        async () => ({
          kind: 'confirmed',
          rows: await record.addPerson({
            id: personId,
            firstName,
            link: { targetId: params.targetNodeId, relation: params.relation },
          }),
        })
      ).catch((e) => {
        lifecycles.abort('spawn', nodeSubject);
        lifecycles.abort('spawn', linkSubject);
        reportWriteFailure(e, 'Failed to create relative.');
      });
    },
    [user, isAdmin, session?.access_token, lifecycles, write, working?.links]
  );

  const handleConnectExistingRelativeDirect = useCallback(
    (params: { existingNodeId: string; relation: RelativeDirection; targetNodeId: string }) => {
      if (!user) return;
      const subject = {
        kind: 'link' as const,
        aId: params.targetNodeId,
        bId: params.existingNodeId,
      };
      try {
        // Refuses `sibling` outright: it is several Kinship Links, not one.
        const kinship = relativeToKinshipLink(
          params.targetNodeId,
          params.existingNodeId,
          params.relation
        );
        const record = createTreeRecord({
          userId: user.id,
          isAdmin,
          sessionToken: session?.access_token,
        });
        lifecycles.start('spawn', subject);
        void write(
          [
            {
              kind: 'link-upsert',
              link: {
                source: kinship.sourceId,
                target: kinship.targetId,
                type: kinship.type,
                parentRole: kinship.parentRole,
              },
            },
          ],
          async () => linkWriteOutcome(await record.addLink(kinship))
        ).catch((e) => {
          lifecycles.abort('spawn', subject);
          reportWriteFailure(e, 'Failed to connect relative.');
        });
      } catch (e) {
        reportWriteFailure(e, 'Failed to connect relative.');
      }
    },
    [user, isAdmin, session?.access_token, lifecycles, write]
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
        // The Dissolve starts now, the Person leaves the Working Record now,
        // and the write runs underneath both. `write` reverts the data if it
        // rejects and the lifecycle unwinds the visual — the refetch that used
        // to stand in for the first half is the line ADR-0007 deferred here.
        await lifecycles.run({
          kind: 'dissolve',
          subject: { kind: 'node', id: node.id },
          commit: () =>
            write([{ kind: 'person-remove', id: node.id }], async () => ({
              kind: 'confirmed',
              rows: await record.removePerson({ id: node.id }),
            })),
        });
        if (selectedNode?.id === node.id) {
          interaction.deselect();
        }
      } catch (e) {
        reportWriteFailure(e, 'Delete failed.');
      }
    },
    [user, isAdmin, session?.access_token, selectedNode?.id, interaction, lifecycles, write, canDissolveNode]
  );

  /**
   * Dissolve a Kinship Link, for the admin link manager. Same lifecycle as an
   * in-canvas Dissolve — the modal supplies the confirmation, the canvas plays
   * the animation, and the modal reports a rejection this rethrows.
   */
  const handleDissolveLink = useCallback(
    async (params: { id: string; aId: string; bId: string }) => {
      if (!user) return;
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      await lifecycles.run({
        kind: 'dissolve',
        subject: { kind: 'link', aId: params.aId, bId: params.bId },
        commit: () =>
          write([{ kind: 'link-remove', id: params.id }], async () => ({
            kind: 'confirmed',
            rows: await record.removeLink({ id: params.id }),
          })),
      });
    },
    [user, isAdmin, session?.access_token, lifecycles, write]
  );

  const handleDirectConnectNodes = useCallback(
    (params: {
      sourceNodeId: string;
      targetNodeId: string;
      type: 'parent' | 'marriage' | 'divorce';
      parentRole?: 'mother' | 'father' | null;
    }) => {
      if (!user) return;
      const record = createTreeRecord({
        userId: user.id,
        isAdmin,
        sessionToken: session?.access_token,
      });
      const subject = {
        kind: 'link' as const,
        aId: params.sourceNodeId,
        bId: params.targetNodeId,
      };
      const parentRole = params.type === 'parent' ? params.parentRole ?? null : null;

      lifecycles.start('spawn', subject);
      void write(
        [
          {
            kind: 'link-upsert',
            link: {
              source: params.sourceNodeId,
              target: params.targetNodeId,
              type: params.type,
              parentRole,
            },
          },
        ],
        async () =>
          linkWriteOutcome(
            await record.addLink({
              sourceId: params.sourceNodeId,
              targetId: params.targetNodeId,
              type: params.type,
              parentRole,
            })
          )
      ).catch((e) => {
        lifecycles.abort('spawn', subject);
        reportWriteFailure(e, 'Failed to create kinship link.');
      });
    },
    [user, isAdmin, session?.access_token, lifecycles, write]
  );

  // Visible nodes for search (depends on mode)
  const visibleNodes = useMemo(() => {
    if (!working) return [];
    if (mode === '3D') {
      return filterGraphDataFor3D(working, collapsedNodes, visibleClusters3D, uniqueClusters).nodes;
    }
    return filterGraphData(working, collapsedNodes, activePreset).nodes;
  }, [working, mode, collapsedNodes, activePreset, visibleClusters3D, uniqueClusters]);

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
          <Button variant="contained" color="primary" onClick={() => reload()} sx={{ marginTop: '16px' }}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!working || working.nodes.length === 0) {
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
        confirmedLinks={confirmedLinks}
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
            existingNodes={working.nodes}
            visibleIds={visibleIds}
            existingLinks={working.links}
            onPendingConnectTargetChange={handlePendingConnectTargetChange}
          />
          <EditNodeModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            targetNode={selectedNode}
            existingNodes={working.nodes}
            visibleIds={visibleIds}
          />
        </>
      )}
      {isAdmin && selectedNode && (
        <AdminManageLinksModal
          isOpen={adminManageLinksOpen}
          onClose={() => setAdminManageLinksOpen(false)}
          graph={working}
          nodeId={selectedNode.id}
          session={session}
          isAdmin={isAdmin}
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
        />
      )}
      {userProfile?.node_id && (
        <BulkInviteModal
          isOpen={isBulkInviteOpen}
          onClose={() => setIsBulkInviteOpen(false)}
          allNodes={working.nodes}
          /* Inviting is a permission perimeter, so it reads the confirmed
             Kinship Links the server will agree with (D13). */
          allLinks={[...confirmedLinks]}
          userNodeId={userProfile.node_id}
          inviteForNodeId={
            selectedNode &&
            selectedNode.id !== userProfile.node_id &&
            canManageInvites(
              selectedNode.id,
              userProfile.node_id,
              userProfile.role === 'admin',
              confirmedLinks
            )
              ? selectedNode.id
              : undefined
          }
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
            graphData={working}
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
            graphData={working}
            confirmedLinks={confirmedLinks}
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
