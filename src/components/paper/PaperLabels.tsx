import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { FamilyNode } from '../../types/graph';
import type { PaperLayout } from '../../lib/paperLayout';
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
}

/** Uppercase monospace names above each disc, bigger and bolder for larger discs, fading with distance from the camera. */
export function PaperLabels({ nodes, layout, ink, viewDistance }: PaperLabelsProps) {
  const texts = useRef(new Map<string, TroikaText>());
  const point = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const start = viewDistance.current;
    const end = start * LABEL_FADE_END;
    texts.current.forEach((text, id) => {
      const disc = layout.get(id);
      if (!disc) return;
      const fade = depthFade(camera.position.distanceTo(point.current.set(disc.x, disc.y, disc.z)), start, end);
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
          <Billboard key={node.id} position={[disc.x, disc.y, disc.z]}>
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
