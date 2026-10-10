import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { LiveNodePosition } from '../../types/forceGraph';
import type { PaperLayout, Point3 } from '../../lib/paperLayout';
import { spreadInto, toSpread, type Spread } from '../../lib/paperSpread';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_SPREAD_FRAME_PRIORITY } from './paperScene';

interface PaperSpreadRigProps {
  /** The slider's value, written on every tick without a render. */
  spread: MutableRefObject<Spread>;
  /** The tree's centre, which every Person spreads out from. */
  centre: Point3;
  layout: PaperLayout;
  /** The Person positions the editing panel and Ghost Previews read each frame; moved in place, as Cosmos's simulation moves its nodes. */
  liveNodes: LiveNodePosition[];
  state: MutableRefObject<PaperEmphasisState>;
}

/**
 * Brings the slider's Spread into the scene once a frame, ahead of every
 * reader: a new spread in the scene state when it or the centre changed, and
 * the live positions moved to match.
 */
export function PaperSpreadRig({ spread, centre, layout, liveNodes, state }: PaperSpreadRigProps) {
  const placed = useRef<{ nodes: LiveNodePosition[]; spread: PaperEmphasisState['spread'] } | null>(null);

  useFrame(() => {
    const factor = toSpread(spread.current);
    const current = state.current.spread;
    if (current.factor !== factor || current.centre !== centre) {
      state.current = { ...state.current, spread: { centre, factor } };
    }
    const now = state.current.spread;
    const last = placed.current;
    if (last && last.nodes === liveNodes && last.spread === now) return;
    for (const node of liveNodes) {
      const disc = layout.get(node.id);
      if (disc) spreadInto(now.centre, disc, now.factor, node as Point3);
    }
    placed.current = { nodes: liveNodes, spread: now };
  }, PAPER_SPREAD_FRAME_PRIORITY);

  return null;
}
