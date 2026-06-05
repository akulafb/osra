import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useSpring, animated } from 'react-spring';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { FamilyGraph, FamilyNode } from '../types/graph';
import { useAuth } from '../contexts/AuthContext';
import { createStarfield, type NebulaData } from '../utils/starfield';
import { isMobile } from '../utils/device';
import type { BackgroundTheme } from '../hooks/useBackgroundTheme';
import { getTexturePath } from '../utils/imageFormat';
import { getClusterColors } from '../utils/familyColors';
import { getNodeId } from '../utils/getNodeId';
import { filterGraphDataFor3D } from '../lib/filterGraphData';
import { TreeSearchBar } from './TreeSearchBar';

// V3 Shared Assets - paths resolved at runtime for WebP when supported
const planetTexturePaths = [
  '/planet-textures/earth.jpg',
  '/planet-textures/jupiter.jpg',
  '/planet-textures/mars.jpg',
  '/planet-textures/mercury.jpg',
  '/planet-textures/neptune.jpg',
  '/planet-textures/saturn.jpg',
  '/planet-textures/uranus.jpg',
  '/planet-textures/venus.jpg',
  '/planet-textures/sun.jpg',
  '/planet-textures/Moon Texture.jpg',
  '/planet-textures/Ceres Fictional Texture.jpg',
  '/planet-textures/Eris Fictional Texture.jpg',
  '/planet-textures/Haumea Texture.jpg',
  '/planet-textures/Makemake Texture.jpg',
  '/planet-textures/Gemini Fictional.png',
];

const textureLoader = new THREE.TextureLoader();
const planetMaterialCache = new Map<string, THREE.Material>();

/** Synthetic link while Add Relative “connect to existing” preview is active; removed after success + refetch. */
function isPreviewLink(l: { type?: string }): boolean {
  return l.type === 'preview';
}

const THEME_COLORS_3D: Record<Exclude<BackgroundTheme, 'deep-space'>, number> = {
  'wax-white': 0xfffef8,
  'smooth-sepia': 0xe8dcc8,
  'baby-blue': 0xd4e8f7,
};

const THEME_LABELS: Record<BackgroundTheme, string> = {
  'deep-space': 'Deep Space',
  'wax-white': 'Wax White',
  'smooth-sepia': 'Smooth Sepia',
  'baby-blue': 'Baby Blue',
};

const getPlanetMaterial = (nodeId: string, isMobileDevice: boolean = false) => {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = nodeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const rawPath = planetTexturePaths[Math.abs(hash) % planetTexturePaths.length];
  const texturePath = isMobileDevice ? getTexturePath(rawPath) : rawPath;

  if (!planetMaterialCache.has(texturePath)) {
    const texture = textureLoader.load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Use Standard instead of Physical on mobile for performance
    if (isMobileDevice) {
      planetMaterialCache.set(texturePath, new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.FrontSide
      }));
    } else {
      planetMaterialCache.set(texturePath, new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.1,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        transmission: 0,
        thickness: 0,
        side: THREE.FrontSide
      }));
    }
  }
  return planetMaterialCache.get(texturePath)!;
};

const materialCache = new Map<string, THREE.Material>();
const getMaterial = (color: string, isMobileDevice: boolean = false) => {
  if (!materialCache.has(color)) {
    if (isMobileDevice) {
      materialCache.set(color, new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide
      }));
    } else {
      materialCache.set(color, new THREE.MeshPhysicalMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        roughness: 0.8,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.3,
        thickness: 2,
        side: THREE.DoubleSide
      }));
    }
  }
  return materialCache.get(color)!;
};

