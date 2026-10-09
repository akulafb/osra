import { useEffect, useRef, type MutableRefObject } from 'react';
import { paperFlightKey, paperKeyAction, type PaperFlightKey, type PaperKeyAction } from '../../lib/paperKeys';

export interface PaperHeldKeys {
  keys: Set<PaperFlightKey>;
  boost: boolean;
}

interface PaperKeysOptions {
  /** R, Tab, Enter and Esc do nothing while a modal is open. */
  actionsBlocked: boolean;
  /** WASD and Q/E still fly behind the Add Relative preview, as in Cosmos, but not behind the other modals. */
  flightBlocked: boolean;
  /** Returns whether it handled the key, so a key that did nothing keeps its usual effect. */
  onAction: (action: PaperKeyAction) => boolean;
}

function typing(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** The NAV CONTROLS keys: runs R, Tab, Enter and Esc as they are pressed, and returns the flight keys held down. */
export function usePaperKeys(options: PaperKeysOptions): MutableRefObject<PaperHeldKeys> {
  const held = useRef<PaperHeldKeys>({ keys: new Set(), boost: false });
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') held.current.boost = true;
      if (typing()) return;
      const { actionsBlocked, flightBlocked, onAction } = latest.current;
      const flight = paperFlightKey(e.key);
      if (flight) {
        if (!flightBlocked && !e.ctrlKey && !e.metaKey && !e.altKey) held.current.keys.add(flight);
        return;
      }
      if (actionsBlocked) return;
      const action = paperKeyAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
      if (action && onAction(action)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') held.current.boost = false;
      const flight = paperFlightKey(e.key);
      if (flight) held.current.keys.delete(flight);
    };
    const releaseAll = () => {
      held.current.keys.clear();
      held.current.boost = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);

  return held;
}
