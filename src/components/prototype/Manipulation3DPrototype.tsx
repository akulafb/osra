/**
 * PROTOTYPE — throwaway. Not production code. Dev-only.
 *
 * Question: does action chrome in the 3D view read as chrome, or as a rendering glitch?
 * And does Manipulation Freeze feel deliberate, or feel like a hang?
 *
 * Three variants of where 3D action chrome lives, on the existing `/` route via `?variant=`:
 *   A — Floating DOM overlay      (the ADR-0002 decision: no depth occlusion)
 *   B — In-scene sprites          (the rejected alternative: correctly occluded)
 *   C — Docked HUD panel          (nothing floats over the scene at all)
 *
 * Read-only. No mutations, no persistence. Handles log; the ghost card never submits.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { FamilyNode } from '../../types/graph';
import { PrototypeSwitcher } from './PrototypeSwitcher';

const VARIANTS = [
  { key: 'A', name: 'Floating DOM overlay' },
  { key: 'B', name: 'In-scene sprites' },
  { key: 'C', name: 'Docked HUD panel' },
  { key: 'D', name: 'Docked panel + spatial preview' },
];

type Relation = 'parent' | 'child' | 'spouse';

const HANDLES: { relation: Relation; label: string; color: string }[] = [
  { relation: 'parent', label: '+ Parent', color: '#a78bfa' },
  { relation: 'child', label: '+ Child', color: '#93c5fd' },
  { relation: 'spouse', label: '+ Spouse', color: '#f9a8d4' },
];

interface Projection {
  screen: { x: number; y: number };
  world: { x: number; y: number; z: number };
  distance: number;
  /** Node is behind the camera or outside the viewport. */
  offscreen: boolean;
}

/**
 * Per-frame projection of the live simulated node into canvas screen space.
 *
 * NOTE: `fgRef.current.graphData()` does NOT exist — react-force-graph-3d exposes
 * graphData as a prop only, never as a ref method (see its `methodNames` list).
 * The live nodes must be passed in: d3-force mutates the very objects handed to
 * the `graphData` prop, so `filteredGraphData.nodes` carries live x/y/z.
 */
function useAnchorProjection(
  fgRef: React.MutableRefObject<any>,
  nodes: any[],
  nodeId: string | null
) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    if (!nodeId) {
      setProjection(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const fg = fgRef.current;
      if (!fg) return;

      const live = nodesRef.current.find((n: any) => n.id === nodeId);
      if (!live || typeof live.x !== 'number') return;

      const screen = fg.graph2ScreenCoords(live.x, live.y, live.z);
      const camera = fg.camera();
      if (!screen || !camera) return;

      const distance = camera.position.distanceTo(new THREE.Vector3(live.x, live.y, live.z));

      // graph2ScreenCoords happily returns coords for points behind the camera —
      // check the view-space depth rather than trusting the projected point.
      const viewSpace = new THREE.Vector3(live.x, live.y, live.z).applyMatrix4(camera.matrixWorldInverse);
      const behind = viewSpace.z > 0;

      setProjection({
        screen: { x: screen.x, y: screen.y },
        world: { x: live.x, y: live.y, z: live.z },
        distance,
        offscreen:
          behind ||
          screen.x < 0 ||
          screen.y < 0 ||
          screen.x > window.innerWidth ||
          screen.y > window.innerHeight,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fgRef, nodeId]);

  return projection;
}

/** Manipulation Freeze: pin every node and disable camera controls. Reversible. */
function useManipulationFreeze(
  fgRef: React.MutableRefObject<any>,
  nodes: any[],
  frozen: boolean
) {
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls?.();

    if (frozen) {
      nodes.forEach((n: any) => {
        n.fx = n.x;
        n.fy = n.y;
        n.fz = n.z;
      });
      if (controls) controls.enabled = false;
    } else {
      nodes.forEach((n: any) => {
        delete n.fx;
        delete n.fy;
        delete n.fz;
      });
      if (controls) controls.enabled = true;
      // Deliberately no d3ReheatSimulation() — resume should not spike alpha.
    }
  }, [fgRef, nodes, frozen]);
}

