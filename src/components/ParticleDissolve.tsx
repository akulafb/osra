import React, { useMemo } from 'react';
import {
  CANVAS_FX_COLORS,
  CANVAS_FX_PARTICLES,
  canvasParticleAt,
  seedCanvasParticles,
} from '../utils/canvasFx';

export interface ParticleDissolveProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  /**
   * Where the Dissolve has got to, 0 → 1, and back down again if it unwinds.
   * Owned by the lifecycle (LIN-55): this component has no timer, and no
   * `onComplete` that an early unmount could make unreachable.
   */
  progress: number;
}

/** The 2D rendering of a Dissolve: the card frays into drifting debris. */
export const ParticleDissolve: React.FC<ParticleDissolveProps> = ({
  x,
  y,
  width,
  height,
  color,
  progress,
}) => {
  const seeds = useMemo(
    () => seedCanvasParticles(CANVAS_FX_PARTICLES.dissolve, 'dissolve'),
    []
  );

  const origin = { x, y, width, height };

  return (
    <g className="particle-dissolve-group" pointerEvents="none">
      {seeds.map((seed, i) => {
        const frame = canvasParticleAt(seed, progress, origin);
        if (frame.opacity <= 0 || frame.r <= 0) return null;
        return (
          <circle
            key={i}
            cx={frame.x}
            cy={frame.y}
            r={frame.r}
            fill={color || CANVAS_FX_COLORS.dissolve[i % CANVAS_FX_COLORS.dissolve.length]}
            opacity={frame.opacity}
            style={{ filter: 'drop-shadow(0 0 4px currentColor)' }}
          />
        );
      })}
    </g>
  );
};
