import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@mui/material/styles';
import type { FamilyGraph, FamilyNode, RelativeDirection } from '../../types/graph';
import type { ForceGraphHandle, LiveNodePosition } from '../../types/forceGraph';
import { paperCollapsible, paperPersonClick, paperShown, type PaperShown } from '../../lib/paperCollapse';
import { paperCycle, paperKeyBlocks, type PaperArrival, type PaperKeyAction } from '../../lib/paperKeys';
import { GRAYSCALE_PAIR, livePair } from '../../theme/paperPair';
import type { DirectManipulationController } from '../../hooks/useDirectManipulation';
import { needsCanvas } from '../../lib/directManipulation';
import { hexToRgb } from '../../lib/colourBlend';
import { Manipulation3DPanel } from '../Manipulation3DPanel';
import type { GhostPreviewLook } from '../../hooks/useGhostPreview';
import { usePersonDrawerInset, type PersonDrawerInset } from '../../hooks/usePersonDrawerInset';
import type { PaperLayoutState } from '../../hooks/usePaperLayout';
import type { PaperLayout, Point3 } from '../../lib/paperLayout';
import type { LifecycleController } from '../../hooks/useLifecycles';
import { holdingProgress, inLifecycle, paperLifecycleDisc, paperLifecycleDraws, steadyLines } from '../../lib/paperLifecycle';
import { paperGhostLanding } from '../../lib/paperGhost';
import { Tree3DOverlay, type Tree3DSceneCamera, type Tree3DSearch } from '../tree3d/Tree3DOverlay';
import { useIsMobileDevice } from '../tree3d/useIsMobileDevice';
import { PaperDiscs } from './PaperDiscs';
import { PaperLines } from './PaperLines';
import { PaperLabels } from './PaperLabels';
import { PaperEffects } from './PaperEffects';
import { PaperCameraRig } from './PaperCameraRig';
import { PaperHover } from './PaperHover';
import { PaperHoverRing } from './PaperHoverRing';
import { PaperParticles } from './PaperParticles';
import { PaperRipple } from './PaperRipple';
import { PaperFocus } from './PaperFocus';
import { PaperLifecycles } from './PaperLifecycles';
import { PaperPreviewLine } from './PaperPreviewLine';
import { usePaperLifecycleScene } from './usePaperLifecycleScene';
import { PaperReveal } from './PaperReveal';
import { PaperLoader } from './PaperLoader';
import { PaperHint } from './PaperHint';
import { markPaperIntroPlayed, paperIntroPending } from './paperIntroSession';
import { wakePaperTap } from './paperTap';
import { paperFlySmoothTime, PAPER_FLY_SECONDS } from '../../lib/paperFocus';
import { PAPER_DRAG_SMOOTH_SECONDS } from '../../lib/paperCamera';
import { paperEffects } from '../../lib/paperEffects';
import { packMatches, paperClusterView, paperEscape, paperSearchCount, paperSearchLayout, paperSearchOrder } from '../../lib/paperSearch';
import { emptyEmphasisState, type PaperEmphasisState } from './paperEmphasis';
import { PaperWebGLBoundary, PaperWebGLFallback } from './PaperWebGLFallback';
import { browserHasWebGL } from './browserHasWebGL';
import { isBackgroundTap, isTap, paperFrame, paperLineShown, type ScreenPoint } from './paperScene';
import { PaperGraphHandle } from './PaperGraphHandle';
import { usePaperEditing, type PaperConnectParams } from './usePaperEditing';
import { PaperFlight } from './PaperFlight';
import { PaperSearch } from './PaperSearch';
import { usePaperKeys } from './usePaperKeys';

