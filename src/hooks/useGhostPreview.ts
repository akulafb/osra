import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { RelativeDirection } from '../types/graph';
import { ForceGraphRef, LiveNodePosition } from '../types/forceGraph';
import {
  computeGhostPreviewOffset,
  ghostPreviewBreath,
  GHOST_PREVIEW_RADIUS,
  GHOST_PREVIEW_SHELL_SCALE,
  GHOST_PREVIEW_BODY_OPACITY,
  GHOST_PREVIEW_SHELL_OPACITY,
  GHOST_PREVIEW_LABEL_HEIGHT,
  GHOST_PREVIEW_TETHER_DASH,
  GHOST_PREVIEW_TETHER_GAP,
} from '../utils/ghostPreview';
import { relationColor } from '../components/cards/relationStyle';

/**
 * Ghost Preview (LIN-46, ADR 0002): a translucent marker in the 3D scene
 * showing where a new Tree Node will land while its name is being typed.
 *
 * Strictly decorative — nothing here is raycast, hit-tested, or clickable. All
 * interaction lives in the docked panel. That separation is the point: it buys
 * the spatial sense of building something without putting click targets into a
 * crowded, occluded scene.
 *
 * The marker rides the force simulation rather than freezing it. Direction is
 * resolved once when the action opens and held, so the preview stays put
 * relative to its anchor while the camera orbits.
 */
export function useGhostPreview(params: {
  fgRef: ForceGraphRef;
  /** Live simulated nodes — the array handed to the graphData prop. */
  nodes: LiveNodePosition[];
  anchorNodeId: string | null;
  relation: RelativeDirection | null;
  /** Name as typed, rendered above the marker. */
  name: string;
  /** Off on touch: 3D manipulation is desktop-only for v1 (ADR 0002). */
  enabled: boolean;
}): void {
  const { fgRef, nodes, anchorNodeId, relation, name, enabled } = params;

  // Held in a ref so the render loop is not torn down and rebuilt whenever the
  // caller passes a new array identity — the useClusterBubbles precedent.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const labelRef = useRef<SpriteText | null>(null);

  const active = enabled && anchorNodeId !== null && relation !== null;

  useEffect(() => {
    if (!active || !relation || !anchorNodeId) return;
    const fg = fgRef.current;
    const scene = fg?.scene?.();
    const camera = fg?.camera?.();
    if (!scene || !camera) return;

    // Resolved once, then held — the preview must not swing around as the
    // camera orbits, only follow its anchor.
    const offset = computeGhostPreviewOffset(camera.quaternion, relation);
    const color = new THREE.Color(relationColor(relation));

    const bodyGeometry = new THREE.SphereGeometry(GHOST_PREVIEW_RADIUS, 16, 16);
    const shellGeometry = new THREE.SphereGeometry(
      GHOST_PREVIEW_RADIUS * GHOST_PREVIEW_SHELL_SCALE,
      12,
      12
    );
    const body = new THREE.Mesh(
      bodyGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: GHOST_PREVIEW_BODY_OPACITY,
      })
    );
    const shell = new THREE.Mesh(
      shellGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: GHOST_PREVIEW_SHELL_OPACITY,
        wireframe: true,
      })
    );

    const label = new SpriteText('…');
    label.color = '#ffffff';
    label.backgroundColor = 'rgba(5, 5, 5, 0.6)';
    label.textHeight = 4;
    label.padding = 2;
    label.borderRadius = 2;
    label.position.set(0, GHOST_PREVIEW_LABEL_HEIGHT, 0);
    label.material.depthTest = false;
    label.renderOrder = 999;
    labelRef.current = label;

    const group = new THREE.Group();
    group.name = 'ghost-preview';
    group.add(body, shell, label);

    const tetherGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const tether = new THREE.Line(
      tetherGeometry,
      new THREE.LineDashedMaterial({
        color,
        dashSize: GHOST_PREVIEW_TETHER_DASH,
        gapSize: GHOST_PREVIEW_TETHER_GAP,
        transparent: true,
        opacity: 0.8,
      })
    );
    tether.name = 'ghost-preview-tether';

    scene.add(group);
    scene.add(tether);

    const anchorVec = new THREE.Vector3();
    const target = new THREE.Vector3();
    let frameId = 0;
    let startedAt: number | null = null;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (startedAt === null) startedAt = now;

      const anchor = nodesRef.current.find((n) => n.id === anchorNodeId);
      if (
        !anchor ||
        typeof anchor.x !== 'number' ||
        typeof anchor.y !== 'number' ||
        typeof anchor.z !== 'number'
      ) {
        return;
      }

      anchorVec.set(anchor.x, anchor.y, anchor.z);
      target.copy(anchorVec).add(offset);
      group.position.copy(target);
      shell.scale.setScalar(ghostPreviewBreath(now - startedAt));

      const positions = tetherGeometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, anchorVec.x, anchorVec.y, anchorVec.z);
      positions.setXYZ(1, target.x, target.y, target.z);
      positions.needsUpdate = true;
      tetherGeometry.computeBoundingSphere();
      tether.computeLineDistances();
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      // Detach via the live parent rather than the captured scene, so a
      // re-created graph scene cannot strand these objects (useClusterBubbles
      // does the same).
      group.parent?.remove(group);
      tether.parent?.remove(tether);
      bodyGeometry.dispose();
      shellGeometry.dispose();
      (body.material as THREE.Material).dispose();
      (shell.material as THREE.Material).dispose();
      tetherGeometry.dispose();
      (tether.material as THREE.Material).dispose();
      const labelMaterial = label.material as THREE.SpriteMaterial;
      labelMaterial.map?.dispose();
      labelMaterial.dispose();
      labelRef.current = null;
    };
  }, [active, relation, anchorNodeId, fgRef]);

  // The label is updated in place rather than by rebuilding the marker, so
  // typing does not restart the breathing animation on every keystroke.
  useEffect(() => {
    const label = labelRef.current;
    if (label) label.text = name.trim() || '…';
  }, [name, active]);
}
