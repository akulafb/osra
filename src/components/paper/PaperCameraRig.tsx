import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PaperHeldKeys } from '../../lib/paperKeys';
import type { PaperLayout } from '../../lib/paperLayout';
import type { PaperCameraDirector } from './paperCameraDirector';
import { PAPER_CAMERA_FRAME_PRIORITY, type PaperFrame } from './paperScene';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;

interface PaperCameraRigProps {
  director: PaperCameraDirector;
  frame: PaperFrame;
  /** The scene's layout, where each Person is placed before the Spread. */
  layout: PaperLayout;
  modalOpen: boolean;
  selectedId: string | null;
  held: MutableRefObject<PaperHeldKeys>;
  flightPaused: boolean;
}

/** Plugs the camera director into React and the render loop. */
export function PaperCameraRig({ director, frame, layout, modalOpen, selectedId, held, flightPaused }: PaperCameraRigProps) {
  const size = useThree((three) => three.size);

  // A layout effect, so the view is set before any other effect in the scene asks the camera to fly.
  useLayoutEffect(() => {
    director.setView({ frame, layout, width: size.width, height: size.height });
  }, [director, frame, layout, size.width, size.height]);

  useFrame((_, seconds) => {
    director.tick({ seconds, selectedId, modalOpen, flight: flightPaused ? null : held.current });
  }, PAPER_CAMERA_FRAME_PRIORITY);

  useEffect(() => {
    const onInput = () => director.noteInput();
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
    };
  }, [director]);

  return null;
}
