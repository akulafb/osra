import { useEffect, useMemo, useRef } from 'react';
import type { Lifecycle } from '../../lib/lifecycle';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import { EMPTY_LIFECYCLE_SCENE, rememberLifecycleScene, type PaperLifecycleScene } from '../../lib/paperLifecycle';
import type { FamilyNode } from '../../types/graph';

/** The shown scene, plus what each subject of a Spawn or Dissolve last looked like, remembered across renders. */
export function usePaperLifecycleScene(
  layout: PaperLayout | null,
  shown: { nodes: readonly FamilyNode[]; lines: readonly PaperLine[] },
  lifecycles: readonly Lifecycle[]
): PaperLifecycleScene {
  const previous = useRef(EMPTY_LIFECYCLE_SCENE);
  const scene = useMemo(
    () => (layout ? rememberLifecycleScene(previous.current, layout, shown, lifecycles) : previous.current),
    [layout, shown, lifecycles]
  );
  useEffect(() => {
    previous.current = scene;
  }, [scene]);
  return scene;
}
