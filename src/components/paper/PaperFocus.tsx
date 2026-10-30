import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { FamilyLink } from '../../types/graph';
import { paperFlyFrames, paperSearchEmphasis } from '../../lib/paperSearch';
import type { PersonDrawerInset } from '../../hooks/usePersonDrawerInset';
import type { PaperCameraDirector } from './paperCameraDirector';
import { playPaperTap } from './paperTap';

interface PaperFocusProps {
  director: PaperCameraDirector;
  selectedId: string | null;
  ids: readonly string[];
  links: readonly FamilyLink[];
  matchIds: ReadonlySet<string> | null;
  /** What the person drawer covers once it is open. */
  drawerInset: PersonDrawerInset;
  onOverview: () => void;
  /** Lets FIND ME fly to a Person who may already be focused. */
  flyTo: MutableRefObject<((id: string) => void) | null>;
}

/**
 * On each focus the camera flies to the Person and a tap plays; clearing the
 * focus flies back to the overview. A resize or a turned phone reframes the
 * same way.
 */
export function PaperFocus({ director, selectedId, ids, links, matchIds, drawerInset, onOverview, flyTo }: PaperFocusProps) {
  const canvas = useThree((three) => three.gl.domElement);
  const size = useThree((three) => three.size);

  const fly = useCallback(
    (id: string, smooth: boolean) => {
      if (paperFlyFrames(id, matchIds) === 'cluster') {
        onOverview();
        return true;
      }
      const emphasis = paperSearchEmphasis({ ids, links, hoveredId: null, selectedId: id, matchIds });
      const rect = canvas.getBoundingClientRect();
      const sheetTop = window.innerHeight * (1 - drawerInset.bottomVh / 100);
      const drawerLeft = window.innerWidth - drawerInset.rightPx;
      return director.flyToPerson({
        id,
        emphasis,
        viewport: { width: rect.width, height: rect.height },
        inset: { rightPx: Math.max(0, rect.right - drawerLeft), bottomPx: Math.max(0, rect.bottom - sheetTop) },
        smooth,
      });
    },
    [director, canvas, ids, links, matchIds, drawerInset, onOverview]
  );

  useEffect(() => {
    flyTo.current = (id) => void fly(id, true);
    return () => {
      flyTo.current = null;
    };
  }, [flyTo, fly]);

  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = seen.current;
    seen.current = selectedId;
    if (selectedId === previous) return;
    const arriving = previous === undefined;
    if (selectedId) {
      if (fly(selectedId, !arriving) && !arriving) playPaperTap();
    } else if (previous) {
      onOverview();
    }
  }, [selectedId, fly, onOverview]);

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
