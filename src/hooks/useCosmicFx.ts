import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ForceGraphRef, LiveNodePosition } from '../types/forceGraph';
import {
  CosmicEffectKind,
  COSMIC_FX_COLORS,
  COSMIC_FX_DURATION_MS,
  COSMIC_FX_PARTICLES,
  COSMIC_FX_PARTICLE_SIZE,
  collapseCoreScale,
  cosmicParticleOffset,
  cosmicParticleOpacity,
  resolveCosmicFxBudget,
  seedCosmicParticles,
  supernovaShellScale,
} from '../utils/cosmicFx';

/**
 * How long to wait for the anchor to acquire simulated coordinates.
 *
 * A Spawn fires the instant the Person joins the Working Record, which is
 * before the node has been through a simulation tick and has an x/y/z at all.
 * Giving up immediately would drop most supernovae; waiting forever would leak
 * an effect for a node that never arrives.
 */
const ANCHOR_WAIT_MS = 2000;

/**
 * Supernova and black-hole collapse in the scene (LIN-51, ADR 0002).
 *
 * These are the 3D renderings of the **Spawn** and **Dissolve** lifecycles, not
 * new lifecycles: the host still owns the triggers and the optimistic-update
 * and rollback semantics, and hands this hook nothing but the node the
 * lifecycle is happening to. Nothing here is raycast or clickable.
 *
 * The budget is what makes this droppable. It refuses hand-written effects
 * outright on mobile, caps the particle count, and holds the scene to one
 * concurrent effect — on a scene that already carries a starfield, nebulae,
 * planet textures, auras and glow spheres before any of this is layered on.
 */
export function useCosmicFx(params: {
  fgRef: ForceGraphRef;
  /** Live simulated nodes — the array handed to the graphData prop. */
  nodes: LiveNodePosition[];
  /** Node that has just been created; renders a supernova at it. */
  spawnNodeId: string | null;
  /** Node being removed; renders a black hole collapse at it. */
  dissolveNodeId: string | null;
  /** Hand-written effects are off on mobile, per the performance budget. */
  isMobileDevice: boolean;
}): void {
  const { fgRef, nodes, spawnNodeId, dissolveNodeId, isMobileDevice } = params;

  // Read through a ref so a new array identity does not restart a playing
  // effect — the useGhostPreview / useClusterBubbles precedent.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  /** Effects currently in the scene, so the concurrency cap is enforced rather
   *  than merely assumed from the shape of the code. */
  const activeRef = useRef(0);

  // Dissolve wins a tie: it is the one the user has just confirmed, and the
  // node it belongs to is about to stop existing.
  const kind: CosmicEffectKind | null = dissolveNodeId
    ? 'collapse'
    : spawnNodeId
      ? 'supernova'
      : null;
  const nodeId = dissolveNodeId ?? spawnNodeId;

  useEffect(() => {
    if (!kind || !nodeId) return;

    const budget = resolveCosmicFxBudget({
      requested: COSMIC_FX_PARTICLES[kind],
      isMobileDevice,
      activeEffects: activeRef.current,
    });
    if (!budget.allowed) return;

    const fg = fgRef.current;
    const scene = fg?.scene?.();
    if (!scene) return;

    const seeds = seedCosmicParticles(budget.particleCount);
    const positions = new Float32Array(seeds.length * 3);
    const colors = new Float32Array(seeds.length * 3);
    const palette = COSMIC_FX_COLORS[kind].map((hex) => new THREE.Color(hex));
    seeds.forEach((_, i) => {
      const colour = palette[i % palette.length];
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: COSMIC_FX_PARTICLE_SIZE,
      vertexColors: true,
      transparent: true,
      // Additive over a black sky is what gives these their heat. Depth writes
      // are off so the cloud cannot punch holes in the planets behind it.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    // The cloud is positioned by its group; culling it against a bounding
    // sphere that never updates would blink it out at the edges of the view.
    points.frustumCulled = false;

    // One companion mesh each: the shock front of a supernova, the dark core a
    // collapse falls into. Without them the two read as the same cloud running
    // in opposite directions.
    const coreGeometry = new THREE.SphereGeometry(10, 12, 12);
    const coreMaterial =
      kind === 'supernova'
        ? new THREE.MeshBasicMaterial({
            color: 0xfff7d6,
            transparent: true,
            wireframe: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        : new THREE.MeshBasicMaterial({ color: 0x05010a, transparent: true, opacity: 1 });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.scale.setScalar(0);

    const group = new THREE.Group();
    group.name = `cosmic-fx-${kind}`;
    // Held back until the anchor is known, so nothing flashes at the origin.
    group.visible = false;
    group.add(points, core);
    scene.add(group);
    activeRef.current += 1;

    const duration = COSMIC_FX_DURATION_MS[kind];
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    let frameId = 0;
    let waitingSince: number | null = null;
    let startedAt: number | null = null;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      activeRef.current -= 1;
      cancelAnimationFrame(frameId);
      // Detach via the live parent rather than the captured scene, so a
      // re-created graph scene cannot strand these objects.
      group.parent?.remove(group);
      geometry.dispose();
      material.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
    };

    const anchorOf = (id: string) => {
      const live = nodesRef.current.find((n) => n.id === id);
      return live &&
        typeof live.x === 'number' &&
        typeof live.y === 'number' &&
        typeof live.z === 'number'
        ? live
        : null;
    };

    const tick = (now: number) => {
      if (disposed) return;
      frameId = requestAnimationFrame(tick);
      if (waitingSince === null) waitingSince = now;

      // Ride the simulation while the node is there. A Dissolve outlives its
      // node — the Person leaves the Working Record mid-flight — so once
      // started, a missing anchor means hold the last known position.
      const anchor = anchorOf(nodeId);
      if (anchor) {
        group.position.set(anchor.x as number, anchor.y as number, anchor.z as number);
      } else if (startedAt === null) {
        if (now - waitingSince > ANCHOR_WAIT_MS) dispose();
        return;
      }

      if (startedAt === null) {
        startedAt = now;
        group.visible = true;
      }

      const t = (now - startedAt) / duration;
      if (t >= 1) {
        dispose();
        return;
      }

      for (let i = 0; i < seeds.length; i++) {
        const offset = cosmicParticleOffset(kind, seeds[i], t);
        positions[i * 3] = offset.x;
        positions[i * 3 + 1] = offset.y;
        positions[i * 3 + 2] = offset.z;
      }
      positionAttribute.needsUpdate = true;

      const opacity = cosmicParticleOpacity(kind, t);
      material.opacity = opacity;

      if (kind === 'supernova') {
        core.scale.setScalar(supernovaShellScale(t));
        coreMaterial.opacity = opacity;
      } else {
        core.scale.setScalar(collapseCoreScale(t));
      }
    };

    frameId = requestAnimationFrame(tick);
    return dispose;
    // `nodes` is deliberately absent: it is read through a ref, and depending on
    // it would restart the effect on every simulation tick.
  }, [kind, nodeId, isMobileDevice, fgRef]);
}
