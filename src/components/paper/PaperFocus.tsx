import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout } from '../../lib/paperLayout';
import { paperFlyTo, paperFocusReach } from '../../lib/paperFocus';
import { paperFlyFrames, paperSearchEmphasis } from '../../lib/paperSearch';
import { spreadLayout } from '../../lib/paperSpread';
import type { PersonDrawerInset } from '../../hooks/usePersonDrawerInset';
import { playPaperTap } from './paperTap';
import type { PaperEmphasisState } from './paperEmphasis';

interface PaperFocusProps {
  selectedId: string | null;
  layout: PaperLayout;
  ids: readonly string[];
  links: readonly FamilyLink[];
  matchIds: ReadonlySet<string> | null;
  /** What the person drawer covers once it is open. */
  drawerInset: PersonDrawerInset;
  onOverview: () => void;
  /** Lets FIND ME fly to a Person who may already be focused. */
  flyTo: MutableRefObject<((id: string) => void) | null>;
  /** Its Spread sets where the Person and their relatives are drawn. */
  state: MutableRefObject<PaperEmphasisState>;
}

/**
 * On each focus the camera flies to the Person and a tap plays; clearing the
 * focus flies back to the overview. A resize or a turned phone reframes the
 * same way.
 */
export function PaperFocus({ selectedId, layout, ids, links, matchIds, drawerInset, onOverview, flyTo, state }: PaperFocusProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const canvas = useThree((three) => three.gl.domElement);
  const size = useThree((three) => three.size);

  const fly = useCallback(
    (id: string, smooth: boolean) => {
      if (paperFlyFrames(id, matchIds) === 'cluster') {
        onOverview();
        return true;
      }
      const drawn = spreadLayout(layout, state.current.spread);
      const disc = drawn.get(id);
      if (!controls || !disc || !(controls.camera instanceof THREE.PerspectiveCamera)) return false;
      const emphasis = paperSearchEmphasis({ ids, links, hoveredId: null, selectedId: id, matchIds });
      const rect = canvas.getBoundingClientRect();
      const sheetTop = window.innerHeight * (1 - drawerInset.bottomVh / 100);
      const drawerLeft = window.innerWidth - drawerInset.rightPx;
      const { position, target } = paperFlyTo({
        person: disc,
        reach: paperFocusReach(drawn, disc, emphasis),
        from: { position: controls.getPosition(new THREE.Vector3(), true), target: controls.getTarget(new THREE.Vector3(), true) },
        viewport: { width: rect.width, height: rect.height },
        inset: { rightPx: Math.max(0, rect.right - drawerLeft), bottomPx: Math.max(0, rect.bottom - sheetTop) },
        fovDegrees: controls.camera.fov,
      });
      void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, smooth);
      return true;
    },
    [controls, canvas, layout, ids, links, matchIds, drawerInset, onOverview, state]
  );

  useEffect(() => {
    flyTo.current = (id) => void fly(id, true);
    return () => {
      flyTo.current = null;
    };
  }, [flyTo, fly]);

  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!controls) return;
    const previous = seen.current;
    seen.current = selectedId;
    if (selectedId === previous) return;
    const arriving = previous === undefined;
    if (selectedId) {
      if (fly(selectedId, !arriving) && !arriving) playPaperTap();
    } else if (previous) {
      onOverview();
    }
  }, [controls, selectedId, fly, onOverview]);

  const reframe = useRef(() => {});
  reframe.current = () => {
    if (selectedId) fly(selectedId, true);
    else onOverview();
  };
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${size.width}x${size.height}:${drawerInset.rightPx}:${drawerInset.bottomVh}`;
    if (framedFor.current !== null && framedFor.current !== key) reframe.current();
    framedFor.current = key;
  }, [size.width, size.height, drawerInset.rightPx, drawerInset.bottomVh]);

  return null;
}
