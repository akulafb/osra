import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { FamilyGraph, FamilyNode, RelativeDirection } from '../types/graph';
import { ForceGraphRef, LiveNodePosition } from '../types/forceGraph';
import { GhostNodeCard, GHOST_CARD_WIDTH } from './cards/GhostNodeCard';
import { ConnectPickerCard, PICKER_CARD_WIDTH } from './cards/ConnectPickerCard';
import { KinshipLinkType, ParentRole } from './cards/connectOptions';
import { Candidacy, ConnectPair, buildTargetOptions } from './cards/connectCandidates';
import { CONNECT_ACCENT, relationColor } from './cards/relationStyle';
import { ConnectTargetingBody } from './ConnectTargetingBody';
import { countUnreachable } from '../utils/connectTargeting';
import { CONFIRM_PULSE_COLOR } from '../utils/cosmicFx';
import { useGhostPreview } from '../hooks/useGhostPreview';
import { useTargetVisibility } from '../hooks/useTargetVisibility';

/**
 * Docked action panel for the 3D view (LIN-46, ADR 0002).
 *
 * Every hit target lives here rather than floating at the anchor planet.
 * Prototyping (branch `prototype/3d-overlay-chrome`) showed floating chrome and
 * in-scene sprites both looked better but were harder to use: in a crowded 3D
 * scene they get occluded, drift off-screen, and shrink to a few pixels with
 * distance. A docked panel has none of those failure modes.
 *
 * What keeps this from being an ordinary form is the Ghost Preview it drives —
 * a decorative marker in the scene showing where the new relative will land.
 */

const PANEL_LEFT = 24;
const PANEL_PADDING = 12;

/** The same red the scene pulses the aura with, so the pill and the planet
 *  read as one question. */
const DISSOLVE_ACCENT = CONFIRM_PULSE_COLOR;

const HANDLES: { relation: RelativeDirection; label: string }[] = [
  { relation: 'parent', label: '+ Parent' },
  { relation: 'child', label: '+ Child' },
  { relation: 'spouse', label: '+ Spouse' },
];

/**
 * Connect Mode as the panel sees it (LIN-50).
 *
 * The state itself lives in the host, because the scene needs it too: it rim-
 * lights candidates, gates the camera fly-to on a target click, and draws the
 * tractor beam. The panel owns none of it and only offers the hit targets.
 */
export interface Connect3DControls {
  /** Who the link is being drawn from; null when Connect Mode is off. */
  sourceNode: FamilyNode | null;
  /** Both ends, once a target has been resolved. */
  pair: ConnectPair | null;
  /** Verdict per person currently in the scene. */
  candidacy: Map<string, Candidacy>;
  /** The accepted ids, already derived by the scene for its rim-lighting. */
  candidateIds: Set<string>;
  /** Everyone drawn in the scene — the pool offered when nothing is typed. */
  visibleNodes: FamilyNode[];
  /** The last aim that landed on someone who cannot be a target. */
  rejected: { node: FamilyNode; reason: string } | null;
  onStart: () => void;
  onPickTarget: (node: FamilyNode) => void;
  /** Drop the chosen pair, returning to targeting. */
  onCancelPair: () => void;
  /** Leave Connect Mode entirely. */
  onExit: () => void;
  onConfirm: (
    type: KinshipLinkType,
    parentRole?: ParentRole,
    parentIsSource?: boolean
  ) => Promise<void> | void;
}

/**
 * Delete confirmation as the panel sees it (LIN-51).
 *
 * Same split as Connect Mode: the state lives in the host because the scene
 * renders it — the selected planet's aura and glow pulse red — while the ✓ / ✕
 * that answer the question are DOM here, where they are always hittable.
 */
export interface Dissolve3DControls {
  /** Dissolve is admin-only; the handle is not offered to anyone else. */
  canDissolve: boolean;
  /** True while the confirmation is raised on the selected node. */
  isConfirming: boolean;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export interface Manipulation3DPanelProps {
  selectedNode: FamilyNode | null;
  /** Action Handles appear only when the active user may edit this person. */
  canEdit: boolean;
  existingNodes: FamilyNode[];
  graphData: FamilyGraph;
  fgRef: ForceGraphRef;
  /** Live simulated nodes — the array handed to the graphData prop. */
  nodes: LiveNodePosition[];
  connect: Connect3DControls;
  dissolve: Dissolve3DControls;
  /** The existing search query, reused as the fallback target filter. */
  searchQuery: string;
  onSearchQueryChange?: (query: string) => void;
  /** The existing `TreeSearchBar` result set. */
  searchMatches: FamilyNode[];
  onCreateRelative?: (params: {
    firstName: string;
    relation: RelativeDirection;
    targetNodeId: string;
  }) => Promise<void> | void;
  onConnectExistingRelative?: (params: {
    existingNodeId: string;
    relation: RelativeDirection;
    targetNodeId: string;
  }) => Promise<void> | void;
}

/**
 * The leader line and ring, isolated in their own component.
 *
 * The anchor is re-projected every frame, so this re-renders continuously while
 * the simulation settles or the camera moves. Keeping it separate means that
 * churn never reaches the panel — and, critically, never reaches the text input
 * inside GhostNodeCard.
 */
const AnchorLeaderLine: React.FC<{
  fgRef: ForceGraphRef;
  nodes: LiveNodePosition[];
  nodeId: string;
  color: string;
  /** Where the line meets the panel — derived by the caller from the panel's
   *  own width, so widening the panel for a card cannot detach it. */
  panelRightEdge: number;
}> = ({ fgRef, nodes, nodeId, color, panelRightEdge }) => {
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);

