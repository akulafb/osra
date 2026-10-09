import { useEffect, useLayoutEffect, useRef } from 'react';
import { GRAYSCALE_PAIR } from '../../theme/paperPair';
import { paperTitleStartedAt, swapPaperLoaderShare } from './paperIntroSession';

export type PaperLoaderStage = 'record' | 'layout' | 'scene' | 'done';

const STAGE_SHARE: Record<PaperLoaderStage, number> = { record: 0.3, layout: 0.6, scene: 0.85, done: 1 };

const TITLE_LINES = [
  [{ text: 'OSRA', index: 0 }],
  [
    { text: 'FAMILY', index: 1 },
    { text: 'TREE', index: 2 },
  ],
];
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const RISE_MS = 800;
const WORD_STAGGER_MS = 120;
const FALL_MS = 500;
const BAR_MS = 600;
const BAR_WIDTH_PX = 208;
/** One above FamilyChat's button, the highest control on the page. */
const LOADER_Z_INDEX = 10001;

const { paper, ink } = GRAYSCALE_PAIR;

interface PaperLoaderProps {
  stage: PaperLoaderStage;
  /** Once the title has risen, the words fall and the loader fades into the scene. */
  leaving?: boolean;
  onLeave?: () => void;
}

/**
 * Paper's opening loader: grey paper with the title rising word by word over
 * a thin progress bar. Mounted again by the scene, it carries on where the
 * loading screen's title had got to.
 */
export function PaperLoader({ stage, leaving = false, onLeave }: PaperLoaderProps) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);
  const rises = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const now = performance.now();
    const elapsed = now - paperTitleStartedAt(now);
    rises.current = words.current.map((word, i) => {
      const rise = word.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
        duration: RISE_MS,
        delay: i * WORD_STAGGER_MS,
        easing: EASE_OUT,
        fill: 'backwards',
      });
      rise.currentTime = elapsed;
      return rise;
    });
    return () => rises.current.forEach((rise) => rise.cancel());
  }, []);

  const share = STAGE_SHARE[stage];
  useLayoutEffect(() => {
    const from = swapPaperLoaderShare(share);
    const fill = bar.current?.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${share})` }], {
      duration: BAR_MS,
      easing: EASE_OUT,
      fill: 'forwards',
    });
    return () => fill?.cancel();
  }, [share]);

  const leave = useRef(onLeave);
  leave.current = onLeave;
  useEffect(() => {
    if (!leaving) return;
    let cancelled = false;
    const falls: Animation[] = [];
    void Promise.all(rises.current.map((rise) => rise.finished.catch(() => undefined))).then(() => {
      if (cancelled || !root.current) return;
      for (const word of words.current) {
        falls.push(word.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(110%)' }], { duration: FALL_MS, easing: 'ease-in', fill: 'forwards' }));
      }
      falls.push(root.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FALL_MS, fill: 'forwards' }));
      leave.current?.();
    });
    return () => {
      cancelled = true;
      falls.forEach((fall) => fall.cancel());
    };
  }, [leaving]);

  return (
    <div
      ref={root}
      role="status"
      aria-label="Loading"
      aria-busy={!leaving}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: LOADER_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: paper,
        color: ink,
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 'clamp(36px, 4vw, 56px)',
          lineHeight: 1.02,
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        {TITLE_LINES.map((line) => (
          <div key={line[0].index}>
            {line.map(({ text, index }, i) => (
              <span key={index} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', marginLeft: i > 0 ? '0.25em' : 0 }}>
                <span
                  ref={(word) => {
                    if (word) words.current[index] = word;
                  }}
                  style={{ display: 'inline-block' }}
                >
                  {text}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ width: BAR_WIDTH_PX, height: 2, marginTop: 22, background: `${ink}1f` }}>
        <div ref={bar} style={{ height: '100%', background: ink, transformOrigin: 'left', transform: `scaleX(${share})` }} />
      </div>
    </div>
  );
}
