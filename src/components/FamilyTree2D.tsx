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
import { FamilyGraph, FamilyNode, Node2D, LayoutType } from '../types/graph';
import { calculateLayout, calculateBounds } from '../lib/layoutEngine';
import { NodeCard } from './NodeCard';
import { OrthogonalLinks } from './OrthogonalLinks';
import { getNodeId } from '../utils/getNodeId';
import { filterGraphData } from '../lib/filterGraphData';
import { TreeSearchBar } from './TreeSearchBar';
import type { BackgroundTheme } from '../hooks/useBackgroundTheme';

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
  activePreset?: string | null;
  selectedNodeId: string | null;
  onNodeSelect: (node: FamilyNode) => void;
  onNodeDoubleClick?: (node: FamilyNode) => void;
  onBackgroundClick?: () => void;
  collapsedNodes?: Set<string>;
  onToggleCollapse?: (nodeId: string) => void;
  onSetCollapsedNodes?: (nodes: Set<string>) => void;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  uniqueClusters: string[];
  onPresetSelect: (preset: string | null) => void;
  isMobile?: boolean;
  userNodeId?: string | null;
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
  activePreset,
  selectedNodeId,
  onNodeSelect,
  onNodeDoubleClick,
  onBackgroundClick,
  collapsedNodes = new Set(),
  onToggleCollapse,
  onSetCollapsedNodes,
  mode,
  onModeChange,
  uniqueClusters,
  onPresetSelect,
  isMobile = false,
  userNodeId = null,
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
}) => {
  const presetBackground = getBackgroundForTheme(backgroundTheme);
  const emptyBackground = getBackgroundForTheme(backgroundTheme);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pendingFindMeRef = useRef<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
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

  // Center view when data changes significantly
  useEffect(() => {
    if (!svgRef.current || !bounds || nodes.length === 0) return;

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
      select(svgRef.current)
        .call(zoomBehaviorRef.current.transform as any, initialTransform);
    }
  }, [bounds, nodes.length === 0]); // Only re-center on initial load or empty state

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && nodes.length > 0) {
        e.preventDefault();

        const currentIndex = selectedNodeId
          ? nodes.findIndex(n => n.id === selectedNodeId)
          : -1;

        const nextIndex = e.shiftKey
          ? currentIndex <= 0 ? nodes.length - 1 : currentIndex - 1
          : (currentIndex + 1) % nodes.length;

        const nextNode = nodes[nextIndex];
        onNodeSelect(nextNode);

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
        onBackgroundClick?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, selectedNodeId, onNodeSelect, onBackgroundClick, transform.k]);

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
      onBackgroundClick?.();
    }
  }, [onBackgroundClick]);

  // Handle node click with proper selection
  const handleNodeClick = useCallback((node: Node2D) => {
    onNodeSelect(node);
  }, [onNodeSelect]);

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: activePreset ? presetBackground : emptyBackground }}>
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
            background: activePreset ? presetBackground : emptyBackground,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onClick={handleBackgroundClick}
        >
          {/* Define filters for shadow effects */}
          <defs>
            <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Transform group for zoom/pan */}
          <g
            ref={gRef}
            transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
          >
            {/* Render links first (behind nodes) */}
            <OrthogonalLinks links={links} activePreset={activePreset} />

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
                isSelected={selectedNodeId === node.id}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                activePreset={activePreset}
                isHighlighted={highlightedNodeId === node.id}
                isSearchHighlighted={searchHighlightedNodeId === node.id}
              />
            ))}
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
