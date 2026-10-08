import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import {
  CanvasModeContext,
  CurrentPaperPairContext,
  readLastOverviewPair,
  readStoredCanvasMode,
  writeLastOverviewPair,
  writeStoredCanvasMode,
  writeStoredPaperColour,
  type CurrentPaperPair,
  type FocusedPerson,
} from '../hooks/useCanvasMode';
import type { CanvasMode, PaperColour } from '../lib/canvasMode';
import { drawOverviewPair, pairAt, pairForFamily } from '../lib/paperPairs';
import { createPaperTheme, osraTheme } from '../theme/osraTheme';
import { GRAYSCALE_PAIR, PAIR_CSS_VARS, pairCssValues, type PaperPair } from '../theme/paperPair';

function writePairVars(pair: PaperPair) {
  const { style } = document.documentElement;
  for (const [name, value] of Object.entries(pairCssValues(pair))) style.setProperty(name, value);
}

export function CanvasModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readStoredCanvasMode);
  const [overview, setOverview] = useState(() => drawOverviewPair(readLastOverviewPair()));
  const [focused, setFocused] = useState<FocusedPerson | null>(null);
  const focusedRef = useRef<FocusedPerson | null>(null);

  const setMode = useCallback((mode: CanvasMode) => {
    setPreference((current) => ({ ...current, mode }));
    writeStoredCanvasMode(mode);
  }, []);

  const setPaperColour = useCallback((paperColour: PaperColour) => {
    setPreference((current) => ({ ...current, paperColour }));
    writeStoredPaperColour(paperColour);
  }, []);

  const setFocusedPerson = useCallback((person: FocusedPerson | null) => {
    if (focusedRef.current && !person) setOverview((previous) => drawOverviewPair(previous));
    focusedRef.current = person;
    setFocused(person);
  }, []);

  useEffect(() => writeLastOverviewPair(overview), [overview]);

  const target = useMemo(() => {
    if (preference.paperColour === 'grayscale') return GRAYSCALE_PAIR;
    return focused?.familyCluster ? pairForFamily(focused.familyCluster) : overview;
  }, [preference.paperColour, focused, overview]);

  const [live, setLive] = useState(target);
  const liveRef = useRef(target);

  useLayoutEffect(
    () => () => {
      for (const name of Object.values(PAIR_CSS_VARS)) document.documentElement.style.removeProperty(name);
    },
    []
  );

  useLayoutEffect(() => {
    const fade = { from: liveRef.current, to: target, startedAt: performance.now() };
    if (fade.from === target) {
      writePairVars(target);
      return;
    }
    let frame = 0;
    const step = (now: number) => {
      const pair = pairAt(fade, now);
      liveRef.current = pair;
      writePairVars(pair);
      setLive(pair);
      if (pair !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const controller = useMemo(
    () => ({ ...preference, setMode, setPaperColour, setFocusedPerson }),
    [preference, setMode, setPaperColour, setFocusedPerson]
  );
  const currentPaperPair = useMemo<CurrentPaperPair>(() => ({ pair: live, target }), [live, target]);
  const theme = useMemo(
    () => (preference.mode === 'paper' ? createPaperTheme(target) : osraTheme),
    [preference.mode, target]
  );

  return (
    <CanvasModeContext.Provider value={controller}>
      <CurrentPaperPairContext.Provider value={currentPaperPair}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </CurrentPaperPairContext.Provider>
    </CanvasModeContext.Provider>
  );
}