export interface PaperTree3DProps {
  graphData: FamilyGraph;
  layout: PaperLayoutState;
  interaction: DirectManipulationController;
  collapsedNodes: Set<string>;
  onToggleCollapse: (nodeId: string) => void;
  onSetCollapsedNodes: (nodes: Set<string>) => void;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  isAddModalOpen?: boolean;
  isModalOpen?: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchMatches: FamilyNode[];
  searchIndex: number;
  onSearchClose: () => void;
  searchOpenRequested: number;
  searchDisabled: boolean;
  visibleClusters3D: Set<string>;
  onVisibleClusters3DChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  uniqueClusters: string[];
  onEnsureClusterVisible3D: (cluster: string) => void;
  drawerInset: PersonDrawerInset;
  seeWhosNewButtonSlot?: React.ReactNode;
  isAdmin: boolean;
  onAdminAddPersonClick?: () => void;
  selectedNode: FamilyNode | null;
  /** Action Handles appear only when the active user may edit the selected Person. */
  canEditSelected: boolean;
  onCreateRelative?: (params: {
    firstName: string;
    relation: RelativeDirection;
    targetNodeId: string;
    otherParentId?: string | null;
  }) => Promise<void> | void;
  onConnectExistingRelative?: (params: {
    existingNodeId: string;
    relation: RelativeDirection;
    targetNodeId: string;
    otherParentId?: string | null;
  }) => Promise<void> | void;
  onDirectConnectNodes?: (params: PaperConnectParams) => Promise<void> | void;
  canDissolveSelected: boolean;
  onDissolveNode?: (node: FamilyNode) => Promise<void> | void;
  /** Spawn and Dissolve progress, drawn in ink. */
  lifecycles: LifecycleController;
  pendingLinkPreview?: { anchorId: string; existingId: string } | null;
}

const PAPER = GRAYSCALE_PAIR.paper;
const INK = GRAYSCALE_PAIR.ink;
const PARENT_INK = `#${new THREE.Color(INK).lerp(new THREE.Color(PAPER), 0.45).getHexString()}`;

const FOG_NEAR = 0.9;
const FOG_FAR = 2.6;
const FLY_SMOOTH_TIME = paperFlySmoothTime(PAPER_FLY_SECONDS);
const CROSSFADE_MS = 500;
const GHOST_LOOK: GhostPreviewLook = {
  color: INK,
  labelColor: INK,
  labelBackground: `rgba(${hexToRgb(PAPER).join(', ')}, 0.85)`,
};

/** The usual system double-click interval. */
const DOUBLE_CLICK_MS = 500;

interface SearchPack {
  layout: PaperLayout;
  lines: PaperShown['lines'];
  packed: ReadonlyMap<string, Point3>;
}