/** Ghost card stub — a real input so focus/typing can be felt. Never submits. */
const GhostCardStub: React.FC<{
  relation: Relation;
  onCancel: () => void;
  scale?: number;
  /** Controlled so variant D can mirror the typed name into the 3D scene. */
  name: string;
  onNameChange: (name: string) => void;
}> = ({ relation, onCancel, scale = 1, name, onNameChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const color = HANDLES.find((h) => h.relation === relation)!.color;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 190,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(16px)',
        border: `1.5px dashed ${color}`,
        borderRadius: 10,
        boxShadow: `0 0 20px ${color}33, 0 8px 30px rgba(0,0,0,0.6)`,
        padding: '8px 10px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color }}>
        <span>{relation.toUpperCase()}</span>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => onNameChange(e.target.value.slice(0, 100))}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="First name…"
        style={{
          background: 'rgba(30, 41, 59, 0.9)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          padding: '5px 8px',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          outline: 'none',
        }}
      />
      <div style={{ fontSize: 9, opacity: 0.5 }}>prototype — does not submit</div>
    </div>
  );
};

export interface Manipulation3DPrototypeProps {
  fgRef: React.MutableRefObject<any>;
  selectedNode: FamilyNode | null;
  /** Live simulated nodes — the same objects d3-force mutates in place. */
  nodes: any[];
  /** LIN-32 crossfade factor (0 = individuals, 1 = cluster bubbles). */
  detailRef: React.MutableRefObject<number>;
}

