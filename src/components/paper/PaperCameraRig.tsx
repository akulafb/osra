import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { paperCameraLimits, paperIdleRotates, paperIdleRotateSpeed, PAPER_MAX_FRAME_SECONDS } from '../../lib/paperCamera';
import type { PaperEmphasisState } from './paperEmphasis';
import type { PaperFrame } from './paperScene';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;

interface PaperCameraRigProps {
  frame: PaperFrame;
  state: MutableRefObject<PaperEmphasisState>;
  modalOpen: boolean;
}

/** Keeps the camera within its zoom limits and box, and turns the view slowly once it sits idle with nobody focused, outside the intro and behind no modal. */
export function PaperCameraRig({ frame, state, modalOpen }: PaperCameraRigProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const camera = useThree((three) => three.camera);
  const size = useThree((three) => three.size);
  const lastInput = useRef(performance.now());

  useLayoutEffect(() => {
    if (!controls || !(camera instanceof THREE.PerspectiveCamera) || !(size.width > 0 && size.height > 0)) return;
    const { minDistance, maxDistance, boundary } = paperCameraLimits(frame, camera.fov, size.width / size.height);
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    const { min, max } = boundary;
    controls.setBoundary(new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, max.y, max.z)));
  }, [controls, camera, frame, size.width, size.height]);

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
    if (!paperIdleRotates(idleSeconds, state.current.focus !== null, state.current.pointedId !== null)) return;
    void controls.rotate(paperIdleRotateSpeed(size.width) * Math.min(delta, PAPER_MAX_FRAME_SECONDS), 0, true);
  });

  return null;
}
