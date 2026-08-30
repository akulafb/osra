import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useSpring, animated } from 'react-spring';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomBehavior } from 'd3-zoom';
import type { D3ZoomEvent } from 'd3-zoom';
import 'd3-transition'; // Import for transition support
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { FamilyGraph, FamilyNode, FamilyLink, Node2D, LayoutType } from '../types/graph';
import { calculateLayout, calculateBounds } from '../lib/layoutEngine';
import NodeCard from './NodeCard';
import { RelativeDirection } from '../types/graph';
import { GhostNode } from './GhostNode';
import { InlineConnectPicker } from './InlineConnectPicker';
import { NodeLifecycleFx } from './NodeLifecycleFx';
import { LifecycleController } from '../hooks/useLifecycles';
import { lifecyclesOfKind } from '../lib/lifecycle';
import { OrthogonalLinks } from './OrthogonalLinks';
import { getNodeId } from '../lib/familyGraph';
import { filterGraphData } from '../lib/filterGraphData';
import { connectedPersonIds } from '../lib/personMatch';
import { TreeSearchBar } from './TreeSearchBar';
import { canEdit } from '../lib/permissions';
import type { BackgroundTheme } from '../hooks/useBackgroundTheme';
import { DirectManipulationController } from '../hooks/useDirectManipulation';
import { candidacyFor } from './cards/connectCandidates';

function getBackgroundForTheme(theme: BackgroundTheme): string {
  switch (theme) {
    case 'deep-space':
      return 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)';
    case 'wax-white':
      return '#fffef8';
    case 'smooth-sepia':
      return '#e8dcc8';
    case 'baby-blue':
      return '#d4e8f7';
    default:
      return 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)';
  }
}

const THEME_LABELS: Record<BackgroundTheme, string> = {
  'deep-space': 'Deep Space',
  'wax-white': 'Wax White',
  'smooth-sepia': 'Smooth Sepia',
  'baby-blue': 'Baby Blue',
};

interface FamilyTree2DProps {
  graphData: FamilyGraph;
  layoutType: LayoutType;
  interaction: DirectManipulationController;
  activePreset?: string | null;
  onNodeDoubleClick?: (node: FamilyNode) => void;
  collapsedNodes?: Set<string>;
  onToggleCollapse?: (nodeId: string) => void;
  onSetCollapsedNodes?: (nodes: Set<string>) => void;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  uniqueClusters: string[];
  onPresetSelect: (preset: string | null) => void;
  isMobile?: boolean;
  userNodeId?: string | null;
  /**
   * The *confirmed* Kinship Links, for the per-card edit affordance. The server
   * derives the same 1-degree perimeter from persisted rows, so a pending link
   * would offer a handle for a write it refuses (LIN-58's D13).
   */
  confirmedLinks: readonly FamilyLink[];
  onFindMeRequest?: (userCluster: string) => void;
  searchHighlightedNodeId?: string | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  searchMatches?: FamilyNode[];
  searchIndex?: number;
  onSearchPrev?: () => void;
  onSearchNext?: () => void;
  onSearchClose?: () => void;
  searchOpenRequested?: number;
  searchNavigateTrigger?: number;
  searchDisabled?: boolean;
  backgroundTheme?: BackgroundTheme;
  onBackgroundThemeChange?: (theme: BackgroundTheme) => void;
  /** Dashed preview edge while Add Relative connect-to-existing is focused */
  pendingLinkPreview?: { anchorId: string; existingId: string } | null;
  /** Admin: add standalone person (opens modal in parent) */
  isAdmin?: boolean;
  onAdminAddPersonClick?: () => void;
  /** Direct inline Ghost Node creation and linking handlers */
  onCreateRelative?: (params: { firstName: string; relation: RelativeDirection; targetNodeId: string }) => Promise<void> | void;
  onConnectExistingRelative?: (params: { existingNodeId: string; relation: RelativeDirection; targetNodeId: string }) => Promise<void> | void;
  /** Direct inline Two-Click Connect kinship linking handler */
  onDirectConnectNodes?: (params: {
    sourceNodeId: string;
    targetNodeId: string;
    type: 'parent' | 'marriage' | 'divorce';
    parentRole?: 'mother' | 'father' | null;
  }) => Promise<void> | void;
  /**
   * Spawn and Dissolve (LIN-55, ADR-0007). One controller replaces the loose
   * animation ids and the dead completion callback: the lifecycle owns the
   * clock, and this view is one of its two renderings.
   */
  lifecycles: LifecycleController;
  /**
   * Whether this user may dissolve a given Tree Node. 3D asks the same question
   * of the selected node (`canDissolveSelected`); 2D has a handle per card, so
   * it asks per node rather than showing one that does nothing (LIN-55).
   */
  canDissolveNode?: (nodeId: string) => boolean;
  onConfirmDissolve?: (node: Node2D) => void;
}

