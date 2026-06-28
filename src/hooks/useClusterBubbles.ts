import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { getClusterColors } from '../utils/familyColors';
import { isMobile } from '../utils/device';
import {
  computeVisibleBounds,
  computeClusterCentroids,
  bubbleRadius,
  detailFactor,
  apparentDiameterFraction,
  ramp01,
  EXIT_MULT,
  BUBBLE_FADE_MIN,
  BUBBLE_FADE_FULL,
  LABEL_FADE_MIN,
  LABEL_FADE_FULL,
  GLASS_BASE_OPACITY,
  HOVER_SCALE,
  HOVER_EMISSIVE_INTENSITY,
  HOVER_LERP,
  type LiveNode,
  type Vec3,
} from '../utils/clusterBubbles';

/**
 * 3D "family cluster on zoom-out" (LIN-32).
 *
 * Watches the camera distance each frame and, when zoomed out, fades in one big
 * sphere per paternal familyCluster positioned at the live centroid of its
 * members and sized by member count. Clicking a bubble flies the camera in so
 * the cluster expands back into individuals.
 *
 * The bubbles are our own THREE objects added to the force-graph's scene
 * because react-force-graph-3d renders one object per data node and offers no
 * overlay hook. Returns:
 *  - `detailRef`: live crossfade factor (0 = individuals, 1 = clusters). Read by
 *    the component inside `onBeforeRender` to fade individual nodes.
 *  - `fullyClustered`: hysteresis-gated boolean; when true the component hides
 *    individual nodes/links entirely (performance).
 */
/** Minimal slice of the react-force-graph-3d instance this hook calls. */
interface ForceGraphHandle {
  scene?: () => THREE.Scene;
  camera?: () => THREE.PerspectiveCamera;
  controls?: () => { target?: THREE.Vector3 } | undefined;
  renderer?: () => THREE.WebGLRenderer | undefined;
  cameraPosition: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    transitionMs?: number
  ) => void;
}

