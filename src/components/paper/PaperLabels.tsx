import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyNode } from '../../types/graph';
import type { PaperLayout } from '../../lib/paperLayout';
import { inkOf, placeOf, type PaperEmphasisState } from './paperEmphasis';
import { depthFade, paperLabelSize } from './paperScene';

const PAPER_LABEL_FONT_URL = '/fonts/kawkab-mono/KawkabMono-Regular.woff';

/** Labels are whole up to the orbit target's distance and gone at this multiple of it. */
const LABEL_FADE_END = 1.8;
const LABEL_GAP = 1.5;
const OUTLINE_PER_WEIGHT = 0.07;
const HIDDEN_BELOW = 0.02;

interface TroikaText extends THREE.Mesh {
  fillOpacity: number;
  outlineOpacity: number;
}

interface PaperLabelsProps {
  nodes: readonly FamilyNode[];
  layout: PaperLayout;
  ink: string;
  viewDistance: MutableRefObject<number>;
  state: MutableRefObject<PaperEmphasisState>;
}

/** Uppercase monospace names above each disc, bigger and bolder for larger discs, fading with distance from the camera and with the emphasis. */
export function PaperLabels({ nodes, layout, ink, viewDistance, state }: PaperLabelsProps) {
  const texts = useRef(new Map<string, TroikaText>());
  const anchors = useRef(new Map<string, THREE.Group>());
  const placedDrift = useRef<PaperEmphasisState['drift'] | null>(null);
  const point = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const start = viewDistance.current;
    const end = start * LABEL_FADE_END;
    const { drift } = state.current;
    if (drift !== placedDrift.current) {
      anchors.current.forEach((anchor, id) => placeOf(layout, drift, id, anchor.position));
      placedDrift.current = drift;
    }
    texts.current.forEach((text, id) => {
      if (!layout.has(id)) return;
      placeOf(layout, drift, id, point.current);
      const fade = depthFade(camera.position.distanceTo(point.current), start, end) * inkOf(state.current, id);
      text.visible = fade > HIDDEN_BELOW;
      text.fillOpacity = fade;
      text.outlineOpacity = fade;
    });
  });

  return (
    <>
      {nodes.map((node) => {
        const disc = layout.get(node.id);
        if (!disc) return null;
        const { fontSize, weight } = paperLabelSize(disc.radius);
        return (
          <Billboard
            key={node.id}
            ref={(anchor: THREE.Group | null) => {
              if (anchor) anchors.current.set(node.id, anchor);
              else anchors.current.delete(node.id);
              placedDrift.current = null;
            }}
          >
            <Text
              ref={(text: TroikaText | null) => {
                if (text) texts.current.set(node.id, text);
                else texts.current.delete(node.id);
              }}
              position={[0, disc.radius + LABEL_GAP, 0]}
              font={PAPER_LABEL_FONT_URL}
              fontSize={fontSize}
              color={ink}
              outlineWidth={weight * fontSize * OUTLINE_PER_WEIGHT}
              outlineColor={ink}
              anchorX="center"
              anchorY="bottom"
              letterSpacing={0.04}
            >
              {(node.firstName ?? '').trim().toLocaleUpperCase() || '?'}
            </Text>
          </Billboard>
        );
      })}
    </>
  );
}
