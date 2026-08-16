import React, { useEffect, useState } from 'react';

interface Particle {
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

export interface ParticleDissolveProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  onComplete?: () => void;
}

const DISSOLVE_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#c084fc', // purple
  '#60a5fa', // blue
  '#ffffff', // white glow
];

export const ParticleDissolve: React.FC<ParticleDissolveProps> = ({
  x,
  y,
  width,
  height,
  color,
  onComplete,
}) => {
  const [particles, setParticles] = useState<Particle[]>(() => {
    const count = 32;
    const items: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      items.push({
        id: i,
        x: x + (Math.random() - 0.5) * width,
        y: y + (Math.random() - 0.5) * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.8, // slight upward drift
        size: 2.5 + Math.random() * 4,
        color: color || DISSOLVE_COLORS[i % DISSOLVE_COLORS.length],
        opacity: 1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
    return items;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) => {
        const next = prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            opacity: p.opacity - p.decay,
            size: Math.max(0, p.size - 0.08),
          }))
          .filter((p) => p.opacity > 0 && p.size > 0);

        if (next.length === 0) {
          clearInterval(interval);
          onComplete?.();
        }
        return next;
      });
    }, 16);

    return () => {
      clearInterval(interval);
    };
  }, [onComplete]);

  return (
    <g className="particle-dissolve-group" pointerEvents="none">
      {particles.map((p) => (
        <circle
          key={p.id}
          cx={p.x}
          cy={p.y}
          r={p.size}
          fill={p.color}
          opacity={p.opacity}
          style={{
            filter: 'drop-shadow(0 0 4px currentColor)',
          }}
        />
      ))}
    </g>
  );
};
