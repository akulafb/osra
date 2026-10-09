import { useLayoutEffect, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ForceGraphHandle } from '../../types/forceGraph';
import { paperScreenPoint } from './paperScene';

/** Gives the 3D editing panel, Ghost Previews and target visibility the slice of Cosmos's graph handle they read, from the Paper scene. */
export function PaperGraphHandle({ handle }: { handle: MutableRefObject<ForceGraphHandle | null> }) {
  const get = useThree((three) => three.get);
  useLayoutEffect(() => {
    handle.current = {
      scene: () => get().scene,
      camera: () => get().camera as THREE.PerspectiveCamera,
      renderer: () => get().gl,
      graph2ScreenCoords: (x, y, z) => {
        const { camera, size } = get();
        return paperScreenPoint({ x, y, z }, camera, size);
      },
    };
    return () => {
      handle.current = null;
    };
  }, [get, handle]);
  return null;
}
