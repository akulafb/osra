import React, { useEffect, useState } from 'react';

interface Sparkle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  decay: number;
}

export interface SpawnBurstProps {
  x: number;
  y: number;
  width: number;
  height: number;
  onComplete?: () => void;
}

const SPAWN_COLORS = [
  '#38bdf8', // sky blue
  '#818cf8', // indigo
  '#c084fc', // purple
  '#f472b6', // pink
  '#fef08a', // gold
  '#4ade80', // green
];

export const SpawnBurst: React.FC<SpawnBurstProps> = ({
  x,
  y,
  width,
  height,
  onComplete,
}) => {
  const [ringScale, setRingScale] = useState(0.2);
  const [ringOpacity, setRingOpacity] = useState(1);
  const [sparkles, setSparkles] = useState<Sparkle[]>(() => {
    const count = 28;
    const items: Sparkle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 4.5;
      items.push({
        id: i,
        x: x + width / 2,
        y: y + height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5 + Math.random() * 3.5,
        color: SPAWN_COLORS[i % SPAWN_COLORS.length],
        opacity: 1,
        decay: 0.025 + Math.random() * 0.02,
      });
    }
    return items;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setRingScale((s) => s + 0.08);
      setRingOpacity((o) => Math.max(0, o - 0.04));

      setSparkles((prev) => {
        const next = prev
          .map((s) => ({
            ...s,
            x: s.x + s.vx,
            y: s.y + s.vy,
            opacity: s.opacity - s.decay,
            size: Math.max(0, s.size - 0.06),
          }))
          .filter((s) => s.opacity > 0 && s.size > 0);

        if (next.length === 0) {
          clearInterval(interval);
          onComplete?.();
        }
        return next;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [onComplete]);

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return (
    <g className="spawn-burst-group" pointerEvents="none">
      {/* Expanding shockwave glow ring */}
      {ringOpacity > 0 && (
        <circle
          cx={centerX}
          cy={centerY}
          r={Math.max(width, height) * ringScale}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={3}
          opacity={ringOpacity}
          style={{
            filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.8))',
          }}
        />
      )}

      {/* Radiating sparkles */}
      {sparkles.map((s) => (
        <circle
          key={s.id}
          cx={s.x}
          cy={s.y}
          r={s.size}
          fill={s.color}
          opacity={s.opacity}
          style={{
            filter: 'drop-shadow(0 0 5px currentColor)',
          }}
        />
      ))}
    </g>
  );
};
