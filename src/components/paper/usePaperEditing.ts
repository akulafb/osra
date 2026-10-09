import { useCallback, useMemo } from 'react';
import type { FamilyGraph, FamilyNode } from '../../types/graph';
import type { DirectManipulationController } from '../../hooks/useDirectManipulation';
import type { Connect3DControls, Dissolve3DControls } from '../Manipulation3DPanel';
import { buildCandidacy, candidacyFor, candidateIds, type Candidacy, type ConnectPair } from '../cards/connectCandidates';
import type { KinshipLinkType, ParentRole } from '../cards/connectOptions';

export interface PaperConnectParams {
  sourceNodeId: string;
  targetNodeId: string;
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
  otherParentId?: string | null;
}

const NO_CANDIDACY: Map<string, Candidacy> = new Map();

function nodeById(graph: FamilyGraph, id: string | null): FamilyNode | null {
  return id ? graph.nodes.find((n) => n.id === id) ?? null : null;
}

/**
 * Connect Mode and the Dissolve question for the 3D editing panel, as Cosmos
 * offers them (LIN-50, LIN-51). The state stays in the direct-manipulation
 * controller and the writes in FamilyTree's handlers (ADR 0004).
 */
export function usePaperEditing({
  graphData,
  shownNodes,
  interaction,
  selectedNode,
  canDissolveSelected,
  onDirectConnectNodes,
  onDissolveNode,
}: {
  graphData: FamilyGraph;
  shownNodes: FamilyNode[];
  interaction: DirectManipulationController;
  selectedNode: FamilyNode | null;
  canDissolveSelected: boolean;
  onDirectConnectNodes?: (params: PaperConnectParams) => Promise<void> | void;
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
    () => (sourceNode ? buildCandidacy(graphData, sourceNode.id, shownNodes) : NO_CANDIDACY),
    [sourceNode, graphData, shownNodes]
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
      const flipped = type === 'parent' && parentIsSource === false;
      await Promise.resolve(
        onDirectConnectNodes?.({
          sourceNodeId: flipped ? pair.target.id : pair.source.id,
          targetNodeId: flipped ? pair.source.id : pair.target.id,
          type,
          parentRole,
          otherParentId,
        })
      );
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
      visibleNodes: shownNodes,
      rejected,
      onStart: () => selectedNode && interaction.startConnect(selectedNode.id),
      onPickTarget: (node) => pickConnectTarget(node.id),
      onCancelPair: () => interaction.handleEscape(),
      onExit: () => interaction.handleEscape(),
      onConfirm: confirmConnect,
    }),
    [sourceNode, pair, candidacy, candidates, shownNodes, rejected, selectedNode, interaction, pickConnectTarget, confirmConnect]
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
