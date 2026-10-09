import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import { paperFlightStep } from '../../lib/paperKeys';
import type { PaperHeldKeys } from './usePaperKeys';
import type { PaperEmphasisState } from './paperEmphasis';

interface PaperFlightProps {
  held: MutableRefObject<PaperHeldKeys>;
  viewDistance: MutableRefObject<number>;
  state: MutableRefObject<PaperEmphasisState>;
  paused: boolean;
}

/** Moves and turns the camera through CameraControls while WASD or Q/E is held (product decision 6). */
export function PaperFlight({ held, viewDistance, state, paused }: PaperFlightProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  useFrame((_, delta) => {
    if (!controls || paused || state.current.reveal) return;
    const step = paperFlightStep(held.current.keys, held.current.boost, delta, viewDistance.current);
    if (!step) return;
    if (step.truck) void controls.truck(step.truck, 0, true);
    if (step.forward) void controls.forward(step.forward, true);
    if (step.azimuth) void controls.rotate(step.azimuth, 0, true);
  });
  return null;
}
