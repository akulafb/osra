import { useCallback, useMemo } from 'react';
import type { FamilyGraph, FamilyNode } from '../../types/graph';
import type { DirectManipulationController } from '../../hooks/useDirectManipulation';
import type { Connect3DControls, Dissolve3DControls } from '../Manipulation3DPanel';
import { buildCandidacy, candidacyFor, candidateIds, type Candidacy, type ConnectPair } from '../cards/connectCandidates';
import type { KinshipLinkType, ParentRole } from '../cards/connectOptions';

export interface DirectConnectParams {
  sourceNodeId: string;
  targetNodeId: string;
  type: KinshipLinkType;
  parentRole?: ParentRole;
  otherParentId?: string | null;
}

/** Shared so that outside Connect Mode the candidacy identity never changes,
 *  and the scene is not asked to rebuild every node object for nothing. */
const NO_CANDIDACY: Map<string, Candidacy> = new Map();

function nodeById(graph: FamilyGraph, id: string | null): FamilyNode | null {
  return id ? graph.nodes.find((n) => n.id === id) ?? null : null;
}

/** The ends of the link a confirmed pair writes: the picker may name the target as the parent, which flips the edge. */
export function connectEnds(
  pair: ConnectPair,
  type: KinshipLinkType,
  parentIsSource?: boolean
): Pick<DirectConnectParams, 'sourceNodeId' | 'targetNodeId'> {
  const flipped = type === 'parent' && parentIsSource === false;
  return flipped
    ? { sourceNodeId: pair.target.id, targetNodeId: pair.source.id }
    : { sourceNodeId: pair.source.id, targetNodeId: pair.target.id };
}

/**
 * Connect Mode and the Dissolve question for the 3D editing panel (LIN-50,
 * LIN-51), shared by Cosmos and Paper. The state stays in the
 * direct-manipulation controller and the writes in FamilyTree's handlers
 * (ADR 0004). `visibleNodes` are the people the scene draws.
 */
export function useTree3DEditing({
  graphData,
  visibleNodes,
  interaction,
  selectedNode,
  canDissolveSelected,
  onDirectConnectNodes,
  onDissolveNode,
}: {
  graphData: FamilyGraph;
  visibleNodes: FamilyNode[];
  interaction: DirectManipulationController;
  selectedNode: FamilyNode | null;
  canDissolveSelected: boolean;
  onDirectConnectNodes?: (params: DirectConnectParams) => Promise<void> | void;
  onDissolveNode?: (node: FamilyNode) => Promise<void> | void;
}): { connect: Connect3DControls; dissolve: Dissolve3DControls; pickConnectTarget: (id: string) => void } {
  const sourceNode = useMemo(() => nodeById(graphData, interaction.connectSourceId), [graphData, interaction.connectSourceId]);

  const pair = useMemo<ConnectPair | null>(() => {
    if (interaction.state.phase !== 'choosing-kinship') return null;
    const source = nodeById(graphData, interaction.state.sourceNodeId);
    const target = nodeById(graphData, interaction.state.targetNodeId);
    return source && target ? { source, target } : null;
  }, [interaction.state, graphData]);

  const rejected = useMemo(() => {
    const node = nodeById(graphData, interaction.rejectedTarget?.nodeId ?? null);
    return node && interaction.rejectedTarget ? { node, reason: interaction.rejectedTarget.reason } : null;
  }, [interaction.rejectedTarget, graphData]);

  const candidacy = useMemo(
    () => (sourceNode ? buildCandidacy(graphData, sourceNode.id, visibleNodes) : NO_CANDIDACY),
    [sourceNode, graphData, visibleNodes]
  );
  const candidates = useMemo(() => candidateIds(candidacy), [candidacy]);

  const pickConnectTarget = useCallback(
    (id: string) => {
      const sourceId = interaction.connectSourceId;
      if (!sourceId) return;
      interaction.pickConnectTarget(id, candidacyFor(graphData, sourceId, id));
    },
    [interaction, graphData]
  );

  const confirmConnect = useCallback(
    async (type: KinshipLinkType, parentRole?: ParentRole, parentIsSource?: boolean, otherParentId?: string | null) => {
      if (!pair) return;
      await Promise.resolve(
        onDirectConnectNodes?.({ ...connectEnds(pair, type, parentIsSource), type, parentRole, otherParentId })
      );
      // Escape only steps back to targeting; a confirmed link is the end of
      // Connect Mode, so land on the source as the 2D view does.
      interaction.selectNode(pair.source.id);
    },
    [pair, onDirectConnectNodes, interaction]
  );

  const connect = useMemo<Connect3DControls>(
    () => ({
      sourceNode,
      pair,
      candidacy,
      candidateIds: candidates,
      visibleNodes,
      rejected,
      onStart: () => selectedNode && interaction.startConnect(selectedNode.id),
      onPickTarget: (node) => pickConnectTarget(node.id),
      onCancelPair: () => interaction.handleEscape(),
      onExit: () => interaction.handleEscape(),
      onConfirm: confirmConnect,
    }),
    [sourceNode, pair, candidacy, candidates, visibleNodes, rejected, selectedNode, interaction, pickConnectTarget, confirmConnect]
  );

  const dissolve = useMemo<Dissolve3DControls>(
    () => ({
      canDissolve: canDissolveSelected,
      isConfirming: !!selectedNode && interaction.confirmingDissolveId === selectedNode.id,
      onStart: () => selectedNode && interaction.startDissolve(selectedNode.id),
      onCancel: () => interaction.handleEscape(),
      onConfirm: async () => {
        if (selectedNode) await Promise.resolve(onDissolveNode?.(selectedNode));
      },
    }),
    [canDissolveSelected, selectedNode, interaction, onDissolveNode]
  );

  return { connect, dissolve, pickConnectTarget };
}
