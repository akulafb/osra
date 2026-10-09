import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import type { Point3 } from '../../lib/paperHover';
import { paperSearchMotionAt, paperSearchMotionFrom, PAPER_SEARCH_STILL, type PaperSearchMotion } from '../../lib/paperSearch';
import type { PaperEmphasisState } from './paperEmphasis';
import { PAPER_SEARCH_FRAME_PRIORITY, type PaperFrame } from './paperScene';

interface PaperSearchProps {
  /** The scene's layout: the fixed layout, with the matches in their cluster while searching. */
  layout: PaperLayout;
  matchIds: ReadonlySet<string> | null;
  /** The sphere around the cluster; null outside a search or with no match. */
  cluster: PaperFrame | null;
  selectedId: string | null;
  state: MutableRefObject<PaperEmphasisState>;
  flyTo: MutableRefObject<((id: string) => void) | null>;
  onOverview: () => void;
}

/**
 * Moves the scene into the search cluster and back on the scene clock: the
 * matches travel from where they are drawn, everyone else shrinks away or
 * grows back. Each new set of matches frames the cluster, or the selected
 * match; clearing the search frames the overview.
 */
export function PaperSearch({ layout, matchIds, cluster, selectedId, state, flyTo, onOverview }: PaperSearchProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const seen = useRef<{ layout: PaperLayout; matchIds: ReadonlySet<string> | null } | null>(null);
  const motion = useRef<PaperSearchMotion>(PAPER_SEARCH_STILL);
  const settled = useRef<PaperSearchMotion | null>(null);

  useFrame(({ clock }) => {
    const last = seen.current;
    if (!last) motion.current = paperSearchMotionFrom(PAPER_SEARCH_STILL, layout, layout, matchIds, -Infinity);
    else if (last.matchIds !== matchIds) motion.current = paperSearchMotionFrom(motion.current, last.layout, layout, matchIds, clock.elapsedTime);
    seen.current = { layout, matchIds };
    if (settled.current === motion.current) return;

    const { offsets, sizes, done } = paperSearchMotionAt(motion.current, clock.elapsedTime);
    if (done) settled.current = motion.current;
    const { drift } = state.current;
    state.current = { ...state.current, size: sizes, drift: offsets.size ? withOffsets(drift, offsets) : drift };
  }, PAPER_SEARCH_FRAME_PRIORITY);

  const framedFor = useRef(matchIds);
  useEffect(() => {
    if (framedFor.current === matchIds || !controls) return;
    framedFor.current = matchIds;
    if (selectedId && layout.has(selectedId) && (!matchIds || matchIds.has(selectedId))) flyTo.current?.(selectedId);
    else if (cluster) {
      const { center, radius } = cluster;
      void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(center.x, center.y, center.z), radius), true);
    } else if (!matchIds) onOverview();
  }, [controls, matchIds, cluster, selectedId, layout, flyTo, onOverview]);

  return null;
}

function withOffsets(drift: ReadonlyMap<string, Point3>, offsets: ReadonlyMap<string, Point3>): ReadonlyMap<string, Point3> {
  const moved = new Map(drift);
  for (const [id, o] of offsets) {
    const d = moved.get(id);
    moved.set(id, d ? { x: d.x + o.x, y: d.y + o.y, z: d.z + o.z } : o);
  }
  return moved;
}