export const Manipulation3DPrototype: React.FC<Manipulation3DPrototypeProps> = ({
  fgRef,
  selectedNode,
  nodes,
  detailRef,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = searchParams.get('variant') ?? 'A';
  const [frozen, setFrozen] = useState(false);
  const [ghost, setGhost] = useState<Relation | null>(null);
  const [ghostName, setGhostName] = useState('');
  const [detail, setDetail] = useState(0);

  const nodeId = selectedNode?.id ?? null;
  const projection = useAnchorProjection(fgRef, nodes, nodeId);
  useManipulationFreeze(fgRef, nodes, frozen);

  // Mirror the LIN-32 crossfade into state so the readout can show it. At
  // detail >= 0.999 every individual renders at opacity 0 — the "all nodes
  // disappeared" symptom.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setDetail((prev) => {
        const next = detailRef.current;
        return Math.abs(next - prev) > 0.005 ? next : prev;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [detailRef]);

  // Reset transient state when the selection changes.
  useEffect(() => {
    setGhost(null);
    setGhostName('');
    setFrozen(false);
  }, [nodeId]);

  const setVariant = useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('variant', key);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const openGhost = useCallback((relation: Relation) => {
    setGhost(relation);
    setGhostName('');
    // Variant D deliberately does NOT freeze — the preview marker is meant to
    // ride the simulation, which is the behaviour freeze existed to prevent.
    setFrozen(false);
  }, []);

  const closeGhost = useCallback(() => {
    setGhost(null);
    setGhostName('');
    setFrozen(false);
  }, []);

  const ghostLabelRef = useRef<SpriteText | null>(null);

  // ── Variant D: non-interactive spatial preview of where the relative lands ──
  // Everything here is decorative: no raycast targets, no hit testing, no
  // pointer events. All interaction stays in the docked panel (variant C's win).
  useEffect(() => {
    if (variant !== 'D' || !ghost || !nodeId) return;
    const fg = fgRef.current;
    const scene = fg?.scene?.();
    if (!scene) return;

    const color = new THREE.Color(HANDLES.find((h) => h.relation === ghost)!.color);
    const group = new THREE.Group();

    // Translucent body + wireframe shell — reads as "not real yet".
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })
    );
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(11.5, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, wireframe: true })
    );
    group.add(body, shell);

    const label = new SpriteText('');
    label.color = '#ffffff';
    label.backgroundColor = 'rgba(5,5,5,0.6)';
    label.textHeight = 4;
    label.padding = 2;
    label.borderRadius = 2;
    label.position.set(0, 18, 0);
    group.add(label);
    ghostLabelRef.current = label;

    // Dashed tether from anchor planet to the ghost.
    const tetherGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const tether = new THREE.Line(
      tetherGeom,
      new THREE.LineDashedMaterial({ color, dashSize: 5, gapSize: 4, transparent: true, opacity: 0.8 })
    );

    scene.add(group);
    scene.add(tether);

    let raf = 0;
    let t0: number | null = null;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (t0 === null) t0 = now;
      const live = nodes.find((n: any) => n.id === nodeId);
      const camera = fg.camera();
      if (!live || !camera || typeof live.x !== 'number') return;

      // Camera-relative placement — decision #4, surviving only as a hint.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const anchor = new THREE.Vector3(live.x, live.y, live.z);
      const target = anchor.clone();
      if (ghost === 'parent') target.addScaledVector(up, 48);
      else if (ghost === 'child') target.addScaledVector(up, -48);
      else target.addScaledVector(right, 62);

      group.position.copy(target);

      // Gentle breathing so it reads as pending rather than placed.
      const pulse = 1 + Math.sin((now - t0) / 320) * 0.06;
      shell.scale.setScalar(pulse);

      const positions = tetherGeom.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, anchor.x, anchor.y, anchor.z);
      positions.setXYZ(1, target.x, target.y, target.z);
      positions.needsUpdate = true;
      tetherGeom.computeBoundingSphere();
      tether.computeLineDistances();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      scene.remove(group);
      scene.remove(tether);
      body.geometry.dispose();
      (body.material as THREE.Material).dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      tetherGeom.dispose();
      (tether.material as THREE.Material).dispose();
      label.material?.map?.dispose?.();
      label.material?.dispose?.();
      ghostLabelRef.current = null;
    };
  }, [variant, ghost, nodeId, nodes, fgRef]);

  // Live-update the ghost label without tearing the marker down on each keystroke.
  useEffect(() => {
    const label = ghostLabelRef.current;
    if (label) label.text = ghostName.trim() || '…';
  }, [ghostName, ghost, variant]);

  // ── Variant B: in-scene sprites, camera-relative, correctly occluded ────────
  useEffect(() => {
    if (variant !== 'B' || !nodeId) return;
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene?.();
    if (!scene) return;

    const group = new THREE.Group();
    const sprites = HANDLES.map(({ label, color }) => {
      const s = new SpriteText(label);
      s.color = color;
      s.textHeight = 6;
      s.backgroundColor = 'rgba(15,23,42,0.9)';
      s.padding = 2;
      s.borderRadius = 3;
      group.add(s);
      return s;
    });
    scene.add(group);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const live = nodes.find((n: any) => n.id === nodeId);
      const camera = fg.camera();
      if (!live || !camera || typeof live.x !== 'number') return;

      // Camera-relative axes — this is decision #4 made visible.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const offset = 26;

      const origin = new THREE.Vector3(live.x, live.y, live.z);
      sprites[0].position.copy(origin).addScaledVector(up, offset); // parent
      sprites[1].position.copy(origin).addScaledVector(up, -offset); // child
      sprites[2].position.copy(origin).addScaledVector(right, offset * 1.4); // spouse
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      scene.remove(group);
      sprites.forEach((s) => {
        s.material?.map?.dispose?.();
        s.material?.dispose?.();
      });
    };
  }, [variant, nodeId, fgRef, nodes]);

  const domScale = useMemo(() => {
    if (!projection) return 1;
    return Math.min(1.15, Math.max(0.55, 300 / projection.distance));
  }, [projection]);

  const showFloating = variant === 'A' && projection && !projection.offscreen;

  const handleButtonStyle = (color: string): React.CSSProperties => ({
    background: 'rgba(15, 23, 42, 0.92)',
    border: `1.5px solid ${color}`,
    borderRadius: 999,
    color,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 14px rgba(0,0,0,0.65)',
    pointerEvents: 'auto',
  });

  return (
    <>
      {/* ── Variant A — floating DOM overlay, no depth occlusion ─────────────── */}
      {showFloating && (
        <div
          style={{
            position: 'absolute',
            left: projection.screen.x,
            top: projection.screen.y,
            zIndex: 1500,
            pointerEvents: 'none',
            transform: `scale(${domScale})`,
            transformOrigin: 'center',
          }}
        >
          {!ghost &&
            HANDLES.map(({ relation, label, color }) => (
              <button
                key={relation}
                type="button"
                onClick={() => openGhost(relation)}
                style={{
                  ...handleButtonStyle(color),
                  position: 'absolute',
                  transform: 'translate(-50%, -50%)',
                  left: relation === 'spouse' ? 92 : 0,
                  top: relation === 'parent' ? -56 : relation === 'child' ? 56 : 0,
                }}
              >
                {label}
              </button>
            ))}
          {!ghost && (
            <>
              <button
                type="button"
                style={{ ...handleButtonStyle('#22d3ee'), position: 'absolute', left: -92, top: -18, transform: 'translate(-50%, -50%)' }}
              >
                🔗
              </button>
              <button
                type="button"
                style={{ ...handleButtonStyle('#f87171'), position: 'absolute', left: -92, top: 18, transform: 'translate(-50%, -50%)' }}
              >
                🗑️
              </button>
            </>
          )}
          {ghost && (
            <div style={{ position: 'absolute', left: -95, top: ghost === 'parent' ? -150 : 60, pointerEvents: 'auto' }}>
              <GhostCardStub
                relation={ghost}
                onCancel={closeGhost}
                name={ghostName}
                onNameChange={setGhostName}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Variants C & D — docked HUD panel with a leader line ─────────────── */}
      {(variant === 'C' || variant === 'D') && selectedNode && (
        <>
          {projection && !projection.offscreen && (
            <svg
              style={{ position: 'absolute', inset: 0, zIndex: 1400, pointerEvents: 'none' }}
              width="100%"
              height="100%"
            >
              <line
                x1={projection.screen.x}
                y1={projection.screen.y}
                x2={24}
                y2={window.innerHeight / 2}
                stroke="#a78bfa"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.7}
              />
              <circle cx={projection.screen.x} cy={projection.screen.y} r={5} fill="none" stroke="#a78bfa" strokeWidth={1.5} />
            </svg>
          )}
          <div
            style={{
              position: 'absolute',
              left: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1500,
              width: 210,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: 12,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 700 }}>
              {selectedNode.firstName ?? 'Selected'}
              {projection?.offscreen && <span style={{ color: '#fbbf24' }}> · off-screen</span>}
            </div>
            {!ghost &&
              HANDLES.map(({ relation, label, color }) => (
                <button key={relation} type="button" onClick={() => openGhost(relation)} style={handleButtonStyle(color)}>
                  {label}
                </button>
              ))}
            {ghost && (
              <GhostCardStub
                relation={ghost}
                onCancel={closeGhost}
                name={ghostName}
                onNameChange={setGhostName}
              />
            )}
            {variant === 'D' && ghost && (
              <div style={{ fontSize: 9, opacity: 0.55, lineHeight: 1.5 }}>
                Preview planet is in the scene, camera-relative. It rides the simulation — no freeze.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── State readout — rule 5: surface the state ────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 62,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 3000,
          padding: '6px 12px',
          background: 'rgba(15,23,42,0.92)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8,
          color: '#e2e8f0',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          lineHeight: 1.6,
          pointerEvents: 'none',
          maxWidth: 560,
        }}
      >
        <div>
          selected={selectedNode?.firstName ?? '—'} · nodes={nodes.length} · frozen={String(frozen)} · ghost=
          {ghost ?? '—'}
        </div>
        <div>
          {projection
            ? `screen=(${projection.screen.x.toFixed(0)}, ${projection.screen.y.toFixed(0)}) · camDist=${projection.distance.toFixed(0)} · scale=${domScale.toFixed(2)} · offscreen=${projection.offscreen}`
            : 'no anchor — select a planet'}
        </div>
        <div style={{ color: detail > 0.001 ? '#f87171' : '#4ade80' }}>
          LIN-32 crossfade detail={detail.toFixed(3)}
          {detail >= 0.999
            ? ' — FULLY CLUSTERED: every individual is at opacity 0 (this is the "nodes disappeared" bug)'
            : detail > 0.001
              ? ' — partially faded'
              : ' — full detail'}
        </div>
        {variant === 'B' && (
          <div style={{ color: '#fbbf24' }}>
            B caveat: sprites are visual-only. Making them clickable needs a raycaster the graph does not expose for
            non-node objects — that cost is part of the answer.
          </div>
        )}
      </div>

      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant}>
        <button
          type="button"
          onClick={() => setFrozen((f) => !f)}
          style={{
            background: frozen ? '#0f172a' : 'transparent',
            color: frozen ? '#fef08a' : '#0f172a',
            border: '2px solid #0f172a',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
          }}
          title="Manipulation Freeze — pins all nodes and disables camera controls"
        >
          {frozen ? '❄ FROZEN' : 'FREEZE'}
        </button>
      </PrototypeSwitcher>
    </>
  );
};
