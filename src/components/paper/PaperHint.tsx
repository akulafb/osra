import { useEffect, useRef, useState } from 'react';
import { pairVar } from '../../theme/paperPair';
import { paperHintCopy, readPaperHintSeen, writePaperHintSeen } from '../../lib/paperIntro';

const FADE_MS = 400;
const HOLD_MS = 3200;

const storage = () => window.localStorage;

/** The one-time controls hint: a pill at the bottom of the scene that fades in, holds and fades out, and never shows again. */
export function PaperHint() {
  const [show] = useState(() => !readPaperHintSeen(storage));
  const [copy] = useState(() => paperHintCopy(window.matchMedia?.('(pointer: coarse)').matches ?? false));
  const [gone, setGone] = useState(false);
  const pill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !pill.current) return;
    writePaperHintSeen(storage);
    const total = FADE_MS * 2 + HOLD_MS;
    const fade = pill.current.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 8px)' },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: FADE_MS / total },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: (FADE_MS + HOLD_MS) / total },
        { opacity: 0, transform: 'translate(-50%, 0)' },
      ],
      { duration: total, easing: 'ease-out', fill: 'forwards' }
    );
    fade.finished.then(() => setGone(true)).catch(() => undefined);
    return () => fade.cancel();
  }, [show]);

  if (!show || gone) return null;
  return (
    <div
      ref={pill}
      role="note"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 'max(28px, env(safe-area-inset-bottom))',
        transform: 'translate(-50%, 0)',
        opacity: 0,
        zIndex: 900,
        padding: '8px 16px',
        borderRadius: 999,
        background: pairVar('paper', 0.85),
        border: `1px solid ${pairVar('ink', 0.12)}`,
        color: pairVar('ink', 0.75),
        fontSize: 13,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {copy}
    </div>
  );
}
