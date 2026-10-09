import { useEffect, useRef, type MutableRefObject } from 'react';
import { paperFlightKey, paperKeyAction, type PaperFlightKey, type PaperKeyAction } from '../../lib/paperKeys';

export interface PaperHeldKeys {
  keys: Set<PaperFlightKey>;
  boost: boolean;
}

interface PaperKeysOptions {
  actionsBlocked: boolean;
  flightBlocked: boolean;
  /** Returns whether it handled the key, so a key that did nothing keeps its usual effect. */
  onAction: (action: PaperKeyAction) => boolean;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);
const MODIFIERS = new Set(['Meta', 'Alt', 'Control']);

function typing(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

/** Tab and Enter belong to whatever control has focus, unless that is the page itself or the scene. */
function sceneHasFocus(): boolean {
  const el = document.activeElement;
  return !el || el === document.body || el instanceof HTMLCanvasElement;
}

/** By physical key, so a release under Option (which changes `key`) still lets go. */
function flightKeyOf(e: KeyboardEvent): PaperFlightKey | null {
  return paperFlightKey(e.code ? e.code.replace(/^Key/, '') : e.key);
}

/** Runs R, Tab, Enter and Esc as they are pressed, and returns the flight keys held down. */
export function usePaperKeys(options: PaperKeysOptions): MutableRefObject<PaperHeldKeys> {
  const held = useRef<PaperHeldKeys>({ keys: new Set(), boost: false });
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const releaseAll = () => {
      held.current.keys.clear();
      held.current.boost = false;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') held.current.boost = true;
      // A Cmd shortcut can swallow the keyup of a key held under it.
      if (MODIFIERS.has(e.key)) held.current.keys.clear();
      if (typing()) return;
      const { actionsBlocked, flightBlocked, onAction } = latest.current;
      const flight = flightKeyOf(e);
      if (flight) {
        if (!flightBlocked && !e.ctrlKey && !e.metaKey && !e.altKey) held.current.keys.add(flight);
        return;
      }
      if (actionsBlocked) return;
      const action = paperKeyAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
      if (!action) return;
      if ((action === 'cycle-next' || action === 'cycle-previous' || action === 'focus') && !sceneHasFocus()) return;
      if (onAction(action)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') held.current.boost = false;
      const flight = flightKeyOf(e);
      if (flight) held.current.keys.delete(flight);
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
