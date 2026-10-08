import { useEffect, useLayoutEffect, useMemo } from 'react';
import { EffectComposer } from '@react-three/postprocessing';
import { Effect } from 'postprocessing';
import * as THREE from 'three';
import { useCurrentPaperPair } from '../../hooks/useCanvasMode';
import type { PaperPair } from '../../theme/paperPair';
import { DUOTONE_FRAGMENT, hexToLinear, luma } from './duotoneMap';

class DuotoneEffect extends Effect {
  private readonly ink = new THREE.Vector3();
  private readonly paper = new THREE.Vector3();

  constructor(sceneInk: string, scenePaper: string) {
    super('PaperDuotone', DUOTONE_FRAGMENT, {
      uniforms: new Map<string, THREE.Uniform>([
        ['inkLuma', new THREE.Uniform(luma(hexToLinear(sceneInk)))],
        ['paperLuma', new THREE.Uniform(luma(hexToLinear(scenePaper)))],
      ]),
    });
    this.uniforms.set('ink', new THREE.Uniform(this.ink));
    this.uniforms.set('paper', new THREE.Uniform(this.paper));
  }

  paint(pair: PaperPair) {
    this.ink.set(...hexToLinear(pair.ink));
    this.paper.set(...hexToLinear(pair.paper));
  }
}

/** Repaints the grayscale scene in the live Paper Pair, so the 3D scene fades with the panels. */
export function PaperDuotone({ ink, paper }: { ink: string; paper: string }) {
  const effect = useMemo(() => new DuotoneEffect(ink, paper), [ink, paper]);
  useEffect(() => () => effect.dispose(), [effect]);
  const composer = useMemo(
    () => (
      <EffectComposer>
        <primitive object={effect} />
      </EffectComposer>
    ),
    [effect]
  );

  return (
    <>
      <DuotonePaint effect={effect} />
      {composer}
    </>
  );
}

/** Only this re-renders on each frame of a fade; re-rendering the composer's children would rebuild its passes. */
function DuotonePaint({ effect }: { effect: DuotoneEffect }) {
  const { pair } = useCurrentPaperPair();
  useLayoutEffect(() => effect.paint(pair), [effect, pair]);
  return null;
}