function SettingsPanelSpring({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const spring = useSpring({
    maxHeight: isOpen ? 800 : 0,
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });
  return (
    <animated.div style={{ ...spring, overflow: 'hidden' }}>
      {children}
    </animated.div>
  );
}

function TextureMenuSpring({
  isOpen,
  children,
  maxHeightOpen = 200,
}: {
  isOpen: boolean;
  children: React.ReactNode;
  maxHeightOpen?: number;
}) {
  const spring = useSpring({
    maxHeight: isOpen ? maxHeightOpen : 0,
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });
  return (
    <animated.div style={{ ...spring, overflow: 'hidden' }}>
      {children}
    </animated.div>
  );
}

// Props interface for the refactored component
interface FamilyTree3DProps {
  graphData: FamilyGraph;
  selectedNode: FamilyNode | null;
  onNodeSelect: (node: FamilyNode) => void;
  onBackgroundClick?: () => void;
  collapsedNodes?: Set<string>;
  onToggleCollapse?: (nodeId: string) => void;
  onSetCollapsedNodes?: (nodes: Set<string>) => void;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  isAddModalOpen?: boolean;
  isEditModalOpen?: boolean;
  isBulkInviteOpen?: boolean;
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
  /** 3D-only: which paternal family clusters are visible in the force graph */
  visibleClusters3D: Set<string>;
  onVisibleClusters3DChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  uniqueClusters: string[];
  onEnsureClusterVisible3D: (cluster: string) => void;
  /** Optional "See who's new!" control; rendered above NAV CONTROLS, same column */
  seeWhosNewButtonSlot?: React.ReactNode;
  /** Dashed preview edge while Add Relative connect-to-existing is focused */
  pendingLinkPreview?: { anchorId: string; existingId: string } | null;
  /** Admin: add standalone person (opens modal in parent) */
  isAdmin?: boolean;
  onAdminAddPersonClick?: () => void;
}

export const FamilyTree3DContent: React.FC<FamilyTree3DProps> = ({
  graphData,
  selectedNode,
  onNodeSelect,
  onBackgroundClick,
  collapsedNodes: externalCollapsedNodes,
  onToggleCollapse: externalToggleCollapse,
  onSetCollapsedNodes: externalSetCollapsedNodes,
  mode,
  onModeChange,
  isAddModalOpen = false,
  isEditModalOpen = false,
  isBulkInviteOpen = false,
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
  visibleClusters3D,
  onVisibleClusters3DChange,
  uniqueClusters,
  onEnsureClusterVisible3D,
  seeWhosNewButtonSlot,
  pendingLinkPreview = null,
  isAdmin = false,
  onAdminAddPersonClick,
}) => {
  const ForceGraph3DAny = ForceGraph3D as unknown as React.ComponentType<any>;
  const { userProfile } = useAuth();

  const geometries = useMemo(() => {
    const isMob = isMobile();
    // Reduce segments on mobile to save memory and draw calls
    const segments = isMob ? 8 : 16;
    const auraSegments = isMob ? 8 : 12;
    
    return {
      sphere: new THREE.SphereGeometry(10, segments, segments),
      aura: new THREE.SphereGeometry(18, auraSegments, auraSegments),
      glow: new THREE.SphereGeometry(22, auraSegments, auraSegments)
    };
  }, []);

  const fgRef = useRef<any>();
  const graphDataRef = useRef(graphData);
  graphDataRef.current = graphData;
  const starfieldRef = useRef<THREE.Group | null>(null);
  const nebulaeRef = useRef<NebulaData[]>([]);
  const envInitializedRef = useRef(false);
  const hasIntroPlayed = useRef(false);
  const rotationRef = useRef(0);

  // Internal state for modals
  const [initialCameraPos, setInitialCameraPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [isSimulationLoading, setIsSimulationLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    if (activePreset && !visibleClusters3D.has(activePreset)) {
      setActivePreset(null);
      fgRef.current?.d3ReheatSimulation?.();
    }
  }, [activePreset, visibleClusters3D]);

  // V3 Features: Toggles
  const [showNames, setShowNames] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [nodeTexture, setNodeTexture] = useState<'spheres' | 'planets' | 'none'>('spheres');
  const [showArrows, setShowArrows] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef<HTMLDivElement>(null);
  const textureRef = useRef<HTMLDivElement>(null);
  const [isTextureMenuOpen, setIsTextureMenuOpen] = useState(false);
  const [isAmbienceOn, setIsAmbienceOn] = useState(false);
  const [isStarfieldLoading, setIsStarfieldLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showNavControls, setShowNavControls] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(
    () => typeof window !== 'undefined' && isMobile()
  );

  useEffect(() => {
    const update = () => {
      const mob = isMobile();
      setIsMobileDevice(mob);
      if (mob) setShowNavControls(false);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Navigation state for WASD/Mouse Steering
  const [isSteeringActive, setIsSteeringActive] = useState(false);
  const keysPressed = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0 });
  const isMouseInWindow = useRef(true);

  // Audio controller
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audio/Cosmic Ambience Sound Effect.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0.25;
    }

    const playAudio = () => {
      if (isAmbienceOn && audioRef.current) {
        audioRef.current.play().catch(err => {
          console.warn('[Ambience] Autoplay blocked:', err);
        });
      }
    };

    if (isAmbienceOn) {
      playAudio();
      window.addEventListener('click', playAudio, { once: true });
    } else {
      audioRef.current?.pause();
    }

    return () => {
      audioRef.current?.pause();
      window.removeEventListener('click', playAudio);
    };
  }, [isAmbienceOn]);

  // Use external collapsed nodes if provided
  const effectiveCollapsedNodes = externalCollapsedNodes || new Set();
  const effectiveSetCollapsedNodes = externalSetCollapsedNodes || (() => {});
  const effectiveToggleCollapse = externalToggleCollapse || (() => {});

  const filteredGraphData = useMemo(() => {
    try {
      if (!graphData) return { nodes: [], links: [] };

      const filtered = filterGraphDataFor3D(
        graphData,
        effectiveCollapsedNodes,
        visibleClusters3D,
        uniqueClusters
      );

      if (pendingLinkPreview) {
        const { anchorId, existingId } = pendingLinkPreview;
        const anchorVisible = filtered.nodes.some(n => n.id === anchorId);
        const existingVisible = filtered.nodes.some(n => n.id === existingId);
        if (anchorVisible && existingVisible) {
          return {
            ...filtered,
            links: [
              ...filtered.links,
              { source: anchorId, target: existingId, type: 'preview' },
            ],
          };
        }
      }

      return filtered;
    } catch (err) {
      console.error('[FamilyTree3D] Error filtering graph data:', err);
      return { nodes: [], links: [] };
    }
  }, [graphData, effectiveCollapsedNodes, visibleClusters3D, uniqueClusters, pendingLinkPreview]);

  // three-forcegraph multiplies linkOpacity as a number (arrows use state.linkOpacity * 3).
  // Per-link visibility must use linkVisibility, not a function passed to linkOpacity.
  const linkVisibility = useCallback((l: any) => {
    if (isPreviewLink(l)) return true;
    if (l.type === 'parent') return showLinks || showArrows;
    return showLinks;
  }, [showLinks, showArrows]);

  const linkMaterial = useCallback((l: any) => {
    if (isPreviewLink(l)) {
      return new THREE.MeshLambertMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 1,
      });
    }
    return undefined;
  }, []);

  // Focus Logic (duration in ms; search navigation uses 2x for slower travel)
  const FOCUS_DURATION = 1665;
  const SEARCH_FOCUS_DURATION = 3330;

  const handleNodeClick = useCallback((node: FamilyNode, durationMs = FOCUS_DURATION) => {
    if (!fgRef.current) return;
    
    const nodeData = node as any;
    onNodeSelect(node);
    
    const x = (typeof nodeData.x === 'number' && !isNaN(nodeData.x)) ? nodeData.x : 0;
    const y = (typeof nodeData.y === 'number' && !isNaN(nodeData.y)) ? nodeData.y : 0;
    const z = (typeof nodeData.z === 'number' && !isNaN(nodeData.z)) ? nodeData.z : 0;
    
    const nodePos = { x, y, z };
    const distance = 120;
    
    const camera = fgRef.current.camera();
    const currentPos = camera.position;
    
    let direction = new THREE.Vector3(currentPos.x - x, currentPos.y - y, currentPos.z - z);
    if (isNaN(direction.x) || isNaN(direction.y) || isNaN(direction.z) || direction.lengthSq() < 0.0001) {
      direction.set(0, 0, 1);
    } else {
      direction.normalize();
    }
    
    const targetPos = {
      x: x + direction.x * distance,
      y: y + direction.y * distance,
      z: z + direction.z * distance
    };
    const controls = fgRef.current.controls();

    if (!controls) return;
    const focusDuration = typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? durationMs
      : FOCUS_DURATION;
    const startTime = Date.now();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const endTarget = new THREE.Vector3(nodePos.x, nodePos.y, nodePos.z);

    const animate = () => {
      if (!fgRef.current) return;
      const cam = fgRef.current.camera();
      const ctrl = fgRef.current.controls();
      if (!cam || !ctrl) return;

      const progress = Math.min((Date.now() - startTime) / focusDuration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      cam.position.lerpVectors(startPos, endPos, eased);
      ctrl.target.lerpVectors(startTarget, endTarget, eased);
      cam.lookAt(ctrl.target);
      cam.updateProjectionMatrix();

      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }, [onNodeSelect]);

  // Reset View functionality
  const resetView = useCallback(() => {
    if (!fgRef.current || !initialCameraPos || !graphData) return;
    
    // Clear all fixed positions
    graphData.nodes.forEach((node: any) => {
      node.fx = undefined;
      node.fy = undefined;
      node.fz = undefined;
    });
    fgRef.current.d3ReheatSimulation();

    const camera = fgRef.current.camera();
    const controls = fgRef.current.controls();
    if (!camera || !controls) return;
    
    setActivePreset(null);
    onBackgroundClick?.();

    const duration = 1500;
    const startTime = Date.now();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    const animate = () => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      camera.position.lerpVectors(
        startPos, 
        new THREE.Vector3(initialCameraPos.x, initialCameraPos.y, initialCameraPos.z), 
        eased
      );
      
      controls.target.lerpVectors(
        startTarget, 
        new THREE.Vector3(0, 0, 0), 
        eased
      );
      
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }, [initialCameraPos, graphData, onBackgroundClick]);

  // Preset Focus Logic
  const focusNodeById = useCallback((nodeId: string, durationMs = FOCUS_DURATION) => {
    const node = graphData?.nodes?.find(n => n.id === nodeId);
    if (node) handleNodeClick(node, durationMs);
  }, [graphData, handleNodeClick]);

  const calculateGenerationLevels = useCallback((clusterName: string) => {
    if (!graphData) return new Map<string, number>();

    const nodesInCluster = graphData.nodes.filter(n => n.familyCluster === clusterName);
    const clusterNodeIds = new Set(nodesInCluster.map(n => n.id));
    
    const getSafeId = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && val.id) return val.id;
      return null;
    };

    const roots = nodesInCluster.filter(node => {
      const hasParentInCluster = graphData.links.some(link => {
        const s = getSafeId(link.source);
        const t = getSafeId(link.target);
        return t === node.id && link.type === 'parent' && clusterNodeIds.has(s || '');
      });
      return !hasParentInCluster;
    });

    const levels = new Map<string, number>();
    const queue: { id: string; level: number }[] = [];

    roots.forEach(r => {
      levels.set(r.id, 0);
      queue.push({ id: r.id, level: 0 });
    });

    let head = 0;
    while (head < queue.length) {
      const { id, level } = queue[head++];

      graphData.links.forEach(link => {
        const s = getSafeId(link.source);
        const t = getSafeId(link.target);

        if (s === id && t && clusterNodeIds.has(t)) {
          if (!levels.has(t)) {
            const nextLevel = link.type === 'parent' ? level + 1 : level;
            levels.set(t, nextLevel);
            queue.push({ id: t, level: nextLevel });
          }
        } else if (t === id && s && clusterNodeIds.has(s)) {
          if (!levels.has(s)) {
            const nextLevel = (link.type === 'marriage' || link.type === 'divorce') ? level : level - 1;
            if (link.type === 'marriage' || link.type === 'divorce') {
              levels.set(s, nextLevel);
              queue.push({ id: s, level: nextLevel });
            }
          }
        }
      });
    }
    
    nodesInCluster.forEach(n => {
      if (!levels.has(n.id)) levels.set(n.id, 0);
    });

    return levels;
  }, [graphData]);

  const applyPreset = useCallback((clusterName: string | null | 'me') => {
    setIsPresetsOpen(false);
    if (!fgRef.current || !graphData) return;

    if (!clusterName) {
      resetView();
      return;
    }

    if (clusterName === 'me') {
      if (userProfile?.node_id) {
        const meNode = graphData.nodes.find((n) => n.id === userProfile.node_id);
        const c = meNode?.familyCluster || meNode?.maternalFamilyCluster;
        if (c) onEnsureClusterVisible3D(c);
        focusNodeById(userProfile.node_id);
      }
      return;
    }

    onEnsureClusterVisible3D(clusterName);
    setActivePreset(clusterName);
    const levels = calculateGenerationLevels(clusterName);
    const generationHeight = 250; // Increased for better vertical clarity
    const horizontalSpread = 220; // Increased slightly from 180 for better legibility

    const nodesInCluster = graphData.nodes.filter(n => n.familyCluster === clusterName);
    const clusterNodeIds = new Set(nodesInCluster.map(n => n.id));

    // 1. Build adjacency list for children in this cluster
    const childrenMap = new Map<string, string[]>();
    graphData.links.forEach(link => {
      if (link.type === 'parent') {
        const s = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const t = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (clusterNodeIds.has(s) && clusterNodeIds.has(t)) {
          const list = childrenMap.get(s) || [];
          list.push(t);
          childrenMap.set(s, list);
        }
      }
    });

    // 2. Calculate subtree widths (number of leaf nodes in the subtree)
    const subtreeWidths = new Map<string, number>();
    const getSubtreeWidth = (id: string): number => {
      const children = childrenMap.get(id) || [];
      if (children.length === 0) {
        subtreeWidths.set(id, 1);
        return 1;
      }
      const width = children.reduce((sum, childId) => sum + getSubtreeWidth(childId), 0);
      subtreeWidths.set(id, width);
      return width;
    };

    // 3. Find roots (nodes with no parents in the cluster)
    const roots = nodesInCluster.filter(node => {
      const hasParentInCluster = graphData.links.some(link => {
        const t = typeof link.target === 'object' ? (link.target as any).id : link.target;
        const s = typeof link.source === 'object' ? (link.source as any).id : link.source;
        return t === node.id && link.type === 'parent' && clusterNodeIds.has(s);
      });
      return !hasParentInCluster;
    });

    // Calculate total width for the entire cluster
    let totalClusterWidth = 0;
    roots.forEach(root => {
      totalClusterWidth += getSubtreeWidth(root.id);
    });

    // 4. Recursive positioning: children are centered under their parent's territory
    const positionNode = (id: string, leftX: number, width: number, level: number) => {
      const node = graphData.nodes.find(n => n.id === id);
      if (!node) return;

      const centerX = leftX + (width * horizontalSpread) / 2;
      const centerY = level * generationHeight;

      (node as any).fx = centerX;
      (node as any).fy = centerY;
      (node as any).fz = 0;
      (node as any).x = centerX;
      (node as any).y = centerY;
      (node as any).z = 0;

      const children = childrenMap.get(id) || [];
      let currentLeft = leftX;
      children.forEach(childId => {
        const childWidth = subtreeWidths.get(childId) || 1;
        positionNode(childId, currentLeft, childWidth, level + 1);
        currentLeft += childWidth * horizontalSpread;
      });
    };

    // Position roots evenly
    let currentRootLeft = -(totalClusterWidth * horizontalSpread) / 2;
    roots.forEach(root => {
      const rootWidth = subtreeWidths.get(root.id) || 1;
      positionNode(root.id, currentRootLeft, rootWidth, levels.get(root.id) || 0);
      currentRootLeft += rootWidth * horizontalSpread;
    });

    // Push non-cluster nodes back, but stagger those connected to the cluster (including their local branches)
    const processedNonClusterNodes = new Set<string>();
    
    // 1. Identify "bridge nodes" - non-cluster nodes directly connected to the active cluster
    const bridgeNodes: { node: any, anchorNode: any }[] = [];
    graphData.nodes.forEach((node: any) => {
      if (node.familyCluster !== clusterName) {
        const connection = graphData.links.find(l => {
          const sId = getNodeId(l.source);
          const tId = getNodeId(l.target);
          if (sId === node.id && clusterNodeIds.has(tId)) return true;
          if (tId === node.id && clusterNodeIds.has(sId)) return true;
          return false;
        });

        if (connection) {
          const anchorId = clusterNodeIds.has(getNodeId(connection.source)) 
            ? getNodeId(connection.source) 
            : getNodeId(connection.target);
          const anchorNode = graphData.nodes.find(n => n.id === anchorId) as any;
          if (anchorNode && typeof anchorNode.fx === 'number') {
            bridgeNodes.push({ node, anchorNode });
          }
        }
      }
    });

    // 2. For each bridge node, find its local branch of other non-cluster nodes and position them together
    const anchorCounters = new Map<string, number>();
    
    bridgeNodes.forEach(({ node, anchorNode }) => {
      if (processedNonClusterNodes.has(node.id)) return;

      // BFS to find the connected local branch of non-cluster nodes
      const localBranch: any[] = [];
      const queue = [node.id];
      const visitedInBFS = new Set<string>([node.id]);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentNode = graphData.nodes.find(n => n.id === currentId);
        if (currentNode) localBranch.push(currentNode);
        processedNonClusterNodes.add(currentId);

        graphData.links.forEach(l => {
          const sId = getNodeId(l.source);
          const tId = getNodeId(l.target);
          let neighborId = null;
          if (sId === currentId) neighborId = tId;
          else if (tId === currentId) neighborId = sId;

          if (neighborId && !visitedInBFS.has(neighborId)) {
            const neighborNode = graphData.nodes.find(n => n.id === neighborId);
            // Only traverse into other non-cluster nodes
            if (neighborNode && neighborNode.familyCluster !== clusterName) {
              visitedInBFS.add(neighborId);
              queue.push(neighborId);
            }
          }
        });
      }

      // Position the entire local branch behind the anchor
      const anchorId = anchorNode.id;
      localBranch.forEach((branchNode, index) => {
        const count = (anchorCounters.get(anchorId) || 0) + 1;
        anchorCounters.set(anchorId, count);

        // All nodes in this branch share the anchor's X/Y region
        // but are spread out slightly in X/Y and staggered in Z
        const staggerZ = -300 - (count * 200);
        // Add a small spiral/circular spread in X/Y so they aren't perfectly linear
        const angle = index * 0.5;
        const radius = 40 + (index * 15);
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;

        branchNode.fx = anchorNode.fx + offsetX;
        branchNode.fy = anchorNode.fy + offsetY;
        branchNode.fz = staggerZ;
        branchNode.x = anchorNode.fx + offsetX;
        branchNode.y = anchorNode.fy + offsetY;
        branchNode.z = staggerZ;
      });
    });

    // 3. Default background position for any remaining unconnected non-cluster nodes
    graphData.nodes.forEach((node: any) => {
      if (node.familyCluster !== clusterName && !processedNonClusterNodes.has(node.id)) {
        const safeX = (typeof node.x === 'number' && !isNaN(node.x)) ? node.x : (Math.random() - 0.5) * 2000;
        const safeY = (typeof node.y === 'number' && !isNaN(node.y)) ? node.y : (Math.random() - 0.5) * 2000;
        node.fx = safeX;
        node.fy = safeY;
        node.fz = -1500; // Push even further back
        node.x = safeX;
        node.y = safeY;
        node.z = -1500;
      }
    });

    fgRef.current.d3ReheatSimulation();

    // Find a good representative for the cluster (first node in cluster)
    const rep = graphData.nodes.find(n => n.familyCluster === clusterName);
    
    if (rep) focusNodeById(rep.id);
  }, [
    graphData,
    calculateGenerationLevels,
    resetView,
    focusNodeById,
    userProfile,
    onEnsureClusterVisible3D,
  ]);

  // Navigation Flight Loop (WASD + Mouse Steering)
  useEffect(() => {
    let frameId: number;
    const baseSpeed = 1.2;
    const boostMultiplier = 4.0;
    const turnSpeed = 0.012;
    const deadzone = 0.15;

    const update = () => {
      // Allow WASD/steering while Add Relative is open (preview); block only when typing in a field.
      if (fgRef.current &&
          !isEditModalOpen && !isBulkInviteOpen &&
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA') {
        
        const camera = fgRef.current.camera();
        const controls = fgRef.current.controls();
        
        if (camera && controls) {
          // 1. Steering (Mouse Look)
          if (isSteeringActive && isMouseInWindow.current) {
            const dx = mousePos.current.x;
            const dy = mousePos.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > deadzone) {
              const normalizedDist = (dist - deadzone) / (1 - deadzone);
              const factor = Math.pow(normalizedDist, 4) * turnSpeed;
              const yaw = -dx * factor;
              const pitch = dy * factor;
              
              const direction = new THREE.Vector3().subVectors(controls.target, camera.position);
              const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
              const upProj = direction.clone().normalize().dot(camera.up);
              const canPitch = (pitch > 0 && upProj < 0.92) || (pitch < 0 && upProj > -0.92);

              direction.applyAxisAngle(camera.up, yaw);
              if (canPitch) direction.applyAxisAngle(right, pitch);
              controls.target.addVectors(camera.position, direction);
            }
          }

          // 3. Keyboard Roll (Q/E)
          let kbRoll = 0;
          if (keysPressed.current['q']) kbRoll -= turnSpeed;
          if (keysPressed.current['e']) kbRoll += turnSpeed;

          if (kbRoll !== 0) {
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            camera.up.applyAxisAngle(forward, kbRoll);
          }

          // 2. Thrust/Strafe (WASD)
          const moveSpeed = keysPressed.current['shift'] ? baseSpeed * boostMultiplier : baseSpeed;
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
          const moveVec = new THREE.Vector3(0, 0, 0);

          if (keysPressed.current['w'] || keysPressed.current['arrowup']) moveVec.add(forward);
          if (keysPressed.current['s'] || keysPressed.current['arrowdown']) moveVec.add(forward.clone().negate());
          if (keysPressed.current['a'] || keysPressed.current['arrowleft']) moveVec.add(right.clone().negate());
          if (keysPressed.current['d'] || keysPressed.current['arrowright']) moveVec.add(right);

          if (moveVec.lengthSq() > 0) {
            moveVec.normalize().multiplyScalar(moveSpeed);
            camera.position.add(moveVec);
            controls.target.add(moveVec);
          }
          
          controls.update();
          camera.updateProjectionMatrix();
        }
      }
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isEditModalOpen, isBulkInviteOpen, isSteeringActive]);

  // Event Listeners for Navigation
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current[key] = true;
      
      // Prevent navigation shortcuts when typing
      if (isAddModalOpen || isEditModalOpen || isBulkInviteOpen || 
          document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (key === 'r') {
        setIsSteeringActive(prev => !prev);
      } else       if (key === 'tab') {
        e.preventDefault();
        const cycleNodes = filteredGraphData.nodes;
        if (cycleNodes.length) {
          const idx = selectedNode ? cycleNodes.findIndex(n => n.id === selectedNode.id) : -1;
          const next = e.shiftKey
            ? (idx <= 0 ? cycleNodes.length - 1 : idx - 1)
            : (idx + 1) % cycleNodes.length;
          handleNodeClick(cycleNodes[next]);
        }
      } else if (key === 'enter' || key === ' ') {
        if (selectedNode) {
          e.preventDefault();
          handleNodeClick(selectedNode);
        }
      } else if (key === 'escape') {
        if (selectedNode) {
          e.preventDefault();
          onBackgroundClick?.();
        }
      }
    };

    const onUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    const onMove = (e: MouseEvent) => {
      mousePos.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1)
      };
    };

    const onOut = () => { isMouseInWindow.current = false; };
    const onIn = () => { isMouseInWindow.current = true; };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onOut);
    window.addEventListener('mouseenter', onIn);
    
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onOut);
      window.removeEventListener('mouseenter', onIn);
    };
  }, [
    graphData,
    filteredGraphData.nodes,
    selectedNode,
    handleNodeClick,
    isAddModalOpen,
    isEditModalOpen,
    isBulkInviteOpen,
  ]);

  // Node UI
  const nodeThreeObject = useCallback((node: FamilyNode) => {
    try {
      const isMob = isMobile();
      const isSelected = selectedNode?.id === node.id;
      const colors = getClusterColors(node.familyCluster);
      const color = colors.border;
      const group = new THREE.Group();

      if (nodeTexture !== 'none') {
        const material = nodeTexture === 'planets' ? getPlanetMaterial(node.id, isMob) : getMaterial(color, isMob);
        const sphere = new THREE.Mesh(geometries.sphere, material);
        group.add(sphere);

        // Slow down rotation on mobile to save CPU
        const speedFactor = (isMob ? 0.2 : 0.5) + Math.random() * 0.5;
        sphere.onBeforeRender = () => {
          const rot = rotationRef.current * speedFactor;
          sphere.rotation.y = rot;
          sphere.rotation.z = rot * 0.5;
        };

        if (isSelected) {
          const aura = new THREE.Mesh(geometries.aura, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, wireframe: true }));
          const glow = new THREE.Mesh(geometries.glow, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05 }));
          group.add(aura);
          group.add(glow);
        }
        if (searchHighlightedNodeId === node.id) {
          const searchGlow = new THREE.Mesh(geometries.glow, new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.55 }));
          group.add(searchGlow);
        }
      }

      if (showNames) {
        const first = (node.firstName ?? '').trim();
        const cluster = (node.familyCluster ?? '').trim();
        let displayName = first || 'Unknown';
        if (cluster) {
          displayName = `${first || '?'}\n${cluster}`;
        }
        if (node.isClaimed) {
          displayName += ' ✓';
        }

        const sprite = new SpriteText(displayName);
        sprite.color = '#ffffff';
        // Smaller text on mobile
        sprite.textHeight = isMob ? 3.5 : 4;
        sprite.fontWeight = 'bold';
        sprite.position.set(0, 0, 0);
        sprite.renderOrder = 999;
        sprite.material.depthTest = false;
        group.add(sprite);
      }

      return group;
    } catch (err) {
      console.error('[FamilyTree3D] Error in nodeThreeObject:', err);
      return new THREE.Group();
    }
  }, [selectedNode, showNames, nodeTexture, geometries, rotationRef, searchHighlightedNodeId]);

  useEffect(() => {
    if (fgRef.current?.refresh) fgRef.current.refresh();
  }, [nodeTexture, selectedNode?.id, searchHighlightedNodeId, pendingLinkPreview?.anchorId, pendingLinkPreview?.existingId, showArrows, showLinks]);

  // Preview pair framing: one shot after layout; deps = endpoint ids only (no simulation churn).
  useEffect(() => {
    if (!pendingLinkPreview || !fgRef.current) return;
    const { anchorId, existingId } = pendingLinkPreview;
    const run = () => {
      const fg = fgRef.current;
      if (!fg) return;
      const gd = graphDataRef.current;
      if (!gd?.nodes?.length) return;
      const na = gd.nodes.find((n) => n.id === anchorId);
      const nb = gd.nodes.find((n) => n.id === existingId);
      if (!na || !nb) return;

      const read = (n: FamilyNode & { x?: number; y?: number; z?: number }) => ({
        x: typeof n.x === 'number' && !isNaN(n.x) ? n.x : 0,
        y: typeof n.y === 'number' && !isNaN(n.y) ? n.y : 0,
        z: typeof n.z === 'number' && !isNaN(n.z) ? n.z : 0,
      });
      const pa = read(na);
      const pb = read(nb);
      const mid = new THREE.Vector3((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
      const edge = new THREE.Vector3(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
      const len = edge.length();
      if (len > 1e-6) edge.normalize();
      else edge.set(0, 0, 1);

      const worldUp = new THREE.Vector3(0, 1, 0);
      let perp = new THREE.Vector3().crossVectors(edge, worldUp);
      if (perp.lengthSq() < 1e-6) {
        perp = new THREE.Vector3().crossVectors(edge, new THREE.Vector3(1, 0, 0));
      }
      perp.normalize();
      const viewDir = new THREE.Vector3()
        .addVectors(perp, edge.clone().multiplyScalar(-0.35))
        .normalize();

      const camera = fg.camera();
      const controls = fg.controls();
      if (!camera || !controls) return;

      const fovRad = (camera.fov * Math.PI) / 180;
      const aspect = camera.aspect || 1;
      const margin = 48;
      const halfChord = len / 2 + margin;
      const distH = halfChord / Math.tan(fovRad / 2);
      const distV = halfChord / (Math.tan(fovRad / 2) * aspect);
      let dist = Math.max(distH, distV) * 0.65;
      dist = Math.max(88, Math.min(dist, 380));

      const camPos = mid.clone().add(viewDir.clone().multiplyScalar(dist));
      const duration = 580;
      const startTime = Date.now();
      const startCam = camera.position.clone();
      const startTarget = controls.target.clone();
      const endTarget = mid.clone();

      const animate = () => {
        if (!fgRef.current) return;
        const cam = fgRef.current.camera();
        const ctrl = fgRef.current.controls();
        if (!cam || !ctrl) return;
        const t = Math.min((Date.now() - startTime) / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        cam.position.lerpVectors(startCam, camPos, eased);
        ctrl.target.lerpVectors(startTarget, endTarget, eased);
        cam.lookAt(ctrl.target);
        cam.updateProjectionMatrix();
        if (t < 1) requestAnimationFrame(animate);
      };
      animate();
    };
    const t = window.setTimeout(run, 520);
    return () => clearTimeout(t);
  }, [pendingLinkPreview?.anchorId, pendingLinkPreview?.existingId]);

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
      if (searchHighlightedNodeId) {
        focusNodeById(searchHighlightedNodeId, SEARCH_FOCUS_DURATION);
      }
    }
  }, [searchNavigateTrigger, searchHighlightedNodeId, focusNodeById]);

  const linkThreeObject = useCallback((link: any) => {
    // Preview links must use default rendering so linkColor / linkDashArray / linkWidth apply (custom object bypasses them).
    // When showArrows is on, use default links so linkDirectionalArrowLength / linkDirectionalArrowColor apply (custom THREE.Line has no arrows).
    if (activePreset && link.type === 'parent' && !showArrows) {
      const sourceCluster = typeof link.source === 'object' ? link.source.familyCluster : null;
      const targetCluster = typeof link.target === 'object' ? link.target.familyCluster : null;
      
      if (sourceCluster === activePreset && targetCluster === activePreset) {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({ color: '#60a5fa' });
        const line = new THREE.Line(geometry, material);
        return line;
      }
    }
    return null;
  }, [activePreset, showArrows]);

  const linkPositionUpdate = useCallback((line: any, { start, end }: any, link: any) => {
    if (activePreset && link.type === 'parent' && line instanceof THREE.Line) {
      const sourceCluster = typeof link.source === 'object' ? link.source.familyCluster : null;
      const targetCluster = typeof link.target === 'object' ? link.target.familyCluster : null;

      if (sourceCluster === activePreset && targetCluster === activePreset) {
        const sourceId = typeof link.source === 'object' && link.source !== null ? (link.source as any).id : link.source;
        let hash = 0;
        const idStr = String(sourceId);
        for (let i = 0; i < idStr.length; i++) {
          hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
          hash |= 0;
        }
        const staggerOffset = (Math.abs(hash) % 20) - 10;
        
        const midY = (start.y + end.y) / 2 + staggerOffset;
        const points = [
          new THREE.Vector3(start.x, start.y, start.z),
          new THREE.Vector3(start.x, midY, start.z),
          new THREE.Vector3(end.x, midY, end.z),
          new THREE.Vector3(end.x, end.y, end.z)
        ];
        line.geometry.setFromPoints(points);
        return true;
      }
    }
    return false;
  }, [activePreset]);

  useEffect(() => {
    if (fgRef.current && !initialCameraPos && graphData?.nodes?.length) {
      setInitialCameraPos({ x: 0, y: 0, z: 650 });
      // Set initial "Space" position
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 30000 }, { x: 0, y: 0, z: 0 }, 0);
    }
  }, [initialCameraPos, graphData]);

  useEffect(() => {
    if (!isSimulationLoading && fgRef.current && !hasIntroPlayed.current && graphData?.nodes?.length) {
      hasIntroPlayed.current = true;

      setTimeout(() => {
        // Start cinematic intro zoom
        fgRef.current.cameraPosition(
          { x: 0, y: 0, z: 650 },
          { x: 0, y: 0, z: 0 },
          4500
        );
      }, 500);
    }
  }, [isSimulationLoading, graphData]);

  useEffect(() => {
    const initEnvironment = () => {
      if (!fgRef.current) return;

      const scene = fgRef.current.scene();
      const camera = fgRef.current.camera();
      const renderer = fgRef.current.renderer();

      if (!scene) return;

      if (camera) {
        camera.far = 100000;
        camera.updateProjectionMatrix();
      }

      if (renderer) {
        renderer.shadowMap.enabled = !isMobile();
        renderer.setClearColor(0x0a0a0a, 1);
      }

      if (!envInitializedRef.current) {
        scene.fog = new THREE.Fog(0x020205, 5000, 20000);
        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const mainLight = new THREE.PointLight(0xffffff, 3.5);
        mainLight.position.set(1000, 1000, 1000);
        scene.add(mainLight);
        const fillLight = new THREE.PointLight(0x0066ff, 2.5);
        fillLight.position.set(-1000, -1000, 1000);
        scene.add(fillLight);
        const backLight = new THREE.PointLight(0xff00ff, 1.5);
        backLight.position.set(0, 0, -1000);
        scene.add(backLight);
        envInitializedRef.current = true;
      }

      if (backgroundTheme === 'deep-space') {
        if (!starfieldRef.current) {
          setIsStarfieldLoading(true);
          const isMob = isMobile();
          const starfieldResult = createStarfield(scene, {
            isMobileDevice: isMob,
            onBackgroundLoaded: () => setIsStarfieldLoading(false),
          });
          starfieldRef.current = starfieldResult.group;
          nebulaeRef.current = starfieldResult.nebulae;
        }
      } else {
        setIsStarfieldLoading(false);
        if (starfieldRef.current) {
          scene.remove(starfieldRef.current);
          starfieldRef.current = null;
          nebulaeRef.current = [];
        }
        scene.background = new THREE.Color(THEME_COLORS_3D[backgroundTheme]);
        scene.environment = null;
      }
    };

    const interval = setInterval(initEnvironment, 500);
    return () => clearInterval(interval);
  }, [backgroundTheme]);

  // Show loader immediately when user selects deep-space (before interval runs)
  useEffect(() => {
    if (backgroundTheme === 'deep-space' && !starfieldRef.current) {
      setIsStarfieldLoading(true);
    }
  }, [backgroundTheme]);

  const containerBg = backgroundTheme === 'deep-space' ? '#0a0a0a' : backgroundTheme === 'wax-white' ? '#fffef8' : backgroundTheme === 'smooth-sepia' ? '#e8dcc8' : '#d4e8f7';

  // Render
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: containerBg }}>
      {isSimulationLoading && graphData && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.7)', zIndex: 1000, color: '#fff', fontSize: '18px', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div>Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span>...</div>
            <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '10px auto' }} />
          </div>
        </div>
      )}
      {isStarfieldLoading && (
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(0,0,0,0.6)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading background…
        </div>
      )}
      
      <ForceGraph3DAny
        graphData={filteredGraphData}
        nodeThreeObject={nodeThreeObject}
        linkThreeObject={linkThreeObject}
        linkPositionUpdate={linkPositionUpdate}
        linkDistance={(l: any) =>
          isPreviewLink(l)
            ? 0
            : activePreset
              ? (l.type === 'marriage' || l.type === 'divorce' ? 450 : 250)
              : (l.type === 'marriage' || l.type === 'divorce' ? 250 : 120)}
        linkStrength={(l: any) =>
          isPreviewLink(l) ? 0 : activePreset ? 0.1 : (l.type === 'marriage' || l.type === 'divorce' ? 0.3 : 0.8)}
        ref={fgRef}
        warmupTicks={160}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.1}
        cooldownTicks={activePreset ? 1000 : 1000}
        onEngineStop={() => setIsSimulationLoading(false)}
        onNodeClick={(node: FamilyNode) => handleNodeClick(node)}
        onNodeDoubleClick={(node: any) => {
          const nodeId = getNodeId(node);
          if (!nodeId) return;
          
          const hasChildren = graphData?.links.some(l => {
            const sId = getNodeId(l.source);
            return sId === nodeId && l.type === 'parent';
          });
          
          if (hasChildren) {
            effectiveToggleCollapse(nodeId);
          }
        }}
        onBackgroundClick={onBackgroundClick}
        linkColor={(l: any) => {
          if (isPreviewLink(l)) return '#22d3ee';
          if (l.type === 'marriage') return '#f59e0b';
          if (l.type === 'divorce') return '#9ca3af';
          return '#60a5fa';
        }}
        linkWidth={(l: any) =>
          isPreviewLink(l) ? 4 : (l.type === 'marriage' || l.type === 'divorce') ? 3 : 1.5}
        linkDashArray={(l: any) => {
          if (isPreviewLink(l)) return [6, 5];
          return l.type === 'divorce' ? [3, 2] : null;
        }}
        linkVisibility={linkVisibility}
        linkOpacity={0.4}
        linkMaterial={linkMaterial}
        linkCurvature={(l: any) => {
          if (isPreviewLink(l)) return 0;
          if (!activePreset) return (l.type === 'marriage' || l.type === 'divorce') ? 0.3 : 0;
          
          const sourceCluster = typeof l.source === 'object' ? l.source.familyCluster : null;
          const targetCluster = typeof l.target === 'object' ? l.target.familyCluster : null;
          
          // Only parent links WITHIN the active preset family should be straight
          if (l.type === 'parent' && sourceCluster === activePreset && targetCluster === activePreset) {
            return 0;
          }
          
          // Everything else (marriage links, background families, inter-family links) should be curved/flexible
          return 0.3;
        }}
        linkDirectionalArrowLength={(l: any) =>
          isPreviewLink(l) ? 0 : (showArrows && l.type === 'parent') ? 14 : 0}
        linkDirectionalArrowColor={() => '#60a5fa'}
        showNavInfo={false}
      />

      {/* Settings Controls - Top Right */}
      <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 1300, alignItems: 'flex-end' }}>
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

        {/* Ambiance Toggle - Floating slightly below button */}
        <Box sx={{ 
          background: 'rgba(5, 5, 5, 0.5)', 
          backdropFilter: 'blur(12px)', 
          px: 1.5, 
          py: 0.5, 
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <FormControlLabel
            control={
              <Switch
                checked={isAmbienceOn}
                onChange={() => setIsAmbienceOn(!isAmbienceOn)}
                color="success"
                size="small"
              />
            }
            label="AMBIANCE"
            sx={{ 
              m: 0,
              color: 'rgba(255,255,255,0.6)', 
              '& .MuiFormControlLabel-label': { 
                fontSize: '0.65rem', 
                fontWeight: 700, 
                letterSpacing: '0.1em' 
              } 
            }}
          />
        </Box>

        <SettingsPanelSpring isOpen={showControls}>
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
            {userProfile?.node_id && (
              <Button
                variant="contained"
                fullWidth
                size="small"
                onClick={() => {
                  const meNode = graphData?.nodes?.find((n) => n.id === userProfile.node_id);
                  const c = meNode?.familyCluster || meNode?.maternalFamilyCluster;
                  if (c) onEnsureClusterVisible3D(c);
                  focusNodeById(userProfile.node_id!);
                }}
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

            <Button 
              variant="text" 
              size="small" 
              onClick={resetView}
              sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600 }}
            >
              RESET VIEWPORT
            </Button>

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

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={<Switch checked={showNames} onChange={() => setShowNames(!showNames)} color="primary" size="small" />}
                label="LABELS"
                sx={{ m: 0, color: 'text.primary', '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
              <FormControlLabel
                control={<Switch checked={showLinks} onChange={() => setShowLinks(!showLinks)} color="primary" size="small" />}
                label="LINKS"
                sx={{ m: 0, color: 'text.primary', '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
              <FormControlLabel
                control={<Switch checked={showArrows} onChange={() => setShowArrows(!showArrows)} color="primary" size="small" />}
                label="ARROWS"
                sx={{ m: 0, color: 'text.primary', '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
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
              color={effectiveCollapsedNodes.size > 0 ? "primary" : "inherit"}
              size="small"
              fullWidth
              onClick={() => {
                if (effectiveCollapsedNodes.size > 0) {
                  effectiveSetCollapsedNodes(new Set());
                } else {
                  const parents = new Set<string>();
                  graphData?.links.forEach(l => {
                    if (l.type === 'parent') {
                      const sId = getNodeId(l.source);
                      parents.add(sId);
                    }
                  });
                  effectiveSetCollapsedNodes(parents);
                }
              }}
              sx={{ mt: 1, fontSize: '0.65rem', fontWeight: 700, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {effectiveCollapsedNodes.size > 0 ? 'EXPAND ALL' : 'COLLAPSE ALL'}
            </Button>

            <div ref={textureRef}>
              <Button
                variant="text"
                size="small"
                fullWidth
                onClick={() => setIsTextureMenuOpen(!isTextureMenuOpen)}
                sx={{ justifyContent: 'space-between', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}
              >
                TEXTURE: {nodeTexture.toUpperCase()} {isTextureMenuOpen ? '▴' : '▾'}
              </Button>
              <TextureMenuSpring isOpen={isTextureMenuOpen}>
                <Box sx={{ mt: 0.5, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                  <Button fullWidth size="small" sx={{ justifyContent: 'flex-start', fontSize: '0.7rem', py: 1 }} onClick={() => { setNodeTexture('spheres'); setIsTextureMenuOpen(false); }}>Spheres</Button>
                  <Button fullWidth size="small" sx={{ justifyContent: 'flex-start', fontSize: '0.7rem', py: 1 }} onClick={() => { setNodeTexture('planets'); setIsTextureMenuOpen(false); }}>Planets</Button>
                  <Button fullWidth size="small" sx={{ justifyContent: 'flex-start', fontSize: '0.7rem', py: 1 }} onClick={() => { setNodeTexture('none'); setIsTextureMenuOpen(false); }}>None</Button>
                </Box>
              </TextureMenuSpring>
            </div>

            <div ref={presetsRef}>
              <Button
                variant="text"
                size="small"
                fullWidth
                onClick={() => setIsPresetsOpen(!isPresetsOpen)}
                sx={{ justifyContent: 'space-between', color: 'primary.main', fontSize: '0.7rem', fontWeight: 700 }}
              >
                FAMILY PRESETS {isPresetsOpen ? '▴' : '▾'}
              </Button>
              <TextureMenuSpring isOpen={isPresetsOpen}>
                <Box sx={{ mt: 0.5, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                  <Button fullWidth size="small" sx={{ justifyContent: 'flex-start', fontSize: '0.7rem' }} onClick={() => applyPreset(null)}>Global View</Button>
                  {uniqueClusters.map((cluster) => (
                    <Button key={cluster} fullWidth size="small" sx={{ justifyContent: 'flex-start', fontSize: '0.7rem', color: activePreset === cluster ? 'primary.main' : 'inherit' }} onClick={() => applyPreset(cluster)}>{cluster}</Button>
                  ))}
                </Box>
              </TextureMenuSpring>
            </div>

            <div ref={visibilityRef}>
              <Button
                variant="text"
                size="small"
                fullWidth
                onClick={() => setIsVisibilityOpen(!isVisibilityOpen)}
                sx={{ justifyContent: 'space-between', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}
              >
                VISIBILITY {isVisibilityOpen ? '▴' : '▾'}
              </Button>
              <TextureMenuSpring isOpen={isVisibilityOpen} maxHeightOpen={300}>
                <Box sx={{ mt: 0.5, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button size="small" sx={{ fontSize: '0.6rem', minWidth: 0 }} onClick={() => onVisibleClusters3DChange(new Set(uniqueClusters))}>ALL</Button>
                    <Button size="small" sx={{ fontSize: '0.6rem', minWidth: 0 }} onClick={() => onVisibleClusters3DChange(new Set())}>NONE</Button>
                  </Box>
                  <Box sx={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {uniqueClusters.map((cluster) => (
                      <Box key={cluster} sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
                        <Checkbox
                          size="small"
                          checked={visibleClusters3D.has(cluster)}
                          onChange={() => {
                            onVisibleClusters3DChange((prev) => {
                              const n = new Set(prev);
                              if (n.has(cluster)) n.delete(cluster);
                              else n.add(cluster);
                              return n;
                            });
                          }}
                          sx={{ p: 0.5, color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'primary.main' } }}
                        />
                        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>{cluster}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </TextureMenuSpring>
            </div>
          </div>
        </SettingsPanelSpring>
      </div>

      {/* Nav Controls - Bottom Right (Collapsible); optional "See who's new!" stacked above */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '8px',
          minWidth: '180px',
        }}
      >
        {seeWhosNewButtonSlot}
        {!isMobileDevice && (
          <>
            <Button
              variant="outlined"
              onClick={() => setShowNavControls(!showNavControls)}
              sx={{
                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                borderColor: 'rgba(255,255,255,0.1)',
                color: '#e5e7eb',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '1px',
                '&:hover': { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(30, 30, 40, 0.95)' },
              }}
            >
              NAV CONTROLS 👁️ {showNavControls ? '▴' : '▾'}
            </Button>
            <SettingsPanelSpring isOpen={showNavControls}>
              <div style={{
                marginTop: '8px',
                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                padding: '8px 12px',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: '0.7rem',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                minWidth: '180px',
              }}>
                <div style={{ lineHeight: '1.6' }}>
                  <div><span style={{ color: isSteeringActive ? '#10b981' : '#fbbf24', fontWeight: 600 }}>R</span>: Mouse Steering <span style={{ color: isSteeringActive ? '#10b981' : '#fbbf24' }}>({isSteeringActive ? 'ACTIVE' : 'LOCKED'})</span></div>
                  <div><span style={{ color: '#fff', fontWeight: 600 }}>WASD</span>: Move (Hold <span style={{ color: '#fff', fontWeight: 600 }}>Shift</span> for Boost)</div>
                  <div><span style={{ color: '#fff', fontWeight: 600 }}>Q / E</span>: Roll View L / R</div>
                  <div><span style={{ color: '#fff', fontWeight: 600 }}>Tab</span>: Cycle Names</div>
                  <div><span style={{ color: '#fff', fontWeight: 600 }}>Enter</span>: Focus selection</div>
                  <div><span style={{ color: '#fff', fontWeight: 600 }}>Esc</span>: Deselect</div>
                </div>
              </div>
            </SettingsPanelSpring>
          </>
        )}
      </div>
    </div>
  );
};

// Default export for backward compatibility
export default FamilyTree3DContent;

