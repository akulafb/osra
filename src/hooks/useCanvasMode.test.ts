import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { PAPER_COLOUR_STORAGE_KEY } from '../lib/canvasMode';
import { PAPER_PAIRS } from '../theme/paperPair';
import {
  readLastOverviewPair,
  readStoredCanvasMode,
  writeLastOverviewPair,
  writeStoredPaperColour,
} from './useCanvasMode';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
  };
}

let local: ReturnType<typeof memoryStorage>;
let session: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  local = memoryStorage();
  session = memoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
});

afterEach(() => vi.unstubAllGlobals());

describe('Paper colour setting', () => {
  it('starts in grayscale and reading it writes nothing', () => {
    expect(readStoredCanvasMode().paperColour).toBe('grayscale');
    readStoredCanvasMode();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it('is written by the colour button and read back after a reload', () => {
    writeStoredPaperColour('colour');
    expect(local.setItem).toHaveBeenCalledWith(PAPER_COLOUR_STORAGE_KEY, 'colour');
    expect(readStoredCanvasMode().paperColour).toBe('colour');

    writeStoredPaperColour('grayscale');
    expect(readStoredCanvasMode().paperColour).toBe('grayscale');
  });
});

describe('last overview pair', () => {
  it('is remembered for the tab so the next load can avoid it', () => {
    expect(readLastOverviewPair()).toBeNull();
    writeLastOverviewPair(PAPER_PAIRS[3]);
    expect(readLastOverviewPair()).toBe(PAPER_PAIRS[3]);
    expect(local.setItem).not.toHaveBeenCalled();
  });
});
