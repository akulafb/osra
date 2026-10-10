import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { paperCameraLimits, paperIdleRotates, paperIdleRotateSpeed, PAPER_MAX_FRAME_SECONDS } from '../../lib/paperCamera';
import type { PaperLayout } from '../../lib/paperLayout';
import { spreadFollow, type PaperSpread } from '../../lib/paperSpread';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_CAMERA_FOLLOW_FRAME_PRIORITY, type PaperFrame } from './paperScene';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;

interface PaperCameraRigProps {
  frame: PaperFrame;
  /** The scene's layout, where the selected Person is placed before the Spread. */
  layout: PaperLayout;
  state: MutableRefObject<PaperEmphasisState>;
  modalOpen: boolean;
  selectedId: string | null;
}

interface Limited {
  controls: CameraControls;
  frame: PaperFrame;
  spread: PaperSpread;
  aspect: number;
  fov: number;
}

/**
 * Keeps the camera within its zoom limits and box at the current Spread, moves
 * it with the selected Person while the Spread changes so they stay put on
 * screen, and turns the view slowly once it sits idle with nobody selected,
 * outside the intro and behind no modal.
 */
export function PaperCameraRig({ frame, layout, state, modalOpen, selectedId }: PaperCameraRigProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const size = useThree((three) => three.size);
  const lastInput = useRef(performance.now());
  const limited = useRef<Limited | null>(null);
  const scratch = useMemo(() => ({ now: new THREE.Vector3(), end: new THREE.Vector3(), box: new THREE.Box3() }), []);

  useFrame(({ camera }) => {
    if (!controls || !(camera instanceof THREE.PerspectiveCamera) || !(size.width > 0 && size.height > 0)) return;
    const { spread } = state.current;
    const aspect = size.width / size.height;
    const last = limited.current;
    if (last && last.controls === controls && last.frame === frame && last.spread === spread && last.aspect === aspect && last.fov === camera.fov) return;

    const { minDistance, maxDistance, boundary } = paperCameraLimits(frame, camera.fov, aspect, spread);
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    const { min, max } = boundary;
    scratch.box.min.set(min.x, min.y, min.z);
    scratch.box.max.set(max.x, max.y, max.z);
    controls.setBoundary(scratch.box);
    limited.current = { controls, frame, spread, aspect, fov: camera.fov };

    const place = selectedId ? layout.get(selectedId) : undefined;
    if (!last || last.spread === spread || !place) return;
    const d = spreadFollow(place, last.spread, spread);
    const { now, end } = scratch;
    controls.getTarget(now, false).add(d);
    controls.getTarget(end, true).add(d);
    // camera-controls' moveTo without a transition also snaps the target to its end, so a flight in progress gets its end back with a second, smooth move.
    const flying = !now.equals(end);
    void controls.moveTo(now.x, now.y, now.z, false);
    if (flying) void controls.moveTo(end.x, end.y, end.z, true);
  }, PAPER_CAMERA_FOLLOW_FRAME_PRIORITY);

  useEffect(() => {
    const onInput = () => {
      lastInput.current = performance.now();
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
    };
  }, []);

  useFrame((_, delta) => {
    if (!controls || modalOpen || state.current.reveal) return;
    const idleSeconds = (performance.now() - lastInput.current) / 1000;
    if (!paperIdleRotates(idleSeconds, selectedId !== null, state.current.pointedId !== null)) return;
    void controls.rotate(paperIdleRotateSpeed(size.width) * Math.min(delta, PAPER_MAX_FRAME_SECONDS), 0, true);
  });

  return null;
}
