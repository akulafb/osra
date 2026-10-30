import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PaperLayout, Point3 } from '../../lib/paperLayout';
import { addOffsets } from '../../lib/paperHover';
import { spreadOffsets } from '../../lib/paperSpread';
import { paperRevealProgress, paperRevealShares, PAPER_REVEAL_SECONDS } from '../../lib/paperIntro';
import type { PaperCameraDirector } from './paperCameraDirector';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_REVEAL_FRAME_PRIORITY, type PaperFrame } from './paperScene';

interface PaperRevealProps {
  director: PaperCameraDirector;
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
 */
export function PaperReveal({ director, frame, layout, ids, selectedId, state, onDone }: PaperRevealProps) {
  const shares = useMemo(() => paperRevealShares(layout, ids, frame.center), [layout, ids, frame.center]);
  const startedAt = useRef<number | null>(null);
  const done = useRef(false);
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => director.swingIn(), [director]);

  const startedWith = useRef(selectedId);
  useEffect(() => {
    if (selectedId !== startedWith.current) director.hurrySwing();
  }, [director, selectedId]);

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
    state.current = { ...state.current, drift: addOffsets(state.current.drift, spreadOffsets(pulls, state.current.spread.factor)), reveal };
  }, PAPER_REVEAL_FRAME_PRIORITY);

  return null;
}
