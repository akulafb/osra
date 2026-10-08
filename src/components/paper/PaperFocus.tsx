import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import type { PaperLayout } from '../../lib/paperLayout';
import { paperFlyTo } from '../../lib/paperFocus';
import type { PersonDrawerInset } from '../../hooks/usePersonDrawerInset';
import { playPaperTap } from './paperTap';

interface PaperFocusProps {
  selectedId: string | null;
  layout: PaperLayout;
  /** What the person drawer covers once it is open. */
  drawerInset: PersonDrawerInset;
  onOverview: () => void;
  /** Lets FIND ME fly to a Person who may already be focused. */
  flyTo: MutableRefObject<((id: string) => void) | null>;
}

/** On each focus the camera flies to the Person and a tap plays; clearing the focus flies back to the overview. */
export function PaperFocus({ selectedId, layout, drawerInset, onOverview, flyTo }: PaperFocusProps) {
  const controls = useThree((three) => three.controls) as CameraControls | null;
  const canvas = useThree((three) => three.gl.domElement);

  const fly = useCallback(
    (id: string, smooth: boolean) => {
      const disc = layout.get(id);
      if (!controls || !disc || !(controls.camera instanceof THREE.PerspectiveCamera)) return;
      const rect = canvas.getBoundingClientRect();
      const sheetTop = window.innerHeight * (1 - drawerInset.bottomVh / 100);
      const drawerLeft = window.innerWidth - drawerInset.rightPx;
      const { position, target } = paperFlyTo({
        person: disc,
        radius: disc.radius,
        from: { position: controls.camera.position, target: controls.getTarget(new THREE.Vector3()) },
        viewport: { width: rect.width, height: rect.height },
        inset: { rightPx: Math.max(0, rect.right - drawerLeft), bottomPx: Math.max(0, rect.bottom - sheetTop) },
        fovDegrees: controls.camera.fov,
      });
      void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, smooth);
    },
    [controls, canvas, layout, drawerInset]
  );

  useEffect(() => {
    flyTo.current = (id) => fly(id, true);
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
      fly(selectedId, !arriving);
      if (!arriving) playPaperTap();
    } else if (previous) {
      onOverview();
    }
  }, [controls, selectedId, fly, onOverview]);

  return null;
}
