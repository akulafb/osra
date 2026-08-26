import React, { useMemo } from 'react';
import {
  CANVAS_FX_COLORS,
  CANVAS_FX_PARTICLES,
  canvasParticleAt,
  seedCanvasParticles,
  spawnRingAt,
} from '../utils/canvasFx';

export interface SpawnBurstProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Where the Spawn has got to, 0 → 1. Owned by the lifecycle (LIN-55): this
   * component has no timer and no completion signal of its own.
   */
  progress: number;
}

/** The 2D rendering of a Spawn: a shockwave ring and radiating sparkles. */
export const SpawnBurst: React.FC<SpawnBurstProps> = ({ x, y, width, height, progress }) => {
  const seeds = useMemo(
    () => seedCanvasParticles(CANVAS_FX_PARTICLES.spawn, 'spawn'),
    []
  );

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const origin = { x: centerX, y: centerY, width, height };
  const ring = spawnRingAt(progress);

  return (
    <g className="spawn-burst-group" pointerEvents="none">
      {ring.opacity > 0 && (
        <circle
          cx={centerX}
          cy={centerY}
          r={Math.max(width, height) * ring.scale}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={3}
          opacity={ring.opacity}
          style={{ filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.8))' }}
        />
      )}

      {seeds.map((seed, i) => {
        const frame = canvasParticleAt(seed, progress, origin);
        if (frame.opacity <= 0 || frame.r <= 0) return null;
        return (
          <circle
            key={i}
            cx={frame.x}
            cy={frame.y}
            r={frame.r}
            fill={CANVAS_FX_COLORS.spawn[i % CANVAS_FX_COLORS.spawn.length]}
            opacity={frame.opacity}
            style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}
          />
        );
      })}
    </g>
  );
};