export function useClusterBubbles(params: {
  fgRef: React.MutableRefObject<ForceGraphHandle | null | undefined>;
  graphData: { nodes: LiveNode[]; links: unknown[] };
  visibleClusters: Set<string>;
  enabled: boolean;
}): { detailRef: React.MutableRefObject<number>; fullyClustered: boolean } {
  const { fgRef, graphData, visibleClusters, enabled } = params;

  const detailRef = useRef(0);
  const [fullyClustered, setFullyClustered] = useState(false);
  const fullyClusteredRef = useRef(false);

  // Latest inputs read by the rAF loop without restarting it.
  const graphDataRef = useRef(graphData);
  graphDataRef.current = graphData;
  const visibleClustersRef = useRef(visibleClusters);
  visibleClustersRef.current = visibleClusters;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Latest graph bounds, shared with the click handler for fly-in distance.
  const boundsRef = useRef<{ centroid: Vec3; radius: number }>({
    centroid: { x: 0, y: 0, z: 0 },
    radius: 0,
  });

  useEffect(() => {
    const SHARED_GEOMETRY = new THREE.SphereGeometry(1, 24, 24);
    const isMob = isMobile();

    interface Bubble {
      group: THREE.Group;
      mesh: THREE.Mesh;
      material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      sprite: SpriteText;
      labelText: string;
      /** Hover state: target (0/1) set by pointermove, amt eased toward it each frame. */
      hoverTarget: number;
      hoverAmt: number;
    }

    let sceneGroup: THREE.Group | null = null;
    const bubbles = new Map<string, Bubble>();

    const createBubble = (cluster: string): Bubble => {
      const color = getClusterColors(cluster).border;
      // Frosted-glass planet, mirroring the individual-node material (getMaterial)
      // so bubbles read as the same family of object. Emissive ramps in on hover.
      const params = {
        color,
        transparent: true,
        opacity: 0,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0,
      };
      const material = isMob
        ? new THREE.MeshStandardMaterial(params)
        : new THREE.MeshPhysicalMaterial({
            ...params,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transmission: 0.3,
            thickness: 2,
          });
      const mesh = new THREE.Mesh(SHARED_GEOMETRY, material);

      const sprite = new SpriteText('');
      sprite.color = '#ffffff';
      sprite.backgroundColor = 'rgba(5, 5, 5, 0.6)';
      sprite.padding = 3;
      sprite.borderRadius = 3;
      sprite.fontWeight = 'bold';
      sprite.material.depthTest = false;
      sprite.material.transparent = true;
      sprite.renderOrder = 999;

      const group = new THREE.Group();
      group.add(mesh);
      group.add(sprite);

      return { group, mesh, material, sprite, labelText: '', hoverTarget: 0, hoverAmt: 0 };
    };

    const disposeBubble = (b: Bubble) => {
      sceneGroup?.remove(b.group);
      b.material.dispose();
      // SpriteText owns a canvas-backed texture/material it created internally.
      const spriteMat = b.sprite.material as THREE.SpriteMaterial;
      spriteMat.map?.dispose();
      spriteMat.dispose();
    };

    // `dist`/`fovRad` describe the current camera so each bubble can be faded by
    // its on-screen size (declutter). They are unused when t collapses to 0.
    const updateBubbles = (t: number, dist: number, fovRad: number) => {
      if (!sceneGroup) return;
      sceneGroup.visible = t > 0.001;

      const centroids = computeClusterCentroids(graphDataRef.current.nodes);
      const visible = visibleClustersRef.current;

      // Largest cluster across the whole graph (not just visible ones, so toggling
      // visibility doesn't rescale the rest) — the "sun" that bubbleRadius normalizes to.
      let maxCount = 1;
      for (const agg of centroids.values()) {
        if (agg.count > maxCount) maxCount = agg.count;
      }

      // Remove bubbles whose cluster is gone or no longer visible.
      for (const [cluster, bubble] of bubbles) {
        if (!centroids.has(cluster) || !visible.has(cluster)) {
          disposeBubble(bubble);
          bubbles.delete(cluster);
        }
      }

      if (t <= 0.001) return;

      for (const [cluster, agg] of centroids) {
        if (!visible.has(cluster)) continue;

        let bubble = bubbles.get(cluster);
        if (!bubble) {
          bubble = createBubble(cluster);
          bubbles.set(cluster, bubble);
          sceneGroup.add(bubble.group);
        }

        bubble.group.position.set(agg.centroid.x, agg.centroid.y, agg.centroid.z);
        const radius = bubbleRadius(agg.count, maxCount);

        // Hover (LIN-32 #4): ease toward the target each frame, then grow & brighten.
        bubble.hoverAmt += (bubble.hoverTarget - bubble.hoverAmt) * HOVER_LERP;
        bubble.mesh.scale.setScalar(radius * (1 + HOVER_SCALE * bubble.hoverAmt));
        bubble.material.emissiveIntensity = HOVER_EMISSIVE_INTENSITY * bubble.hoverAmt;

        // Declutter: fade the bubble (and, on a stricter band, its label) by how
        // big it actually renders on screen, so small/distant planets drop away
        // when zoomed out and only prominent families stay labelled (LIN-32 #3).
        const apparent = apparentDiameterFraction(radius, dist, fovRad);
        const bubbleVis = ramp01(apparent, BUBBLE_FADE_MIN, BUBBLE_FADE_FULL);
        const labelVis = ramp01(apparent, LABEL_FADE_MIN, LABEL_FADE_FULL);
        bubble.material.opacity = GLASS_BASE_OPACITY * t * bubbleVis;

        const label = `${cluster}\n(${agg.count})`;
        if (label !== bubble.labelText) {
          bubble.sprite.text = label;
          bubble.labelText = label;
        }
        bubble.sprite.textHeight = Math.max(16, radius * 0.32);
        (bubble.sprite.material as THREE.SpriteMaterial).opacity = t * labelVis;
      }
    };

    // --- Click-to-expand (raycast against bubble meshes) ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const downAt = { x: 0, y: 0, time: 0 };

    const flyIntoCluster = (centroid: Vec3) => {
      const fg = fgRef.current;
      if (!fg) return;
      const camera = fg.camera?.();
      if (!camera) return;

      const centroidVec = new THREE.Vector3(centroid.x, centroid.y, centroid.z);
      const dir = camera.position.clone().sub(centroidVec);
      if (!Number.isFinite(dir.lengthSq()) || dir.lengthSq() < 1e-6) {
        dir.set(0, 0, 1);
      } else {
        dir.normalize();
      }
      // Approach close enough that detailFactor drops to 0 (individuals expand).
      const radius = boundsRef.current.radius || 200;
      const dist = Math.max(90, EXIT_MULT * radius * 0.7);
      const newPos = centroidVec.clone().add(dir.multiplyScalar(dist));
      fg.cameraPosition(
        { x: newPos.x, y: newPos.y, z: newPos.z },
        { x: centroid.x, y: centroid.y, z: centroid.z },
        1200
      );
    };

    const getDomElement = (): HTMLElement | null => {
      const fg = fgRef.current;
      try {
        return fg?.renderer?.()?.domElement ?? null;
      } catch {
        return null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downAt.x = e.clientX;
      downAt.y = e.clientY;
      downAt.time = Date.now();
    };

    const onPointerUp = (e: PointerEvent) => {
      // Ignore drags (camera rotate/pan) and only act while bubbles are showing.
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved > 6 || Date.now() - downAt.time > 400) return;
      if (detailRef.current < 0.5 || bubbles.size === 0) return;

      const fg = fgRef.current;
      const dom = getDomElement();
      const camera = fg?.camera?.();
      if (!fg || !dom || !camera) return;

      const rect = dom.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // Only faded-in bubbles are clickable (skip ones decluttered to ~invisible).
      const meshes = Array.from(bubbles.values())
        .filter((b) => b.material.opacity > 0.05)
        .map((b) => b.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;

      const hitMesh = hits[0].object;
      let hitCluster: string | null = null;
      for (const [cluster, b] of bubbles) {
        if (b.mesh === hitMesh) {
          hitCluster = cluster;
          break;
        }
      }
      if (!hitCluster) return;

      const agg = computeClusterCentroids(graphDataRef.current.nodes).get(hitCluster);
      if (agg) flyIntoCluster(agg.centroid);
    };

    // --- Hover (LIN-32 #4): highlight the bubble under the cursor + show a pointer ---
    let listenerDom: HTMLElement | null = null;
    let hoverCursorActive = false;
    const onPointerMove = (e: PointerEvent) => {
      const dom = getDomElement();
      const camera = fgRef.current?.camera?.();
      if (!dom || !camera) return;

      let hovered: string | null = null;
      if (detailRef.current >= 0.5 && bubbles.size > 0) {
        const rect = dom.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const entries = Array.from(bubbles.entries()).filter(([, b]) => b.material.opacity > 0.05);
        const hits = raycaster.intersectObjects(entries.map(([, b]) => b.mesh), false);
        if (hits.length > 0) {
          const found = entries.find(([, b]) => b.mesh === hits[0].object);
          hovered = found ? found[0] : null;
        }
      }

      // The actual cursor is asserted each frame in the tick (it has to run after
      // react-force-graph's own loop, which otherwise resets the cursor).
      for (const [cluster, b] of bubbles) b.hoverTarget = cluster === hovered ? 1 : 0;
    };

    const clearHover = () => {
      for (const b of bubbles.values()) b.hoverTarget = 0;
      if (hoverCursorActive && listenerDom) listenerDom.style.cursor = '';
      hoverCursorActive = false;
    };

    const attachListeners = (dom: HTMLElement | null) => {
      if (!dom || listenerDom === dom) return;
      detachListeners();
      dom.addEventListener('pointerdown', onPointerDown);
      dom.addEventListener('pointerup', onPointerUp);
      dom.addEventListener('pointermove', onPointerMove);
      listenerDom = dom;
    };
    const detachListeners = () => {
      if (!listenerDom) return;
      clearHover();
      listenerDom.removeEventListener('pointerdown', onPointerDown);
      listenerDom.removeEventListener('pointerup', onPointerUp);
      listenerDom.removeEventListener('pointermove', onPointerMove);
      listenerDom = null;
    };

    // --- Per-frame loop ---
    let frameId = 0;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const fg = fgRef.current;
      if (!fg || !enabledRef.current) {
        if (detailRef.current !== 0) {
          detailRef.current = 0;
          updateBubbles(0, 0, 0);
        }
        return;
      }

      const scene = fg.scene?.();
      const camera = fg.camera?.();
      const controls = fg.controls?.();
      if (!scene || !camera || !controls?.target) return;

      if (!sceneGroup) {
        sceneGroup = new THREE.Group();
        sceneGroup.name = 'cluster-bubbles';
        scene.add(sceneGroup);
      }
      attachListeners(getDomElement());

      const bounds = computeVisibleBounds(graphDataRef.current.nodes);
      boundsRef.current = bounds;

      const dist = camera.position.distanceTo(controls.target);
      const fovRad = ((camera.fov || 60) * Math.PI) / 180;
      const t = detailFactor(dist, bounds.radius);
      detailRef.current = t;

      // Hysteresis so individual nodes don't flicker at the threshold.
      if (!fullyClusteredRef.current && t >= 0.999) {
        fullyClusteredRef.current = true;
        setFullyClustered(true);
      } else if (fullyClusteredRef.current && t < 0.9) {
        fullyClusteredRef.current = false;
        setFullyClustered(false);
      }

      updateBubbles(t, dist, fovRad);

      // Show a pointer cursor while a bubble is hovered. Done here (not in the
      // pointer handler) because this loop runs after react-force-graph's own,
      // which resets the cursor every frame; reassert it so ours wins.
      let anyHovered = false;
      for (const b of bubbles.values()) if (b.hoverTarget > 0) { anyHovered = true; break; }
      if (anyHovered) {
        if (listenerDom) listenerDom.style.cursor = 'pointer';
        hoverCursorActive = true;
      } else if (hoverCursorActive) {
        if (listenerDom) listenerDom.style.cursor = '';
        hoverCursorActive = false;
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      detachListeners();
      for (const bubble of bubbles.values()) disposeBubble(bubble);
      bubbles.clear();
      if (sceneGroup && sceneGroup.parent) sceneGroup.parent.remove(sceneGroup);
      sceneGroup = null;
      SHARED_GEOMETRY.dispose();
    };
  }, [fgRef]);

  return { detailRef, fullyClustered };
}
