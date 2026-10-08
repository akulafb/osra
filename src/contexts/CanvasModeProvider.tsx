import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import {
  CanvasModeContext,
  CurrentPaperPairContext,
  readStoredCanvasMode,
  writeStoredCanvasMode,
  type CurrentPaperPair,
} from '../hooks/useCanvasMode';
import type { CanvasMode } from '../lib/canvasMode';
import { createPaperTheme, osraTheme } from '../theme/osraTheme';
import { GRAYSCALE_PAIR } from '../theme/paperPair';

const grayscale: CurrentPaperPair = { pair: GRAYSCALE_PAIR };

/** Holds the viewer's Canvas Mode and themes everything inside it to match. */
export function CanvasModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readStoredCanvasMode);

  const setMode = useCallback((mode: CanvasMode) => {
    setPreference((current) => ({ ...current, mode }));
    writeStoredCanvasMode(mode);
  }, []);

  const controller = useMemo(() => ({ ...preference, setMode }), [preference, setMode]);
  const theme = useMemo(
    () => (preference.mode === 'paper' ? createPaperTheme(grayscale.pair) : osraTheme),
    [preference.mode]
  );

  return (
    <CanvasModeContext.Provider value={controller}>
      <CurrentPaperPairContext.Provider value={grayscale}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </CurrentPaperPairContext.Provider>
    </CanvasModeContext.Provider>
  );
}
