/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * Floating variant switcher. Dev-only; never renders in a production build.
 */
import React, { useEffect } from 'react';

export interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
  /** Extra controls rendered to the right of the arrows (e.g. a freeze toggle). */
  children?: React.ReactNode;
}

export const PrototypeSwitcher: React.FC<PrototypeSwitcherProps> = ({
  variants,
  current,
  onChange,
  children,
}) => {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  const cycle = React.useCallback(
    (delta: number) => {
      const next = (index + delta + variants.length) % variants.length;
      onChange(variants[next].key);
    },
    [index, variants, onChange]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;

      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycle]);

  if (!import.meta.env.DEV) return null;

  const arrowStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#0f172a',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: '2px 8px',
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: '#fef08a',
        border: '2px solid #0f172a',
        borderRadius: 999,
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        fontWeight: 700,
        color: '#0f172a',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ opacity: 0.55, paddingRight: 2 }}>PROTOTYPE</span>
      <button type="button" style={arrowStyle} onClick={() => cycle(-1)} title="Previous (←)">
        ‹
      </button>
      <span style={{ minWidth: 210, textAlign: 'center' }}>
        {variants[index].key} — {variants[index].name}
      </span>
      <button type="button" style={arrowStyle} onClick={() => cycle(1)} title="Next (→)">
        ›
      </button>
      {children}
    </div>
  );
};
