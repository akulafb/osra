import { useEffect, useLayoutEffect, useMemo } from 'react';
import { EffectComposer } from '@react-three/postprocessing';
import { Effect } from 'postprocessing';
import * as THREE from 'three';
import { useCurrentPaperPair } from '../../hooks/useCanvasMode';
import type { PaperPair } from '../../theme/paperPair';
import { DUOTONE_FRAGMENT, hexToLinear, luma } from './duotoneMap';

class DuotoneEffect extends Effect {
  constructor(sceneInk: string, scenePaper: string) {
    super('PaperDuotone', DUOTONE_FRAGMENT, {
      uniforms: new Map<string, THREE.Uniform>([
        ['inkLuma', new THREE.Uniform(luma(hexToLinear(sceneInk)))],
        ['paperLuma', new THREE.Uniform(luma(hexToLinear(scenePaper)))],
        ['ink', new THREE.Uniform(new THREE.Vector3())],
        ['paper', new THREE.Uniform(new THREE.Vector3())],
      ]),
    });
  }

  paint(pair: PaperPair) {
    (this.uniforms.get('ink')!.value as THREE.Vector3).set(...hexToLinear(pair.ink));
    (this.uniforms.get('paper')!.value as THREE.Vector3).set(...hexToLinear(pair.paper));
  }
}

/** Repaints the grayscale scene in the live Paper Pair, so the 3D scene fades with the panels. */
export function PaperDuotone({ ink, paper }: { ink: string; paper: string }) {
  const { pair } = useCurrentPaperPair();
  const effect = useMemo(() => new DuotoneEffect(ink, paper), [ink, paper]);

  useLayoutEffect(() => effect.paint(pair), [effect, pair]);
  useEffect(() => () => effect.dispose(), [effect]);

  return (
    <EffectComposer>
      <primitive object={effect} dispose={null} />
    </EffectComposer>
  );
}
