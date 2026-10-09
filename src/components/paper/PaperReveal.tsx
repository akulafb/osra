import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import type { PaperLayout, Point3 } from '../../lib/paperLayout';
import { addOffsets } from '../../lib/paperHover';
import { paperRevealProgress, paperRevealShares, paperRevealSmoothTime, PAPER_REVEAL_SECONDS } from '../../lib/paperIntro';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_REVEAL_FRAME_PRIORITY, type PaperFrame } from './paperScene';

const SWING_AZIMUTH = 0.9;
const SWING_POLAR = 0.35;
const SWING_BACK = 1.6;

interface PaperRevealProps {
  frame: PaperFrame;
  layout: PaperLayout;
  ids: readonly string[];
  selectedId: string | null;
  state: MutableRefObject<PaperEmphasisState>;
  onDone: () => void;
}

/**
 * The opening reveal: Persons grow outward from the centre of the tree,
 * nearest first, while the camera swings in to where it already stands. Both
 * run on the scene clock and end within PAPER_REVEAL_SECONDS (ADR 0011).
 * A Person picked during the reveal is flown to at the usual pace.
 */
export function PaperReveal({ frame, layout, ids, selectedId, state, onDone }: PaperRevealProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const shares = useMemo(() => paperRevealShares(layout, ids, frame.center), [layout, ids, frame.center]);
  const startedAt = useRef<number | null>(null);
  const done = useRef(false);
  const landing = useRef<{ distance: number; azimuth: number; polar: number } | null>(null);
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    if (!controls) return;
    const smoothTime = controls.smoothTime;
    // Kept across StrictMode's second run, which would otherwise land where the first one started.
    const { distance, azimuth, polar } = (landing.current ??= {
      distance: controls.distance,
      azimuth: controls.azimuthAngle,
      polar: controls.polarAngle,
    });
    controls.smoothTime = paperRevealSmoothTime(false);
    void controls.rotateTo(azimuth - SWING_AZIMUTH, polar - SWING_POLAR, false);
    void controls.dollyTo(distance * SWING_BACK, false);
    void controls.rotateTo(azimuth, polar, true);
    void controls.dollyTo(distance, true);
    return () => {
      controls.smoothTime = smoothTime;
    };
  }, [controls]);

  const startedWith = useRef(selectedId);
  useEffect(() => {
    if (controls && selectedId !== startedWith.current) controls.smoothTime = paperRevealSmoothTime(true);
  }, [controls, selectedId]);

  useFrame(({ clock }) => {
    if (done.current) return;
    startedAt.current ??= clock.elapsedTime;
    const seconds = clock.elapsedTime - startedAt.current;
    if (seconds >= PAPER_REVEAL_SECONDS) {
      done.current = true;
      state.current = { ...state.current, reveal: null };
      finish.current();
      return;
    }
    const { center } = frame;
    const reveal = new Map<string, number>();
    const pulls = new Map<string, Point3>();
    for (const [id, share] of shares) {
      const disc = layout.get(id)!;
      const progress = paperRevealProgress(share, seconds);
      const pull = 1 - progress;
      reveal.set(id, progress);
      pulls.set(id, { x: (center.x - disc.x) * pull, y: (center.y - disc.y) * pull, z: (center.z - disc.z) * pull });
    }
    state.current = { ...state.current, drift: addOffsets(state.current.drift, pulls), reveal };
  }, PAPER_REVEAL_FRAME_PRIORITY);

  return null;
}
