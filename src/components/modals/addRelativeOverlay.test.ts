import { describe, it, expect } from 'vitest';
import { osraTheme, createPaperTheme } from '../../theme/osraTheme';
import { GRAYSCALE_PAIR } from '../../theme/paperPair';
import { addRelativeOverlayStyle } from './addRelativeOverlay';

const themes = [
  ['Cosmos', osraTheme],
  ['Paper', createPaperTheme(GRAYSCALE_PAIR)],
] as const;

describe.each(themes)('Add Relative overlay in %s', (_mode, theme) => {
  it.each([false, true])(
    'leaves the connect preview behind it sharp (narrow: %s)',
    (previewNarrow) => {
      const style = addRelativeOverlayStyle(theme, { previewConnect: true, previewNarrow });
      expect(style.backdropFilter ?? 'none').toBe('none');
      expect(style.backgroundColor).toBe('transparent');
    }
  );

  it('keeps the blurred scrim outside preview mode', () => {
    const style = addRelativeOverlayStyle(theme, { previewConnect: false, previewNarrow: false });
    expect(style.backdropFilter).toBe('blur(8px)');
    expect(style.backgroundColor).toBe(theme.palette.modal.scrim);
  });
});