  // Read through a ref so a new array identity does not restart the loop.
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    let frameId = 0;
    const viewSpace = new THREE.Vector3();

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const fg = fgRef.current;
      const project = fg?.graph2ScreenCoords;
      const camera = fg?.camera?.();
      const live = nodesRef.current.find((n) => n.id === nodeId);
      if (!project || !camera || !live || typeof live.x !== 'number') return;

      // graph2ScreenCoords projects without any frustum test, so a point behind
      // the camera comes back point-mirrored into view — the ring would then
      // draw around an unrelated planet. Check view-space depth ourselves.
      viewSpace.set(live.x, live.y as number, live.z as number).applyMatrix4(camera.matrixWorldInverse);
      if (viewSpace.z > 0) {
        setScreen((prev) => (prev === null ? prev : null));
        return;
      }

      const next = project(live.x, live.y as number, live.z as number);
      if (!next) return;
      setScreen((prev) =>
        prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5
          ? prev
          : { x: next.x, y: next.y }
      );
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [fgRef, nodeId]);

  if (!screen) return null;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, zIndex: 1200, pointerEvents: 'none' }}
      width="100%"
      height="100%"
    >
      <line
        x1={screen.x}
        y1={screen.y}
        x2={panelRightEdge}
        y2="50%"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        opacity={0.6}
      />
      <circle
        cx={screen.x}
        cy={screen.y}
        r={7}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.9}
      />
    </svg>
  );
};