/** Paper's own 3D scene (ADR 0014): the still layout as ink discs, lines and labels, drawn in grayscale and painted in the live Paper Pair. */
export function PaperTree3D({
  graphData,
  layout: layoutState,
  interaction,
  collapsedNodes,
  onToggleCollapse,
  onSetCollapsedNodes,
  mode,
  onModeChange,
  isAddModalOpen,
  isModalOpen = false,
  searchQuery,
  onSearchQueryChange,
  searchMatches,
  searchIndex,
  onSearchClose,
  searchOpenRequested,
  searchDisabled,
  visibleClusters3D,
  onVisibleClusters3DChange,
  uniqueClusters,
  onEnsureClusterVisible3D,
  drawerInset,
  seeWhosNewButtonSlot,
  isAdmin,
  onAdminAddPersonClick,
  selectedNode,
  canEditSelected,
  onCreateRelative,
  onConnectExistingRelative,
  onDirectConnectNodes,
  canDissolveSelected,
  onDissolveNode,
  lifecycles,
  pendingLinkPreview = null,
}: PaperTree3DProps) {
  const { panel } = useTheme().palette;
  const isMobileDevice = useIsMobileDevice();
  const [hasWebGL] = useState(browserHasWebGL);
  const [firstFrameDrawn, setFirstFrameDrawn] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showArrows, setShowArrows] = useState(false);
  const [arrival, setArrival] = useState<PaperArrival>(() => (paperIntroPending() ? 'loader' : 'crossfade'));

  const controlsRef = useRef<CameraControls | null>(null);
  const pointerDown = useRef<ScreenPoint | null>(null);
  const hoverPointer = useRef<ScreenPoint | null>(null);
  const emphasisState = useRef<PaperEmphasisState>(emptyEmphasisState());
  const personClick = useRef<MouseEvent | null>(null);
  const doubleClickTargetId = useRef<string | null>(null);
  const pendingDeselect = useRef<number | undefined>(undefined);
  const latestInteraction = useRef(interaction);
  latestInteraction.current = interaction;
  const viewDistance = useRef(0);
  const flyTo = useRef<((id: string) => void) | null>(null);
  const graphHandle = useRef<ForceGraphHandle | null>(null);
  const openDrawerInset = usePersonDrawerInset(true);
  const fixedLayout = layoutState.status === 'ready' ? layoutState.layout : null;

  const shown = useMemo(
    () => paperShown(graphData, fixedLayout, collapsedNodes, visibleClusters3D, uniqueClusters),
    [graphData, fixedLayout, collapsedNodes, visibleClusters3D, uniqueClusters]
  );
  const shownIds = useMemo(() => shown.nodes.map((n) => n.id), [shown.nodes]);
  const shownIdSet = useMemo(() => new Set(shownIds), [shownIds]);

  const searching = searchQuery.trim() !== '' && !interaction.connectSourceId;
  const matchKey = searching ? searchMatches.flatMap((n) => (shownIdSet.has(n.id) ? [n.id] : [])).sort().join(',') : null;
  const matchIds = useMemo(() => (matchKey === null ? null : new Set(matchKey ? matchKey.split(',') : [])), [matchKey]);
  const lastPack = useRef<SearchPack | null>(null);
  const searchPack = useMemo<SearchPack | null>(() => {
    if (!fixedLayout || !matchIds) return null;
    const last = lastPack.current;
    const treeChanged = !!last && (last.layout !== fixedLayout || last.lines !== shown.lines);
    const links = shown.lines.map((line) => line.link);
    return { layout: fixedLayout, lines: shown.lines, packed: packMatches(fixedLayout, matchIds, links, treeChanged ? last.packed : undefined) };
  }, [fixedLayout, matchIds, shown.lines]);
  useLayoutEffect(() => {
    lastPack.current = searchPack;
  }, [searchPack]);
  const layout = useMemo(
    () => (fixedLayout && searchPack ? paperSearchLayout(fixedLayout, searchPack.packed) : fixedLayout),
    [fixedLayout, searchPack]
  );
  const cluster = useMemo(() => (layout && matchIds?.size ? paperFrame(layout, matchIds) : null), [layout, matchIds]);
  const matchOrder = useMemo(() => (matchIds ? paperSearchOrder(searchMatches, matchIds) : null), [searchMatches, matchIds]);
  const matchOrderIds = useMemo(() => matchOrder?.map((n) => n.id) ?? null, [matchOrder]);
  const inLifecycleIds = useMemo(() => inLifecycle(lifecycles.lifecycles), [lifecycles.lifecycles]);
  const discIds = useMemo(() => shownIds.filter((id) => !inLifecycleIds.has(id)), [shownIds, inLifecycleIds]);
  const toggles = useMemo(() => ({ links: showLinks, arrows: showArrows }), [showLinks, showArrows]);
  const lines = useMemo(
    () =>
      steadyLines(shown.lines, lifecycles.lifecycles).filter(
        (line) => paperLineShown(line.type, toggles) && (!matchIds || (matchIds.has(line.sourceId) && matchIds.has(line.targetId)))
      ),
    [shown.lines, lifecycles.lifecycles, toggles, matchIds]
  );
  const lifecycleScene = usePaperLifecycleScene(layout, shown, lifecycles.lifecycles, graphData);
  const progressOf = useMemo(() => holdingProgress(lifecycles.progressOf), [lifecycles.progressOf]);
  const lifecycleDraws = useMemo(
    () =>
      paperLifecycleDraws(lifecycles.lifecycles, lifecycleScene).filter(
        (draw) =>
          draw.kind === 'disc'
            ? !matchIds || matchIds.has(draw.id)
            : paperLineShown(draw.line.type, toggles) && (!matchIds || (matchIds.has(draw.from) && matchIds.has(draw.to)))
      ),
    [toggles, lifecycles.lifecycles, lifecycleScene, matchIds]
  );
  const labelInk = useMemo(() => {
    const byPerson = new Map(lifecycles.lifecycles.flatMap((l) => (l.subject.kind === 'node' ? [[l.subject.id, l] as const] : [])));
    return (id: string) => {
      const lifecycle = byPerson.get(id);
      const progress = lifecycle ? progressOf(lifecycle.key) : null;
      return lifecycle && progress !== null ? paperLifecycleDisc(lifecycle.kind, progress).ink : 1;
    };
  }, [lifecycles.lifecycles, progressOf]);
  const previewPair =
    pendingLinkPreview && shownIdSet.has(pendingLinkPreview.anchorId) && shownIdSet.has(pendingLinkPreview.existingId)
      ? pendingLinkPreview
      : null;
  const liveNodes = useMemo<LiveNodePosition[]>(
    () => (layout ? shownIds.map((id) => ({ id, ...layout.get(id)! })) : []),
    [layout, shownIds]
  );

  const { connect, dissolve, pickConnectTarget } = usePaperEditing({
    graphData,
    shownNodes: shown.nodes,
    interaction,
    selectedNode,
    canDissolveSelected,
    onDirectConnectNodes,
    onDissolveNode,
  });
  const connectSourceId = connect.sourceNode?.id ?? null;
  const connectTargetId = connect.pair?.target.id ?? null;
  const connectEmphasis = useMemo(
    () =>
      connectSourceId
        ? { sourceId: connectSourceId, candidateIds: connect.candidateIds, targetId: connectTargetId }
        : null,
    [connectSourceId, connect.candidateIds, connectTargetId]
  );

  const frame = useMemo(() => (fixedLayout ? paperFrame(fixedLayout, fixedLayout.keys()) : null), [fixedLayout]);

  const landingFrom = useRef({ layout: fixedLayout, shownLayout: layout, graphData });
  useLayoutEffect(() => {
    landingFrom.current = { layout: fixedLayout, shownLayout: layout, graphData };
  }, [fixedLayout, layout, graphData]);
  const ghostLook = useMemo<GhostPreviewLook>(
    () => ({
      ...GHOST_LOOK,
      landing: (anchorId, relation) => {
        const { layout: placed, shownLayout, graphData: graph } = landingFrom.current;
        return placed ? paperGhostLanding(placed, graph, anchorId, relation, shownLayout ?? placed) : null;
      },
    }),
    []
  );

  const fitFrame = useCallback(
    (smooth: boolean) => {
      if (!frame) return;
      const { center, radius } = frame;
      void controlsRef.current?.fitToSphere(
        new THREE.Sphere(new THREE.Vector3(center.x, center.y, center.z), radius),
        smooth
      );
    },
    [frame]
  );

  const focusPerson = useCallback(
    (nodeId: string) => {
      interaction.selectNode(nodeId);
      flyTo.current?.(nodeId);
    },
    [interaction]
  );

  const flyToOverview = useCallback(() => {
    if (!cluster) return fitFrame(true);
    const { center, radius } = cluster;
    void controlsRef.current?.fitToSphere(new THREE.Sphere(new THREE.Vector3(center.x, center.y, center.z), paperClusterView(radius)), true);
  }, [cluster, fitFrame]);

  const resetView = useCallback(() => {
    const focusFliesHome = interaction.state.phase === 'selected';
    interaction.handleBackgroundClick();
    if (!focusFliesHome) flyToOverview();
  }, [interaction, flyToOverview]);

  const cancelDeselect = useCallback(() => {
    window.clearTimeout(pendingDeselect.current);
    pendingDeselect.current = undefined;
  }, []);
  useEffect(() => cancelDeselect, [cancelDeselect]);

  const handlePersonClick = useCallback(
    (id: string, event: ThreeEvent<MouseEvent>) => {
      const { nativeEvent } = event;
      personClick.current = nativeEvent;
      const tap = isTap(pointerDown.current, { x: nativeEvent.clientX, y: nativeEvent.clientY });
      const click = paperPersonClick({
        id,
        detail: nativeEvent.detail,
        selectedId: interaction.state.phase === 'selected' ? interaction.selectedNodeId : null,
        connecting: !!interaction.connectSourceId,
      });
      if (click === 'ignore') return;
      doubleClickTargetId.current = tap && click !== 'pick' ? id : null;
      cancelDeselect();
      if (!tap) return;
      if (click === 'pick') pickConnectTarget(id);
      else if (click === 'select') interaction.selectNode(id);
      else {
        pendingDeselect.current = window.setTimeout(() => {
          pendingDeselect.current = undefined;
          const { state, deselect } = latestInteraction.current;
          if (state.phase === 'selected' && state.selectedNodeId === id) deselect();
        }, DOUBLE_CLICK_MS);
      }
    },
    [interaction, pickConnectTarget, cancelDeselect]
  );

  // R3F reports a missed click only within 2 px, so the scene decides background taps itself, after R3F has handled the disc clicks.
  const handleSceneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      if (event.detail > 1) return;
      const onPerson = personClick.current === event.nativeEvent;
      if (!onPerson) {
        doubleClickTargetId.current = null;
        cancelDeselect();
      }
      if (!isBackgroundTap(pointerDown.current, { x: event.clientX, y: event.clientY }, onPerson)) return;
      interaction.handleBackgroundClick();
    },
    [interaction, cancelDeselect]
  );

  const handleSceneFailed = useCallback(() => setSceneFailed(true), []);
  const handleLoaderLeave = useCallback(() => {
    markPaperIntroPlayed();
    setArrival('revealing');
  }, []);
  const handleArrived = useCallback(() => setArrival('settled'), []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const { nativeEvent } = event;
    const overCanvas = nativeEvent.target instanceof HTMLCanvasElement;
    const dragging = nativeEvent.buttons !== 0 && !isTap(pointerDown.current, { x: event.clientX, y: event.clientY });
    hoverPointer.current =
      event.pointerType === 'mouse' && overCanvas && !dragging ? { x: nativeEvent.offsetX, y: nativeEvent.offsetY } : null;
  }, []);
  const handlePointerLeave = useCallback(() => {
    hoverPointer.current = null;
  }, []);

  const handleSceneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const id = doubleClickTargetId.current;
      if (!(event.target instanceof HTMLCanvasElement) || !id) return;
      cancelDeselect();
      if (paperCollapsible(graphData.links, id)) onToggleCollapse(id);
    },
    [graphData.links, onToggleCollapse, cancelDeselect]
  );

  const escape = (): boolean => {
    const clears = paperEscape({ interactionIdle: interaction.state.phase === 'idle', searchQuery });
    if (clears === 'interaction') interaction.handleEscape();
    else if (clears === 'search') onSearchClose();
    return clears !== null;
  };

  const stepMatch = (backwards: boolean) => {
    const { phase } = interaction.state;
    if (!matchOrderIds || (phase !== 'idle' && phase !== 'selected')) return;
    const selectedId = interaction.selectedNodeId;
    const next = paperCycle(matchOrderIds, selectedId, backwards);
    if (!next) return;
    if (next === selectedId) flyTo.current?.(next);
    else interaction.selectNode(next);
  };

  const handleKeyAction = (action: PaperKeyAction): boolean => {
    const selectedId = interaction.selectedNodeId;
    switch (action) {
      case 'reset':
        resetView();
        return true;
      case 'cycle-next':
      case 'cycle-previous': {
        if (interaction.connectSourceId) return false;
        const next = paperCycle(matchOrderIds ?? shownIds, selectedId, action === 'cycle-previous');
        if (next && next !== selectedId) interaction.selectNode(next);
        return true;
      }
      case 'focus':
        if (!selectedId) return false;
        flyTo.current?.(selectedId);
        return true;
      case 'deselect':
        return escape();
    }
  };
  const keyBlocks = paperKeyBlocks({ modalOpen: isModalOpen, modalAllowsFlight: !!isAddModalOpen, arrival });
  const heldKeys = usePaperKeys({ blocked: keyBlocks, onAction: handleKeyAction });

  const sceneCamera: Tree3DSceneCamera = { focusPerson, resetView };

  const search: Tree3DSearch = {
    query: searchQuery,
    onQueryChange: onSearchQueryChange,
    matches: matchOrder ?? searchMatches,
    currentIndex: matchOrderIds ? matchOrderIds.indexOf(interaction.selectedNodeId ?? '') : searchIndex,
    onPrev: matchOrderIds ? () => stepMatch(true) : undefined,
    onNext: matchOrderIds ? () => stepMatch(false) : undefined,
    onClose: escape,
    disabled: searchDisabled,
    countLabel: matchIds ? paperSearchCount(matchIds.size) : undefined,
  };

  const navKey = { color: panel.ink.strong, fontWeight: 600 };
  const navKeys = (
    <div style={{ lineHeight: '1.6' }}>
      <div><span style={navKey}>WASD</span>: Move (Hold <span style={navKey}>Shift</span> for Boost)</div>
      <div><span style={navKey}>Q / E</span>: Rotate View L / R</div>
      <div><span style={navKey}>R</span>: Reset View</div>
      <div><span style={navKey}>Tab</span>: Cycle Names</div>
      <div><span style={navKey}>Enter</span>: Focus selection</div>
      <div><span style={navKey}>Esc</span>: Deselect</div>
    </div>
  );

  const failed = !hasWebGL || sceneFailed || layoutState.status === 'failed';
  const loaded = failed || (!!frame && firstFrameDrawn);
  useEffect(() => {
    if (failed) setArrival('settled');
  }, [failed]);
  const fallback = <PaperWebGLFallback paper={livePair.paper()} ink={livePair.ink()} />;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: livePair.paper() }}
      onPointerDownCapture={(e) => {
        pointerDown.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={handleSceneClick}
      onDoubleClick={handleSceneDoubleClick}
      onClickCapture={wakePaperTap}
      onKeyDownCapture={wakePaperTap}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {(arrival === 'loader' || arrival === 'revealing') && (
        <PaperLoader stage={loaded ? 'done' : frame ? 'scene' : 'layout'} leaving={loaded} onLeave={handleLoaderLeave} />
      )}
      {arrival === 'crossfade' && !failed && (
        <div
          onTransitionEnd={handleArrived}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: livePair.paper(), zIndex: 1000, color: panel.ink.strong, fontSize: '18px', pointerEvents: 'none', opacity: loaded ? 0 : 1, transition: `opacity ${CROSSFADE_MS}ms ease-out` }}
        >
          {!loaded && (
            <div style={{ textAlign: 'center' }}>
              <div>Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span>...</div>
              <div style={{ width: '40px', height: '40px', border: `4px solid ${panel.loader.track}`, borderTop: `4px solid ${panel.loader.spinner}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '10px auto' }} />
            </div>
          )}
        </div>
      )}
      {arrival === 'settled' && !failed && <PaperHint />}

      {!failed ? (
        <PaperWebGLBoundary fallback={fallback} onError={handleSceneFailed}>
          <Canvas
            camera={{ fov: 50, near: 1, far: 100000, position: [0, 0, 400] }}
            dpr={[1, 2]}
            gl={{ antialias: false }}
          >
            <color attach="background" args={[PAPER]} />
            <fog attach="fog" args={[PAPER, 1, 100000]} />
            <CameraControls
              ref={controlsRef}
              makeDefault
              smoothTime={FLY_SMOOTH_TIME}
              draggingSmoothTime={PAPER_DRAG_SMOOTH_SECONDS}
              dollyToCursor
            />
            <ContextLossWatch onLost={handleSceneFailed} />
            {layout && frame && (
              <>
                <PaperView viewDistance={viewDistance} />
                <PaperCameraRig frame={frame} state={emphasisState} modalOpen={isModalOpen} selected={!!interaction.selectedNodeId} />
                <PaperFlight held={heldKeys} viewDistance={viewDistance} state={emphasisState} paused={keyBlocks.flight} />
                <InitialFraming fit={fitFrame} />
                <PaperFocus
                  selectedId={interaction.selectedNodeId}
                  layout={layout}
                  ids={shownIds}
                  links={graphData.links}
                  matchIds={matchIds}
                  drawerInset={openDrawerInset}
                  onOverview={flyToOverview}
                  flyTo={flyTo}
                />
                <PaperSearch
                  layout={layout}
                  matchIds={matchIds}
                  cluster={cluster}
                  selectedId={interaction.selectedNodeId}
                  state={emphasisState}
                  flyTo={flyTo}
                  onOverview={flyToOverview}
                />
                <PaperHover
                  state={emphasisState}
                  pointer={hoverPointer}
                  layout={layout}
                  ids={shownIds}
                  links={graphData.links}
                  selectedId={interaction.selectedNodeId}
                  matchIds={matchIds}
                  connect={connectEmphasis}
                />
                <PaperGraphHandle handle={graphHandle} />
                {arrival === 'revealing' && (
                  <PaperReveal frame={frame} layout={layout} ids={shownIds} selectedId={interaction.selectedNodeId} state={emphasisState} onDone={handleArrived} />
                )}
                <PaperDiscs ids={discIds} layout={layout} ink={INK} paper={PAPER} state={emphasisState} onPersonClick={handlePersonClick} />
                <PaperHoverRing state={emphasisState} layout={layout} ink={INK} />
                {lines.length > 0 && (
                  <>
                    <PaperLines
                      lines={lines}
                      layout={layout}
                      ink={INK}
                      parentInk={PARENT_INK}
                      paper={PAPER}
                      state={emphasisState}
                      showArrows={showArrows}
                    />
                    <PaperParticles state={emphasisState} layout={layout} lines={lines} ink={INK} />
                    <PaperRipple state={emphasisState} layout={layout} lines={lines} ink={INK} />
                  </>
                )}
                {previewPair && (
                  <PaperPreviewLine
                    fromId={previewPair.anchorId}
                    toId={previewPair.existingId}
                    layout={layout}
                    ink={INK}
                    state={emphasisState}
                  />
                )}
                <PaperLifecycles
                  draws={lifecycleDraws}
                  progressOf={progressOf}
                  layout={lifecycleScene.layout}
                  ink={INK}
                  parentInk={PARENT_INK}
                  paper={PAPER}
                  state={emphasisState}
                />
                {showNames && (
                  <PaperLabels
                    nodes={lifecycleScene.nodes}
                    layout={lifecycleScene.layout}
                    ink={INK}
                    viewDistance={viewDistance}
                    state={emphasisState}
                    lifecycleInk={labelInk}
                  />
                )}
                <FirstFrame onDrawn={() => setFirstFrameDrawn(true)} />
              </>
            )}
            <PaperEffects ink={INK} paper={PAPER} settings={paperEffects(isMobileDevice)} />
          </Canvas>
        </PaperWebGLBoundary>
      ) : (
        fallback
      )}

      <Tree3DOverlay
        graphData={graphData}
        camera={sceneCamera}
        drawerInset={drawerInset}
        isMobileDevice={isMobileDevice}
        mode={mode}
        onModeChange={onModeChange}
        isAdmin={isAdmin}
        onAdminAddPersonClick={onAdminAddPersonClick}
        showNames={showNames}
        onShowNamesChange={setShowNames}
        showLinks={showLinks}
        onShowLinksChange={setShowLinks}
        showArrows={showArrows}
        onShowArrowsChange={setShowArrows}
        search={search}
        searchOpenRequested={searchOpenRequested}
        collapsedNodes={collapsedNodes}
        onSetCollapsedNodes={onSetCollapsedNodes}
        visibleClusters3D={visibleClusters3D}
        onVisibleClusters3DChange={onVisibleClusters3DChange}
        uniqueClusters={uniqueClusters}
        onEnsureClusterVisible3D={onEnsureClusterVisible3D}
        navKeys={navKeys}
        seeWhosNewButtonSlot={seeWhosNewButtonSlot}
      />

      <Manipulation3DPanel
        selectedNode={selectedNode}
        canEdit={isMobileDevice ? needsCanvas(interaction.state) : canEditSelected}
        dock={isMobileDevice ? 'bottom' : 'side'}
        existingNodes={graphData.nodes}
        visibleIds={shownIdSet}
        graphData={graphData}
        fgRef={graphHandle}
        nodes={liveNodes}
        connect={connect}
        dissolve={dissolve}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchMatches={searchMatches}
        onCreateRelative={onCreateRelative}
        onConnectExistingRelative={onConnectExistingRelative}
        ghostLook={ghostLook}
        look="paper"
      />
    </div>
  );
}

/** Keeps the camera's distance to its orbit target, and pulls the fog in with it so far discs and lines fade into the paper. */
function PaperView({ viewDistance }: { viewDistance: MutableRefObject<number> }) {
  const target = useRef(new THREE.Vector3());
  useFrame(({ camera, controls, scene }) => {
    const cameraControls = controls as CameraControls | null;
    if (!cameraControls) return;
    const distance = camera.position.distanceTo(cameraControls.getTarget(target.current));
    viewDistance.current = distance;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = distance * FOG_NEAR;
      scene.fog.far = distance * FOG_FAR;
    }
  });
  return null;
}

function InitialFraming({ fit }: { fit: (smooth: boolean) => void }) {
  const controls = useThree((state) => state.controls);
  const framed = useRef(false);
  useEffect(() => {
    if (!controls || framed.current) return;
    framed.current = true;
    fit(false);
  }, [controls, fit]);
  return null;
}

/** The loaded gate's second half: the first frame with the layout in it has been drawn. */
function FirstFrame({ onDrawn }: { onDrawn: () => void }) {
  const done = useRef(false);
  const pending = useRef(0);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    pending.current = requestAnimationFrame(onDrawn);
  });
  useEffect(() => () => cancelAnimationFrame(pending.current), []);
  return null;
}

/** A lost WebGL context leaves a blank canvas, so it fails the scene like a render error does. */
function ContextLossWatch({ onLost }: { onLost: () => void }) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [canvas, onLost]);
  return null;
}
