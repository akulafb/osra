import React from 'react';
import { Link2D } from '../types/graph';
import { getClusterColor } from '../utils/familyColors';
import { LifecycleController, useLifecycleProgress } from '../hooks/useLifecycles';
import { linkInLifecycle, LifecycleSubject } from '../lib/lifecycle';
import { isPulsingLink } from '../utils/cosmicFx';
import { linkGrowthAt } from '../utils/canvasFx';

interface OrthogonalLinksProps {
  links: Link2D[];
  activePreset?: string | null;
  /**
   * Spawn and Dissolve for Kinship Links. The 2D rendering of a link Spawn is
   * path growth; the 3D one is a beam pulse (LIN-55). Same lifecycle.
   */
  lifecycles: LifecycleController;
}

export const OrthogonalLinks: React.FC<OrthogonalLinksProps> = ({
  links,
  activePreset,
  lifecycles,
}) => {
  const spawning = linkInLifecycle(lifecycles.lifecycles, 'spawn');
  const dissolving = linkInLifecycle(lifecycles.lifecycles, 'dissolve');

  const spawnSubject: LifecycleSubject | null = spawning ? { kind: 'link', ...spawning } : null;
  const dissolveSubject: LifecycleSubject | null = dissolving
    ? { kind: 'link', ...dissolving }
    : null;

  const spawnProgress = useLifecycleProgress(lifecycles, 'spawn', spawnSubject);
  const dissolveProgress = useLifecycleProgress(lifecycles, 'dissolve', dissolveSubject);

  return (
    <g className="links-layer">
      {links.map((link, index) => {
        const isInActiveCluster = activePreset &&
          (link.source.familyCluster === activePreset || link.source.maternalFamilyCluster === activePreset) &&
          (link.target.familyCluster === activePreset || link.target.maternalFamilyCluster === activePreset);

        const isMarriage = link.type === 'marriage';
        const isDivorce = link.type === 'divorce';

        // Marriage links are gold, divorce links are gray, parent links use family color or blue
        const baseColor = isMarriage
          ? '#f59e0b'
          : (isDivorce ? '#9ca3af' : getClusterColor(link.source.familyCluster, '#60a5fa'));

        const strokeWidth = (isMarriage || isDivorce) ? 2.5 : 1.5;
        const opacity = (isMarriage || isDivorce) ? 0.8 : 0.6;

        // Dim links not in the active preset
        const finalOpacity = activePreset && !isInActiveCluster && !isMarriage && !isDivorce
          ? 0.15
          : opacity;

        const endpoints = { aId: link.source.id, bId: link.target.id };
        const isSpawning = spawnProgress !== null && isPulsingLink(endpoints, spawning);
        const isDissolving = dissolveProgress !== null && isPulsingLink(endpoints, dissolving);
        const growth = isSpawning ? linkGrowthAt(spawnProgress) : null;

        return (
          <path
            key={`${link.source.id}-${link.target.id}-${index}`}
            d={link.path}
            stroke={baseColor}
            strokeWidth={growth ? strokeWidth + growth.glow * 2 : strokeWidth}
            fill="none"
            opacity={isDissolving ? finalOpacity * (1 - dissolveProgress) : finalOpacity}
            // `pathLength` normalizes the path to 1, so growth is a fraction
            // rather than a guess at how long the orthogonal route happens to be.
            pathLength={growth ? 1 : undefined}
            strokeDasharray={growth ? '1 1' : isDivorce ? '5,5' : 'none'}
            strokeDashoffset={growth ? 1 - growth.drawn : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: growth ? 'none' : 'opacity 0.3s ease',
              filter: growth && growth.glow > 0
                ? `drop-shadow(0 0 ${growth.glow * 6}px ${baseColor})`
                : undefined,
            }}
          />
        );
      })}
    </g>
  );
};

export default React.memo(OrthogonalLinks);
