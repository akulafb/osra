import { useEffect, useMemo, useRef } from 'react';
import type { Lifecycle } from '../../lib/lifecycle';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { EMPTY_LIFECYCLE_SCENE, rememberLifecycleScene, type PaperLifecycleScene } from '../../lib/paperLifecycle';
import type { FamilyGraph, FamilyNode } from '../../types/graph';

/** `rememberLifecycleScene`, carried from one committed render to the next. */
export function usePaperLifecycleScene(
  layout: PaperLayout | null,
  shown: { nodes: readonly FamilyNode[]; lines: readonly PaperLine[] },
  lifecycles: readonly Lifecycle[],
  record: FamilyGraph
): PaperLifecycleScene {
  const previous = useRef(EMPTY_LIFECYCLE_SCENE);
  const scene = useMemo(
    () => (layout ? rememberLifecycleScene(previous.current, layout, shown, lifecycles, record) : previous.current),
    [layout, shown, lifecycles, record]
  );
  useEffect(() => {
    previous.current = scene;
  }, [scene]);
  return scene;
}
