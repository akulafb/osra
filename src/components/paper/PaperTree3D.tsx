import React, { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@mui/material/styles';
import type { FamilyGraph, FamilyNode } from '../../types/graph';
import { paperLines } from '../../lib/paperLayout';
import { filterGraphDataFor3D } from '../../lib/filterGraphData';
import { GRAYSCALE_PAIR, LIVE_PAIR } from '../../theme/paperPair';
import type { DirectManipulationController } from '../../hooks/useDirectManipulation';
import type { PersonDrawerInset } from '../../hooks/usePersonDrawerInset';
import type { PaperLayoutState } from '../../hooks/usePaperLayout';
import { Tree3DOverlay, type Tree3DSceneCamera, type Tree3DSearch } from '../tree3d/Tree3DOverlay';
import { useIsMobileDevice } from '../tree3d/useIsMobileDevice';
import { PaperDiscs } from './PaperDiscs';
import { PaperLines } from './PaperLines';
import { PaperLabels } from './PaperLabels';
import { PaperDuotone } from './PaperDuotone';
import { PaperHover, PaperHoverRing, PaperParticles } from './PaperHover';
import { emptyEmphasisState, type PaperEmphasisState } from './paperEmphasis';
import { PaperWebGLBoundary, PaperWebGLFallback } from './PaperWebGLFallback';
import { browserHasWebGL } from './browserHasWebGL';
import { isBackgroundTap, isTap, paperFrame, type ScreenPoint } from './paperScene';

export interface PaperTree3DProps {
  graphData: FamilyGraph;
  layout: PaperLayoutState;
  interaction: DirectManipulationController;
  collapsedNodes: Set<string>;
  onSetCollapsedNodes: (nodes: Set<string>) => void;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  isAddModalOpen?: boolean;
  isEditModalOpen?: boolean;
  isBulkInviteOpen?: boolean;
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
}

const PAPER = GRAYSCALE_PAIR.paper;
const INK = GRAYSCALE_PAIR.ink;
const PARENT_INK = `#${new THREE.Color(INK).lerp(new THREE.Color(PAPER), 0.45).getHexString()}`;

const FOG_NEAR = 0.9;
const FOG_FAR = 2.6;
const FOCUS_DISTANCE_PER_RADIUS = 10;
const MIN_FOCUS_DISTANCE = 60;

/** Paper's own 3D scene (ADR 0014): the still layout as ink discs, lines and labels, drawn in grayscale and painted in the live Paper Pair. */
export function PaperTree3D({
  graphData,
  layout: layoutState,
  interaction,
  collapsedNodes,
  onSetCollapsedNodes,
  mode,
  onModeChange,
  isAddModalOpen,
  isEditModalOpen,
  isBulkInviteOpen,
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
}: PaperTree3DProps) {
  const { panel } = useTheme().palette;
  const isMobileDevice = useIsMobileDevice();
  const [hasWebGL] = useState(browserHasWebGL);
  const [firstFrameDrawn, setFirstFrameDrawn] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showArrows, setShowArrows] = useState(false);

  const controlsRef = useRef<CameraControls | null>(null);
  const pointerDown = useRef<ScreenPoint | null>(null);
  const hoverPointer = useRef<ScreenPoint | null>(null);
  const emphasisState = useRef<PaperEmphasisState>(emptyEmphasisState());
  const personClick = useRef<MouseEvent | null>(null);
  const viewDistance = useRef(0);
  const layout = layoutState.status === 'ready' ? layoutState.layout : null;

  const shown = useMemo(() => {
    if (!layout) return { nodes: [], lines: [] };
    const visible = filterGraphDataFor3D(graphData, collapsedNodes, visibleClusters3D, uniqueClusters);
    const nodes = visible.nodes.filter((n) => layout.has(n.id));
    return { nodes, lines: paperLines(nodes, visible.links) };
  }, [graphData, layout, collapsedNodes, visibleClusters3D, uniqueClusters]);
  const shownIds = useMemo(() => shown.nodes.map((n) => n.id), [shown.nodes]);

  const frame = useMemo(() => (layout ? paperFrame(layout, layout.keys()) : null), [layout]);

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
      const disc = layout?.get(nodeId);
      const controls = controlsRef.current;
      if (!disc || !controls) return;
      const target = new THREE.Vector3(disc.x, disc.y, disc.z);
      const offset = controls.camera.position.clone().sub(controls.getTarget(new THREE.Vector3()));
      if (offset.lengthSq() === 0) offset.set(0, 0, 1);
      offset.setLength(Math.max(MIN_FOCUS_DISTANCE, disc.radius * FOCUS_DISTANCE_PER_RADIUS));
      void controls.setLookAt(
        target.x + offset.x,
        target.y + offset.y,
        target.z + offset.z,
        target.x,
        target.y,
        target.z,
        true
      );
    },
    [interaction, layout]
  );

  const resetView = useCallback(() => {
    interaction.handleBackgroundClick();
    fitFrame(true);
  }, [interaction, fitFrame]);

  const handlePersonClick = useCallback(
    (id: string, event: ThreeEvent<MouseEvent>) => {
      personClick.current = event.nativeEvent;
      if (!isTap(pointerDown.current, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY })) return;
      interaction.selectNode(id);
    },
    [interaction]
  );

  // Paper 3D has no connect picker until LIN-96, so a connect started in another view steps back out on arrival.
  const { connectSourceId, handleEscape } = interaction;
  useEffect(() => {
    if (connectSourceId) handleEscape();
  }, [connectSourceId, handleEscape]);

  // R3F reports a missed click only within 2 px, so the scene decides background taps itself, after R3F has handled the disc clicks.
  const handleSceneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      const onPerson = personClick.current === event.nativeEvent;
      if (!isBackgroundTap(pointerDown.current, { x: event.clientX, y: event.clientY }, onPerson)) return;
      interaction.handleBackgroundClick();
    },
    [interaction]
  );

  const handleSceneFailed = useCallback(() => setSceneFailed(true), []);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAddModalOpen || isEditModalOpen || isBulkInviteOpen) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      interaction.handleEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [interaction, isAddModalOpen, isEditModalOpen, isBulkInviteOpen]);

  const sceneCamera: Tree3DSceneCamera = { focusPerson, resetView };

  const search: Tree3DSearch = {
    query: searchQuery,
    onQueryChange: onSearchQueryChange,
    matches: searchMatches,
    currentIndex: searchIndex,
    onClose: onSearchClose,
    disabled: searchDisabled,
  };

  const navKeys = (
    <div style={{ lineHeight: '1.6' }}>
      <div><span style={{ color: panel.ink.strong, fontWeight: 600 }}>Esc</span>: Deselect</div>
    </div>
  );

  const failed = !hasWebGL || sceneFailed || layoutState.status === 'failed';
  const loaded = failed || (!!frame && firstFrameDrawn);
  const fallback = <PaperWebGLFallback paper={LIVE_PAIR.paper} ink={LIVE_PAIR.ink} />;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: LIVE_PAIR.paper }}
      onPointerDownCapture={(e) => {
        pointerDown.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={handleSceneClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: panel.loader.scrim, zIndex: 1000, color: panel.ink.strong, fontSize: '18px', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div>Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span>...</div>
            <div style={{ width: '40px', height: '40px', border: `4px solid ${panel.loader.track}`, borderTop: `4px solid ${panel.loader.spinner}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '10px auto' }} />
          </div>
        </div>
      )}

      {!failed ? (
        <PaperWebGLBoundary fallback={fallback} onError={handleSceneFailed}>
          <Canvas
            camera={{ fov: 50, near: 1, far: 100000, position: [0, 0, 400] }}
            dpr={[1, 2]}
            gl={{ antialias: false }}
          >
            <color attach="background" args={[PAPER]} />
            <fog attach="fog" args={[PAPER, 1, 100000]} />
            <CameraControls ref={controlsRef} makeDefault />
            <ContextLossWatch onLost={handleSceneFailed} />
            {layout && frame && (
              <>
                <PaperView viewDistance={viewDistance} />
                <InitialFraming fit={fitFrame} />
                <PaperHover
                  state={emphasisState}
                  pointer={hoverPointer}
                  layout={layout}
                  ids={shownIds}
                  links={graphData.links}
                  selectedId={interaction.selectedNodeId}
                />
                <PaperDiscs ids={shownIds} layout={layout} ink={INK} paper={PAPER} state={emphasisState} onPersonClick={handlePersonClick} />
                <PaperHoverRing state={emphasisState} layout={layout} ink={INK} />
                {showLinks && (
                  <>
                    <PaperLines
                      lines={shown.lines}
                      layout={layout}
                      ink={INK}
                      parentInk={PARENT_INK}
                      paper={PAPER}
                      state={emphasisState}
                      showArrows={showArrows}
                    />
                    <PaperParticles state={emphasisState} layout={layout} lines={shown.lines} ink={INK} />
                  </>
                )}
                {showNames && (
                  <PaperLabels nodes={shown.nodes} layout={layout} ink={INK} viewDistance={viewDistance} state={emphasisState} />
                )}
                <FirstFrame onDrawn={() => setFirstFrameDrawn(true)} />
              </>
            )}
            <PaperDuotone ink={INK} paper={PAPER} />
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