export const Manipulation3DPanel: React.FC<Manipulation3DPanelProps> = ({
  selectedNode,
  canEdit,
  existingNodes,
  graphData,
  fgRef,
  nodes,
  connect,
  dissolve,
  searchQuery,
  onSearchQueryChange,
  searchMatches,
  onCreateRelative,
  onConnectExistingRelative,
}) => {
  const [relation, setRelation] = useState<RelativeDirection | null>(null);
  const [previewName, setPreviewName] = useState('');

  const selectedId = selectedNode?.id ?? null;
  const visible = Boolean(selectedNode && canEdit);
  const isTargeting = Boolean(connect.sourceNode && !connect.pair);

  useGhostPreview({
    fgRef,
    nodes,
    anchorNodeId: relation ? selectedId : null,
    relation,
    name: previewName,
    enabled: visible,
  });

  const visibility = useTargetVisibility({
    fgRef,
    nodes,
    targetIds: connect.candidateIds,
    enabled: isTargeting,
  });

  const { options: targetOptions, total: targetOptionTotal } = useMemo(
    () =>
      connect.sourceNode
        ? buildTargetOptions({
            query: searchQuery,
            matches: searchMatches,
            visibleNodes: connect.visibleNodes,
            sourceId: connect.sourceNode.id,
            candidacy: connect.candidacy,
            visibility,
          })
        : { options: [], total: 0 },
    [connect.sourceNode, connect.candidacy, connect.visibleNodes, searchQuery, searchMatches, visibility]
  );

  // Before the first sample every candidate reads as unreachable, which would
  // flash a misleading hint; say nothing until the scene has been measured.
  const unreachableCount = visibility.size
    ? countUnreachable([...connect.candidateIds].map((id) => visibility.get(id) ?? 'offscreen'))
    : 0;

  // Abandon any in-flight action when the selection moves elsewhere.
  useEffect(() => {
    setRelation(null);
    setPreviewName('');
  }, [selectedId]);

  const closeGhostNode = useCallback(() => {
    setRelation(null);
    setPreviewName('');
  }, []);

  const handleSubmit = useCallback(
    async (firstName: string) => {
      if (!selectedId || !relation) return;
      await Promise.resolve(
        onCreateRelative?.({ firstName, relation, targetNodeId: selectedId })
      );
      closeGhostNode();
    },
    [selectedId, relation, onCreateRelative, closeGhostNode]
  );

  const handleConnectExisting = useCallback(
    async (existingNodeId: string) => {
      if (!selectedId || !relation) return;
      await Promise.resolve(
        onConnectExistingRelative?.({ existingNodeId, relation, targetNodeId: selectedId })
      );
      closeGhostNode();
    },
    [selectedId, relation, onConnectExistingRelative, closeGhostNode]
  );

  const startConnect = useCallback(() => {
    closeGhostNode();
    connect.onStart();
  }, [closeGhostNode, connect]);

  const startDissolve = useCallback(() => {
    closeGhostNode();
    dissolve.onStart();
  }, [closeGhostNode, dissolve]);

  if (!selectedNode || !canEdit) return null;

  const inConnectMode = Boolean(connect.sourceNode);
  const isConfirmingDissolve = dissolve.isConfirming && !inConnectMode && !relation;
  const accent = inConnectMode
    ? CONNECT_ACCENT
    : isConfirmingDissolve
      ? DISSOLVE_ACCENT
      : relation
        ? relationColor(relation)
        : '#a78bfa';

  // The kinship picker is wider than the Ghost Node card, so the panel takes
  // whichever card it is currently holding.
  const panelWidth = (connect.pair ? PICKER_CARD_WIDTH : GHOST_CARD_WIDTH) + PANEL_PADDING * 2;

  return (
    <>
      <AnchorLeaderLine
        fgRef={fgRef}
        nodes={nodes}
        nodeId={connect.sourceNode?.id ?? selectedNode.id}
        color={accent}
        panelRightEdge={PANEL_LEFT + panelWidth}
      />

      <div
        style={{
          position: 'absolute',
          left: PANEL_LEFT,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1250,
          width: panelWidth,
          boxSizing: 'border-box',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12,
          padding: PANEL_PADDING,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.65)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {connect.sourceNode?.firstName ?? selectedNode.firstName}
        </div>

        {isConfirmingDissolve && (
          /*
           * The confirm pill (LIN-51). The question is asked twice over: the
           * planet's aura pulses red in the scene, and the answer is taken
           * here, where a hit target cannot be occluded or shrink to a few
           * pixels at distance.
           */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
              Dissolve <strong>{selectedNode.firstName}</strong>? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => dissolve.onConfirm()}
                aria-label={`Confirm dissolving ${selectedNode.firstName}`}
                style={{
                  flex: 1,
                  background: DISSOLVE_ACCENT,
                  border: `1.5px solid ${DISSOLVE_ACCENT}`,
                  borderRadius: 999,
                  color: '#0f172a',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '6px 10px',
                }}
              >
                ✓
              </button>
              <button
                type="button"
                onClick={dissolve.onCancel}
                aria-label="Keep this person"
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  borderRadius: 999,
                  color: 'rgba(255,255,255,0.85)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '6px 10px',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {!relation && !inConnectMode && !isConfirmingDissolve && (
          <>
            {HANDLES.map(({ relation: rel, label }) => (
              <button
                key={rel}
                type="button"
                onClick={() => setRelation(rel)}
                style={{
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: `1.5px solid ${relationColor(rel)}`,
                  borderRadius: 999,
                  color: relationColor(rel),
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '6px 10px',
                  textAlign: 'left',
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={startConnect}
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                border: `1.5px solid ${CONNECT_ACCENT}`,
                borderRadius: 999,
                color: CONNECT_ACCENT,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 10px',
                textAlign: 'left',
              }}
            >
              🔗 Connect
            </button>
            {dissolve.canDissolve && (
              <button
                type="button"
                onClick={startDissolve}
                style={{
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: `1.5px solid ${DISSOLVE_ACCENT}`,
                  borderRadius: 999,
                  color: DISSOLVE_ACCENT,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '6px 10px',
                  textAlign: 'left',
                }}
              >
                ✕ Dissolve
              </button>
            )}
          </>
        )}

        {relation && !inConnectMode && (
          <GhostNodeCard
            relation={relation}
            anchorNodeId={selectedNode.id}
            anchorFirstName={selectedNode.firstName}
            existingNodes={existingNodes}
            onSubmit={handleSubmit}
            onConnectExisting={handleConnectExisting}
            onCancel={closeGhostNode}
            onNameChange={setPreviewName}
          />
        )}

        {isTargeting && connect.sourceNode && (
          <ConnectTargetingBody
            sourceNode={connect.sourceNode}
            options={targetOptions}
            candidateCount={connect.candidateIds.size}
            optionTotal={targetOptionTotal}
            unreachableCount={unreachableCount}
            rejected={connect.rejected}
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onPickTarget={connect.onPickTarget}
            onExit={connect.onExit}
          />
        )}

        {connect.pair && (
          <ConnectPickerCard
            sourceId={connect.pair.source.id}
            sourceFirstName={connect.pair.source.firstName}
            targetId={connect.pair.target.id}
            targetFirstName={connect.pair.target.firstName}
            graphData={graphData}
            onConfirm={connect.onConfirm}
            onCancel={connect.onCancelPair}
          />
        )}
      </div>
    </>
  );
};
