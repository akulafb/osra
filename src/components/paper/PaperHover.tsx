import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import { focusEmphasis, type Emphasis } from '../../lib/focusEmphasis';
import type { PaperLayout } from '../../lib/paperLayout';
import { paperWobble } from '../../lib/paperFocus';
import {
  easeDrift,
  nearestDiscAt,
  paperDrift,
  paperScreenRadius,
  type Point3,
  type ScreenDisc,
} from '../../lib/paperHover';
import { placeOf, type PaperEmphasisState, type PaperFocus } from './paperEmphasis';
import type { ScreenPoint } from './paperScene';

const HOVER_FRAME_PRIORITY = -1;
const LONGEST_FRAME_SECONDS = 0.1;

interface PaperHoverProps {
  state: MutableRefObject<PaperEmphasisState>;
  pointer: MutableRefObject<ScreenPoint | null>;
  layout: PaperLayout;
  ids: readonly string[];
  links: readonly FamilyLink[];
  selectedId: string | null;
}

/**
 * Finds the Person under the mouse, at most once a frame, and turns it into
 * the scene's emphasis (focusEmphasis: a selected Person outranks the hover),
 * the lean of the hovered Person's relatives and the wobble of the focused
 * Person's relatives.
 */
export function PaperHover({ state, pointer, layout, ids, links, selectedId }: PaperHoverProps) {
  const inputs = useMemo(() => ({ layout, ids, links, selectedId }), [layout, ids, links, selectedId]);
  const seen = useRef({
    pointer: null as ScreenPoint | null,
    inputs: null as typeof inputs | null,
    hoveredId: null as string | null,
    size: null as object | null,
  });
  const seenCamera = useRef({ world: new THREE.Matrix4(), projection: new THREE.Matrix4() });
  const target = useRef(new Map<string, Point3>());
  const lean = useRef<ReadonlyMap<string, Point3>>(new Map());
  const scratch = useMemo(() => ({ place: new THREE.Vector3(), view: new THREE.Vector3(), discs: [] as ScreenDisc[] }), []);

  const canvas = useThree((three) => three.gl.domElement);
  useEffect(() => () => void (canvas.style.cursor = ''), [canvas]);

  useFrame(({ camera, size, clock }, delta) => {
    const last = seen.current;
    const viewed = seenCamera.current;
    const cameraMoved = !viewed.world.equals(camera.matrixWorld) || !viewed.projection.equals(camera.projectionMatrix);
    const changed = pointer.current !== last.pointer || inputs !== last.inputs || size !== last.size || cameraMoved;

    let hoveredId = last.hoveredId;
    if (changed) {
      viewed.world.copy(camera.matrixWorld);
      viewed.projection.copy(camera.projectionMatrix);
      hoveredId = pointer.current ? personAt(pointer.current, inputs, state.current, camera, size, scratch) : null;
      canvas.style.cursor = hoveredId ? 'pointer' : '';
    }

    if (hoveredId !== last.hoveredId || inputs !== last.inputs) {
      const emphasis = focusEmphasis({ personIds: ids, links, hoveredId, focusedId: selectedId, searchMatchIds: null });
      const focus = focusOf(emphasis, selectedId, state.current.focus, clock.elapsedTime);
      // A new focus or none: relatives ease from wherever the last wobble left them.
      if (focus !== state.current.focus) lean.current = state.current.drift;
      state.current = { ...state.current, emphasis, pointedId: hoveredId, focus };
      target.current = paperDrift(layout, emphasis);
    }
    seen.current = { pointer: pointer.current, inputs, hoveredId, size };

    lean.current = easeDrift(lean.current, target.current, Math.min(delta, LONGEST_FRAME_SECONDS));
    const { focus, emphasis } = state.current;
    const drift = focus ? withWobble(lean.current, paperWobble(layout, emphasis, clock.elapsedTime - focus.since)) : lean.current;
    if (drift !== state.current.drift) state.current = { ...state.current, drift };
  }, HOVER_FRAME_PRIORITY);

  return null;
}

function personAt(
  pointer: ScreenPoint,
  { layout, ids }: { layout: PaperLayout; ids: readonly string[] },
  { drift }: PaperEmphasisState,
  camera: THREE.Camera,
  { width, height }: { width: number; height: number },
  scratch: { place: THREE.Vector3; view: THREE.Vector3; discs: ScreenDisc[] }
): string | null {
  if (!(camera instanceof THREE.PerspectiveCamera)) return null;
  const { place, view, discs } = scratch;
  discs.length = 0;
  for (const id of ids) {
    const disc = layout.get(id);
    if (!disc) continue;
    placeOf(layout, drift, id, place);
    const depth = -view.copy(place).applyMatrix4(camera.matrixWorldInverse).z;
    const radius = paperScreenRadius(disc.radius, depth, camera.fov, height) * camera.zoom;
    if (radius === 0) continue;
    place.project(camera);
    discs.push({ id, x: ((place.x + 1) / 2) * width, y: ((1 - place.y) / 2) * height, radius });
  }
  return nearestDiscAt(pointer, discs);
}

function focusOf(
  emphasis: ReadonlyMap<string, Emphasis>,
  selectedId: string | null,
  current: PaperFocus | null,
  now: number
): PaperFocus | null {
  if (!selectedId || emphasis.get(selectedId) !== 'focused') return null;
  return current?.id === selectedId ? current : { id: selectedId, since: now };
}

function withWobble(lean: ReadonlyMap<string, Point3>, wobble: ReadonlyMap<string, Point3>): ReadonlyMap<string, Point3> {
  if (wobble.size === 0) return lean;
  const drift = new Map(lean);
  for (const [id, w] of wobble) {
    const l = drift.get(id);
    drift.set(id, l ? { x: l.x + w.x, y: l.y + w.y, z: l.z + w.z } : w);
  }
  return drift;
}
