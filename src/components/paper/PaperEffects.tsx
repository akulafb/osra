import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraControls } from '@react-three/drei';
import { EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, DepthOfFieldEffect, Effect, NoiseEffect } from 'postprocessing';
import * as THREE from 'three';
import { useCurrentPaperPair } from '../../hooks/useCanvasMode';
import type { PaperPair } from '../../theme/paperPair';
import type { PaperDepthOfField, PaperEffectSettings } from '../../lib/paperEffects';
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

const COC_DEPTH_READ = 'float depth=readDepth(vUv);';

/**
 * Lines write no depth, so they read as the empty paper behind them; the blur
 * leaves that depth sharp so it does not wipe the lines out. Without that
 * patch the scene goes without depth of field.
 */
function depthOfField(camera: THREE.Camera, { bokehScale }: PaperDepthOfField): DepthOfFieldEffect | null {
  const effect = new DepthOfFieldEffect(camera, { bokehScale });
  const coc = effect.cocMaterial;
  if (!coc.fragmentShader.includes(COC_DEPTH_READ)) {
    effect.dispose();
    return null;
  }
  coc.fragmentShader = coc.fragmentShader.replace(COC_DEPTH_READ, `${COC_DEPTH_READ}if(depth>=1.0){gl_FragColor=vec4(0.0);return;}`);
  coc.needsUpdate = true;
  effect.target = new THREE.Vector3();
  return effect;
}

/** Depth of field and grain, then the duotone last, so the live Paper Pair paints the final image. */
export function PaperEffects({ ink, paper, settings }: { ink: string; paper: string; settings: PaperEffectSettings }) {
  const camera = useThree((three) => three.camera);
  const duotone = useMemo(() => new DuotoneEffect(ink, paper), [ink, paper]);
  const grain = useMemo(() => {
    const effect = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
    effect.blendMode.opacity.value = settings.grain;
    return effect;
  }, [settings.grain]);
  const dof = useMemo(() => (settings.depthOfField ? depthOfField(camera, settings.depthOfField) : null), [camera, settings.depthOfField]);
  useEffect(() => () => duotone.dispose(), [duotone]);
  useEffect(() => () => grain.dispose(), [grain]);
  useEffect(() => () => dof?.dispose(), [dof]);

  const composer = useMemo(
    () => (
      <EffectComposer>
        {dof ? <primitive object={dof} /> : <></>}
        <primitive object={grain} />
        <primitive object={duotone} />
      </EffectComposer>
    ),
    [dof, grain, duotone]
  );

  return (
    <>
      <DuotonePaint effect={duotone} />
      {dof && settings.depthOfField && <FocusOnTarget effect={dof} rangePerDistance={settings.depthOfField.focusRangePerDistance} />}
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

/** Keeps the sharp plane on the camera's orbit point, with a soft band that widens as the camera pulls back. */
function FocusOnTarget({ effect, rangePerDistance }: { effect: DepthOfFieldEffect; rangePerDistance: number }) {
  const position = useRef(new THREE.Vector3());
  useFrame(({ camera, controls }) => {
    const target = effect.target;
    if (!controls || !target) return;
    (controls as CameraControls).getTarget(target, false);
    effect.cocMaterial.focusRange = camera.getWorldPosition(position.current).distanceTo(target) * rangePerDistance;
  });
  return null;
}