function ExpandableSpring({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const spring = useSpring({
    maxHeight: isOpen ? 400 : 0,
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });
  return (
    <animated.div style={{ ...spring, overflow: 'hidden' }}>
      {children}
    </animated.div>
  );
}

export const FamilyTree2D: React.FC<FamilyTree2DProps> = ({
  graphData,
  layoutType,
  interaction,
  activePreset,
  onNodeDoubleClick,
  collapsedNodes = new Set(),
  onToggleCollapse,
  onSetCollapsedNodes,
  mode,
  onModeChange,
  uniqueClusters,
  onPresetSelect,
  isMobile = false,
  userNodeId = null,
  confirmedLinks,
  onFindMeRequest,
  searchHighlightedNodeId = null,
  searchQuery = '',
  onSearchQueryChange,
  searchMatches = [],
  searchIndex = 0,
  onSearchPrev,
  onSearchNext,
  onSearchClose,
  searchOpenRequested = 0,
  searchNavigateTrigger = 0,
  searchDisabled = false,
  backgroundTheme = 'deep-space',
  onBackgroundThemeChange,
  pendingLinkPreview = null,
  isAdmin = false,
  onAdminAddPersonClick,
  onCreateRelative,
  onConnectExistingRelative,
  onDirectConnectNodes,
  lifecycles,
  canDissolveNode,
  onConfirmDissolve,
}) => {
  const presetBackground = getBackgroundForTheme(backgroundTheme);
  const emptyBackground = getBackgroundForTheme(backgroundTheme);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pendingFindMeRef = useRef<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  // Read by the layout pin, which must not re-run when the user pans.
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobileViewport(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Filter graph data by preset and collapsed nodes
  const filteredGraphData = useMemo(() => {
    if (!activePreset) return { nodes: [], links: [] };
    return filterGraphData(graphData, collapsedNodes, activePreset);
  }, [graphData, collapsedNodes, activePreset]);

  // Who is currently drawn. Person Matching keeps searching the whole Tree
  // Record and labels the rest as hidden, rather than letting a filter make a
  // duplicate look like a new person.
  const visibleIds = useMemo(
    () => new Set(filteredGraphData.nodes.map((n) => n.id)),
    [filteredGraphData]
  );

  // People already linked to the Ghost Node's anchor: a Person Match may name
  // them, but linking them again would write a duplicate Kinship Link.
  const ghostAnchorId = interaction.creatingRelative?.anchorNodeId ?? null;
  const ghostConnectedIds = useMemo(
    () => (ghostAnchorId ? connectedPersonIds(graphData?.links || [], ghostAnchorId) : undefined),
    [graphData?.links, ghostAnchorId]
  );

  // Calculate layout
  const { nodes, links } = useMemo(() => {
    if (filteredGraphData.nodes.length === 0) return { nodes: [], links: [] };
    return calculateLayout(
      filteredGraphData.nodes,
      filteredGraphData.links,
      layoutType,
      activePreset ?? undefined
    );
  }, [filteredGraphData, layoutType]);

  // Calculate bounds and center the view
  const bounds = useMemo(() => calculateBounds(nodes), [nodes]);
  // Read inside the fit effect without making a layout change re-trigger it.
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // Which nodes are hidden, as a value rather than a Set identity, so the fit
  // below reacts to a collapse and not to a re-render.
  const collapsedKey = useMemo(
    () => Array.from(collapsedNodes).sort().join(','),
    [collapsedNodes]
  );
  const isEmpty = nodes.length === 0;
  // Set by the fit below, so the pin further down does not fight it.
  const justFittedRef = useRef(false);

  // Setup zoom behavior
  useEffect(() => {
    if (!svgRef.current) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('start', () => setIsDragging(true))
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform);
      })
      .on('end', () => setIsDragging(false));

    zoomBehaviorRef.current = zoomBehavior;

    const selection = select(svgRef.current);
    selection.call(zoomBehavior as any);

    return () => {
      selection.on('.zoom', null);
    };
  }, [activePreset]); // Re-attach zoom behavior when SVG is rendered after preset selection

  // Fit the view to the tree when the *view* changes — a preset, a layout, a
  // collapse, or the first load. Deliberately not when a Spawn or Dissolve
  // changes the node set underneath a stable view: refitting on that threw the
  // camera off the thing the user had just acted on (LIN-55).
  useEffect(() => {
    const bounds = boundsRef.current;
    if (!svgRef.current || !bounds || isEmpty) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    // Calculate center position
    const fittedScale = Math.min(
      rect.width / (bounds.width + 100),
      rect.height / (bounds.height + 100),
      1.2
    );
    const scale = Math.max(0.35, fittedScale);

    const centerX = rect.width / 2 - (bounds.minX + bounds.width / 2) * scale;
    const centerY = rect.height / 2 - (bounds.minY + bounds.height / 2) * scale;

    // Apply initial transform
    const initialTransform = zoomIdentity.translate(centerX, centerY).scale(scale);

    if (zoomBehaviorRef.current) {
      justFittedRef.current = true;
      select(svgRef.current)
        .call(zoomBehaviorRef.current.transform as any, initialTransform);
    }
  }, [activePreset, layoutType, collapsedKey, isEmpty]);

  // Keep the viewport pinned to whatever was at its centre when the layout
  // reflows. Adding a person re-tidies the entire tree, so every node moves —
  // the camera never budged, but the tree slid out from under it just as the
  // Spawn started playing (LIN-55). Pinning a node that survived the reflow
  // holds the picture still and lets the tree rearrange around it.
  const previousLayoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  useEffect(() => {
    const previous = previousLayoutRef.current;
    const current = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    previousLayoutRef.current = current;

    if (justFittedRef.current) {
      justFittedRef.current = false;
      return;
    }
    if (previous.size === 0 || current.size === 0) return;
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const t = transformRef.current;

    // Viewport centre, in layout coordinates.
    const centreX = (rect.width / 2 - t.x) / t.k;
    const centreY = (rect.height / 2 - t.y) / t.k;

    let pin: { before: { x: number; y: number }; after: { x: number; y: number } } | null = null;
    let nearest = Infinity;
    previous.forEach((before, id) => {
      const after = current.get(id);
      if (!after) return;
      const distance = (before.x - centreX) ** 2 + (before.y - centreY) ** 2;
      if (distance < nearest) {
        nearest = distance;
        pin = { before, after };
      }
    });
    if (!pin) return;

    const { before, after } = pin as { before: { x: number; y: number }; after: { x: number; y: number } };
    const dx = (before.x - after.x) * t.k;
    const dy = (before.y - after.y) * t.k;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    // No transition: this is a correction, not a movement. It should be
    // invisible, so that the reflow reads as the tree making room.
    select(svg).call(
      zoomBehaviorRef.current.transform as any,
      zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)
    );
  }, [nodes]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && nodes.length > 0) {
        e.preventDefault();

        const currentIndex = interaction.selectedNodeId
          ? nodes.findIndex(n => n.id === interaction.selectedNodeId)
          : -1;

        const nextIndex = e.shiftKey
          ? currentIndex <= 0 ? nodes.length - 1 : currentIndex - 1
          : (currentIndex + 1) % nodes.length;

        const nextNode = nodes[nextIndex];
        interaction.selectNode(nextNode.id);

        // Pan to the selected node
        if (svgRef.current && zoomBehaviorRef.current) {
          const svg = svgRef.current;
          const rect = svg.getBoundingClientRect();

          const targetTransform = zoomIdentity
            .translate(rect.width / 2 - nextNode.x * transform.k, rect.height / 2 - nextNode.y * transform.k)
            .scale(transform.k);

          select(svg)
            .transition()
            .duration(300)
            .call(zoomBehaviorRef.current.transform as any, targetTransform);
        }
      } else if (e.key === 'Escape') {
        interaction.handleEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, interaction, transform.k]);

  // Focus on specific node (scale 1.25 for subtle "Find me!" zoom; duration in ms)
  const FOCUS_DURATION = 1040;
  const SEARCH_FOCUS_DURATION = 2080;

  const focusNode = useCallback((nodeId: string, scale = 1.2, durationMs = FOCUS_DURATION) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !svgRef.current || !zoomBehaviorRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    // D3 zoom: point (px, py) → (x + px*k, y + py*k). To center node at viewport:
    const targetTransform = zoomIdentity
      .translate(rect.width / 2 - node.x * scale, rect.height / 2 - node.y * scale)
      .scale(scale);

    select(svg)
      .transition()
      .duration(durationMs)
      .call(zoomBehaviorRef.current.transform as any, targetTransform);
  }, [nodes]);

  const framePreviewLinkEndpoints = useCallback(() => {
    if (!pendingLinkPreview || !svgRef.current || !zoomBehaviorRef.current) return;
    const a = nodes.find((n) => n.id === pendingLinkPreview.anchorId);
    const b = nodes.find((n) => n.id === pendingLinkPreview.existingId);
    if (!a || !b) return;

    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y + a.height, b.y + b.height);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const w = Math.max(maxX - minX, 40) + 180;
    const h = Math.max(maxY - minY, 40) + 180;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / w, rect.height / h, 1.4);
    const k = Math.max(0.28, Math.min(scale, 2));
    const tx = rect.width / 2 - centerX * k;
    const ty = rect.height / 2 - centerY * k;
    const targetTransform = zoomIdentity.translate(tx, ty).scale(k);

    select(svg)
      .transition()
      .duration(750)
      .call(zoomBehaviorRef.current.transform as any, targetTransform);
  }, [pendingLinkPreview, nodes]);

  useEffect(() => {
    if (!pendingLinkPreview) return;
    const id = window.setTimeout(() => framePreviewLinkEndpoints(), 80);
    return () => clearTimeout(id);
  }, [pendingLinkPreview?.anchorId, pendingLinkPreview?.existingId, framePreviewLinkEndpoints]);

  // Handle "Find me!" click: switch preset if needed, pan/zoom, temporary glow
  const handleFindMe = useCallback(() => {
    if (!userNodeId) return;
    const userNode = graphData.nodes.find(n => n.id === userNodeId);
    if (!userNode) return;
    const userCluster = userNode.familyCluster ?? userNode.maternalFamilyCluster ?? null;

    if (!activePreset || (userCluster && activePreset !== userCluster)) {
      if (userCluster) onFindMeRequest?.(userCluster);
    }

    setHighlightedNodeId(userNodeId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedNodeId(null);
      highlightTimeoutRef.current = null;
    }, 3500);

    if (nodes.some(n => n.id === userNodeId)) {
      focusNode(userNodeId, 1.25, FOCUS_DURATION);
    } else {
      pendingFindMeRef.current = userNodeId;
    }
  }, [userNodeId, graphData.nodes, activePreset, onFindMeRequest, nodes, focusNode]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  // Focus when user's node appears after preset switch
  useEffect(() => {
    const pending = pendingFindMeRef.current;
    if (!pending || !nodes.some(n => n.id === pending)) return;
    pendingFindMeRef.current = null;
    focusNode(pending, 1.25, FOCUS_DURATION);
  }, [nodes, focusNode]);

  // Expand settings when Ctrl+F opens search
  useEffect(() => {
    if (searchOpenRequested > 0) {
      setShowControls(true);
    }
  }, [searchOpenRequested]);

  // Navigate only when arrow is clicked or Enter pressed (not when typing)
  const prevSearchNavigateTrigger = useRef(0);
  useEffect(() => {
    if (searchNavigateTrigger > prevSearchNavigateTrigger.current) {
      prevSearchNavigateTrigger.current = searchNavigateTrigger;
      if (searchHighlightedNodeId && nodes.some(n => n.id === searchHighlightedNodeId)) {
        focusNode(searchHighlightedNodeId, 1.2, SEARCH_FOCUS_DURATION);
      }
    }
  }, [searchNavigateTrigger, searchHighlightedNodeId, nodes, focusNode]);

  // Expose focus method via ref if needed
  useEffect(() => {
    // Store focus function on the component for external access
    (FamilyTree2D as any).focusNode = focusNode;
  }, [focusNode]);

  // Handle background click
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || e.target === gRef.current) {
      interaction.handleBackgroundClick();
    }
  }, [interaction]);

  // Handle node click with proper selection & connect targeting
  const handleNodeClick = useCallback((node: Node2D) => {
    if (interaction.state.phase === 'targeting-connect') {
      const cand = candidacyFor(graphData, interaction.connectSourceId!, node.id);
      interaction.pickConnectTarget(node.id, cand);
      return;
    }
    interaction.selectNode(node.id);
  }, [interaction, graphData]);

  // Handle node double click for collapse toggle
  const handleNodeDoubleClick = useCallback((node: Node2D) => {
    const nodeId = node.id;
    if (!nodeId) return;

    const hasChildren = graphData.links.some(l => {
      const sId = getNodeId(l.source);
      return sId === nodeId && l.type === 'parent';
    });

    if (hasChildren) {
      if (onToggleCollapse) {
        onToggleCollapse(nodeId);
      } else {
        // Internal toggle if no parent provided
        onSetCollapsedNodes?.(new Set(collapsedNodes.has(nodeId)
          ? [...collapsedNodes].filter(id => id !== nodeId)
          : [...collapsedNodes, nodeId]
        ));
      }
    }

    onNodeDoubleClick?.(node as any);
  }, [graphData.links, onNodeDoubleClick, onToggleCollapse, onSetCollapsedNodes, collapsedNodes]);

  const isNodeEditable = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const node of nodes) {
      map.set(node.id, canEdit(node.id, userNodeId, isAdmin, confirmedLinks));
    }
    return map;
  }, [nodes, userNodeId, isAdmin, confirmedLinks]);

  const connectSourceNode = useMemo(() => {
    if (!interaction.connectSourceId) return null;
    return nodes.find(n => n.id === interaction.connectSourceId) ?? null;
  }, [nodes, interaction.connectSourceId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: activePreset ? presetBackground : emptyBackground }}>
      {/* Connect Mode HUD Top Banner */}
      {interaction.state.phase === 'targeting-connect' && connectSourceNode && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1450,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(168, 85, 247, 0.8)',
            borderRadius: '24px',
            padding: '8px 18px',
            color: '#e2e8f0',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
          }}
        >
          <span>
            🔗 Connect Mode: Select a relative to link with <strong style={{ color: '#c084fc' }}>{connectSourceNode.firstName}</strong>
            {interaction.rejectedTarget && (
              <span style={{ marginLeft: 8, color: '#f87171', fontSize: 11 }}>
                ({interaction.rejectedTarget.reason})
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              interaction.handleEscape();
            }}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '12px',
              padding: '3px 10px',
              color: '#fff',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Cancel (Esc)
          </button>
        </div>
      )}

      {!activePreset ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: 'text.primary',
          fontSize: '1rem',
          textAlign: 'center',
          padding: '24px',
          background: emptyBackground
        }}>
          <div style={{ maxWidth: '320px', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🌳</div>
            {isMobile ? (
              <>
                <div style={{ marginBottom: '12px', lineHeight: 1.5, color: 'rgba(255,255,255,0.9)' }}>
                  Select a family above to explore, or try the <strong>3D view</strong>.
                </div>
                {isMobileViewport && (
                  <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                    Visit on desktop for the full immersive experience.
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.9)' }}>Select a family above to view in 2D</div>
            )}
          </div>
        </div>
      ) : (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{
            cursor: connectSourceNode ? 'crosshair' : (isDragging ? 'grabbing' : 'grab'),
            touchAction: 'none',
          }}
          onClick={handleBackgroundClick}
        >
          {/* Define filters for shadow effects */}
          <defs>
            <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Transform group for zoom/pan */}
          <g
            ref={gRef}
            transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
            style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}
          >
            {/* Render links first (behind nodes) */}
            <OrthogonalLinks links={links} activePreset={activePreset} lifecycles={lifecycles} />

            {pendingLinkPreview &&
              (() => {
                const a = nodes.find((n) => n.id === pendingLinkPreview.anchorId);
                const b = nodes.find((n) => n.id === pendingLinkPreview.existingId);
                if (!a || !b) return null;
                const x1 = a.x + a.width / 2;
                const y1 = a.y + a.height / 2;
                const x2 = b.x + b.width / 2;
                const y2 = b.y + b.height / 2;
                return (
                  <line
                    key="pending-link-preview"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    opacity={0.95}
                    fill="none"
                    pointerEvents="none"
                  />
                );
              })()}

            {/* Render nodes */}
            {nodes.map(node => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={interaction.selectedNodeId === node.id || interaction.connectSourceId === node.id}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                activePreset={activePreset}
                isHighlighted={highlightedNodeId === node.id || interaction.connectSourceId === node.id || (interaction.state.phase === 'choosing-kinship' && interaction.state.targetNodeId === node.id)}
                isSearchHighlighted={searchHighlightedNodeId === node.id}
                canEdit={isNodeEditable.get(node.id) ?? (isAdmin ? true : false)}
                canDissolve={canDissolveNode?.(node.id) ?? false}
                onAddRelative={(n, relation) => interaction.startCreateRelative(n.id, relation)}
                onStartConnect={(n) => interaction.startConnect(n.id)}
                onStartDissolve={(n) => interaction.startDissolve(n.id)}
                onCancelDissolve={() => interaction.handleEscape()}
                lifecycles={lifecycles}
                isConfirmingDissolve={interaction.confirmingDissolveId === node.id}
                onConfirmDissolve={onConfirmDissolve}
              />
            ))}

            {/* Spawn and Dissolve, drawn from the lifecycle's own snapshot.
                Deliberately not from `nodes`: a Dissolve outlives the node it
                is dissolving — the Person leaves the Working Record when the
                change applies — and iterating the live list is what used to cut
                the animation off mid-flight (LIN-55). */}
            {lifecyclesOfKind(lifecycles.lifecycles, 'spawn').map((lifecycle) => (
              <NodeLifecycleFx
                key={lifecycle.key}
                lifecycle={lifecycle}
                lifecycles={lifecycles}
                nodes={nodes}
              />
            ))}
            {lifecyclesOfKind(lifecycles.lifecycles, 'dissolve').map((lifecycle) => (
              <NodeLifecycleFx
                key={lifecycle.key}
                lifecycle={lifecycle}
                lifecycles={lifecycles}
                nodes={nodes}
              />
            ))}

            {/* Transient Ghost Node */}
            {interaction.creatingRelative && (() => {
              const anchorNode = nodes.find(n => n.id === interaction.creatingRelative!.anchorNodeId);
              if (!anchorNode) return null;
              return (
                <GhostNode
                  anchorNode={anchorNode}
                  relation={interaction.creatingRelative.relation}
                  existingNodes={graphData?.nodes || []}
                  visibleIds={visibleIds}
                  connectedIds={ghostConnectedIds}
                  onSubmit={async (name) => {
                    if (onCreateRelative) {
                      await onCreateRelative({
                        firstName: name,
                        relation: interaction.creatingRelative!.relation,
                        targetNodeId: anchorNode.id,
                      });
                    }
                    interaction.handleEscape();
                  }}
                  onConnectExisting={async (existingId) => {
                    if (onConnectExistingRelative) {
                      await onConnectExistingRelative({
                        existingNodeId: existingId,
                        relation: interaction.creatingRelative!.relation,
                        targetNodeId: anchorNode.id,
                      });
                    }
                    interaction.handleEscape();
                  }}
                  onCancel={() => interaction.handleEscape()}
                />
              );
            })()}

            {/* InlineConnectPicker when a pair is chosen */}
            {interaction.state.phase === 'choosing-kinship' && (() => {
              const kinshipState = interaction.state;
              if (kinshipState.phase !== 'choosing-kinship') return null;
              const sourceNode = nodes.find(n => n.id === kinshipState.sourceNodeId);
              const targetNode = nodes.find(n => n.id === kinshipState.targetNodeId);
              if (!sourceNode || !targetNode) return null;
              return (
                <InlineConnectPicker
                  sourceNode={sourceNode}
                  targetNode={targetNode}
                  graphData={graphData}
                  isAdmin={isAdmin}
                  onConfirm={async (type, parentRole, parentIsSource) => {
                    const sourceId = type === 'parent' && parentIsSource === false ? targetNode.id : sourceNode.id;
                    const targetId = type === 'parent' && parentIsSource === false ? sourceNode.id : targetNode.id;
                    if (onDirectConnectNodes) {
                      await onDirectConnectNodes({
                        sourceNodeId: sourceId,
                        targetNodeId: targetId,
                        type,
                        parentRole,
                      });
                    }
                    interaction.selectNode(sourceId);
                  }}
                  onCancel={() => interaction.handleEscape()}
                />
              );
            })()}
          </g>

          {/* Zoom controls overlay */}
          <g style={{ pointerEvents: 'none' }}>
            <rect x="10" y="10" width="120" height="40" rx="8" fill="rgba(255,255,255,0.85)" />
            <text x="20" y="35" fill="#334155" fontSize={12}>
              Zoom: {(transform.k * 100).toFixed(0)}%
            </text>
          </g>
        </svg>
      )}

      {/* 2D Controls Overlay - Top Right */}
      <div style={{
        position: 'absolute',
        top: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 1300,
        alignItems: 'flex-end',
      }}>
        {/* Settings Toggle - First */}
        <Button
          variant="contained"
          onClick={() => setShowControls(!showControls)}
          sx={{ 
            minWidth: '140px',
            background: 'rgba(5, 5, 5, 0.7)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            color: 'primary.main',
            fontWeight: 700,
            letterSpacing: '0.05em',
            '&:hover': {
              background: 'rgba(5, 5, 5, 0.85)',
              borderColor: 'rgba(212, 175, 55, 0.4)',
            }
          }}
        >
          INSTRUMENTS {showControls ? '▴' : '▾'}
        </Button>

        <ExpandableSpring isOpen={showControls}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '220px',
            backgroundColor: 'rgba(5, 5, 5, 0.8)',
            backdropFilter: 'blur(24px)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            {userNodeId && (
              <Button 
                variant="contained" 
                fullWidth
                size="small" 
                onClick={handleFindMe}
                sx={{ 
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  fontWeight: 700,
                  letterSpacing: '0.05em'
                }}
              >
                FIND ME
              </Button>
            )}

            {isAdmin && onAdminAddPersonClick && (
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={onAdminAddPersonClick}
                sx={{ 
                  color: 'secondary.main', 
                  borderColor: 'secondary.main',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  '&:hover': { borderColor: 'secondary.light', background: 'rgba(124, 58, 237, 0.1)' }
                }}
              >
                + ADD PERSON
              </Button>
            )}

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant={mode === '3D' ? "contained" : "outlined"} 
                size="small" 
                onClick={() => onModeChange?.('3D')} 
                sx={{ flex: 1, fontSize: '0.7rem', fontWeight: 700 }}
              >
                3D
              </Button>
              <Button 
                variant={mode === '2D' ? "contained" : "outlined"} 
                size="small" 
                onClick={() => onModeChange?.('2D')} 
                sx={{ flex: 1, fontSize: '0.7rem', fontWeight: 700 }}
              >
                2D
              </Button>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.1em', mb: 1, display: 'block', fontSize: '0.6rem' }}>
                CHRONICLE THEME
              </Typography>
              <Select
                value={backgroundTheme}
                onChange={(e) => onBackgroundThemeChange?.(e.target.value as BackgroundTheme)}
                size="small"
                fullWidth
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  '& .MuiSelect-select': { py: 1, display: 'flex', alignItems: 'center', gap: 1 },
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                {(['deep-space', 'wax-white', 'smooth-sepia', 'baby-blue'] as const).map((t) => (
                  <MenuItem key={t} value={t} sx={{ fontSize: '0.75rem' }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '2px',
                        mr: 1,
                        backgroundColor: t === 'deep-space' ? '#050505' : t === 'wax-white' ? '#fffef8' : t === 'smooth-sepia' ? '#e8dcc8' : '#d4e8f7',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    />
                    {THEME_LABELS[t]}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {onSearchQueryChange && onSearchPrev && onSearchNext && onSearchClose && (
              <Box sx={{ 
                mt: 1, 
                p: 1.5, 
                backgroundColor: 'rgba(0, 0, 0, 0.3)', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.05)' 
              }}>
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.1em', mb: 1, display: 'block', fontSize: '0.6rem' }}>
                  SEARCH ARCHIVE
                </Typography>
                <TreeSearchBar
                  query={searchQuery}
                  onQueryChange={onSearchQueryChange}
                  matches={searchMatches}
                  currentIndex={searchIndex}
                  onPrev={onSearchPrev}
                  onNext={onSearchNext}
                  onClose={onSearchClose}
                  disabled={searchDisabled}
                  embedded
                  focusTrigger={searchOpenRequested}
                />
              </Box>
            )}

            <Button
              variant="outlined"
              color={collapsedNodes.size > 0 ? "primary" : "inherit"}
              size="small"
              fullWidth
              onClick={() => {
                if (collapsedNodes.size > 0) {
                  onSetCollapsedNodes?.(new Set());
                } else {
                  const parents = new Set<string>();
                  graphData?.links.forEach(l => {
                    if (l.type === 'parent') {
                      const sId = getNodeId(l.source);
                      parents.add(sId);
                    }
                  });
                  onSetCollapsedNodes?.(parents);
                }
              }}
              sx={{ mt: 1, fontSize: '0.65rem', fontWeight: 700, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {collapsedNodes.size > 0 ? 'EXPAND ALL' : 'COLLAPSE ALL'}
            </Button>
          </div>
        </ExpandableSpring>

        {/* Family Preset Selector - Below Settings */}
        {uniqueClusters.length > 0 && (
          <Box sx={{ width: '140px' }}>
            <Button
              variant="contained"
              onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
              sx={{ 
                width: '100%', 
                justifyContent: 'space-between',
                background: 'rgba(5, 5, 5, 0.7)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(212, 175, 55, 0.2)',
                color: 'white',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.05em'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activePreset || 'SELECT FAMILY'}
              </span>
              {isPresetMenuOpen ? '▴' : '▾'}
            </Button>

            <ExpandableSpring isOpen={isPresetMenuOpen}>
              <Box sx={{
                mt: 1,
                backgroundColor: 'rgba(5, 5, 5, 0.9)',
                backdropFilter: 'blur(24px)',
                borderRadius: '12px',
                border: '1px solid rgba(212, 175, 55, 0.2)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                width: '100%',
                overflow: 'hidden',
              }}>
                <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {uniqueClusters.map(cluster => (
                    <Button
                      key={cluster}
                      fullWidth
                      size="small"
                      onClick={() => {
                        onPresetSelect(cluster);
                        setIsPresetMenuOpen(false);
                      }}
                      sx={{
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        py: 1.5,
                        px: 2,
                        color: activePreset === cluster ? 'primary.main' : 'rgba(255,255,255,0.7)',
                        backgroundColor: activePreset === cluster ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                        '&:hover': { background: 'rgba(255,255,255,0.05)' }
                      }}
                    >
                      {cluster}
                      {activePreset === cluster && '✓'}
                    </Button>
                  ))}
                </Box>
              </Box>
            </ExpandableSpring>
          </Box>
        )}
      </div>
    </div>
  );
};

export default React.memo(FamilyTree2D);
