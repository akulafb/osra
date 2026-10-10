import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { paperCameraLimits, paperIdleRotates, paperIdleRotateSpeed, PAPER_MAX_FRAME_SECONDS } from '../../lib/paperCamera';
import type { PaperLayout } from '../../lib/paperLayout';
import type { PaperSpread } from '../../lib/paperSpread';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_CAMERA_SPREAD_FRAME_PRIORITY, type PaperFrame } from './paperScene';
import { stepSpreadCamera, type AppliedLimits } from './paperSpreadCamera';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;

interface PaperCameraRigProps {
  frame: PaperFrame;
  /** The scene's layout, where the selected Person is placed before the Spread. */
  layout: PaperLayout;
  state: MutableRefObject<PaperEmphasisState>;
  modalOpen: boolean;
  selectedId: string | null;
}

/**
 * Keeps the camera within its zoom limits and box at the current Spread, moves
 * it with the selected Person while the Spread changes so they stay put on
 * screen, and turns the view slowly once it sits idle with nobody selected,
 * outside the intro and behind no modal.
 */
export function PaperCameraRig({ frame, layout, state, modalOpen, selectedId }: PaperCameraRigProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const camera = useThree((three) => three.camera);
  const size = useThree((three) => three.size);
  const lastInput = useRef(performance.now());
  const followed = useRef<PaperSpread | null>(null);
  const limited = useRef<AppliedLimits | null>(null);

  const currentLimits = useCallback(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !(size.width > 0 && size.height > 0)) return null;
    return paperCameraLimits(frame, camera.fov, size.width / size.height, state.current.spread);
  }, [camera, frame, size.width, size.height, state]);

  // A layout effect, so the limits are set before the first fit: camera-controls clamps a distance only as it is set.
  useLayoutEffect(() => {
    const limits = currentLimits();
    if (controls && limits) limited.current = stepSpreadCamera(controls, limits, null, limited.current);
  }, [controls, currentLimits]);

  useFrame(() => {
    const { spread } = state.current;
    const from = followed.current;
    followed.current = spread;
    if (!controls) return;
    const limits = currentLimits();
    if (!limits) return;
    const place = selectedId ? layout.get(selectedId) : undefined;
    const follow = from && from !== spread && place ? { place, from, to: spread } : null;
    limited.current = stepSpreadCamera(controls, limits, follow, limited.current);
  }, PAPER_CAMERA_SPREAD_FRAME_PRIORITY);

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
