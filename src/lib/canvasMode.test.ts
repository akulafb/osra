import { describe, it, expect } from 'vitest';
import { resolveCanvasMode } from './canvasMode';

const nothingStored = { mode: null, paperColour: null };

describe('resolveCanvasMode', () => {
  it('lands on grayscale Paper when nothing is stored', () => {
    expect(resolveCanvasMode(nothingStored)).toEqual({ mode: 'paper', paperColour: 'grayscale' });
  });

  it.each(['deep-space', 'wax-white', 'smooth-sepia', 'baby-blue'])(
    'lands on Paper for the retired background theme %s',
    (retired) => {
      expect(resolveCanvasMode({ mode: retired, paperColour: null }).mode).toBe('paper');
    }
  );

  it('lands on Paper for an unknown stored value', () => {
    expect(resolveCanvasMode({ mode: 'neon', paperColour: null }).mode).toBe('paper');
  });

  it('keeps an explicit Cosmos choice', () => {
    expect(resolveCanvasMode({ mode: 'cosmos', paperColour: null }).mode).toBe('cosmos');
  });

  it('keeps an explicit Paper choice', () => {
    expect(resolveCanvasMode({ mode: 'paper', paperColour: null }).mode).toBe('paper');
  });

  it('defaults the Paper colour setting to grayscale', () => {
    expect(resolveCanvasMode({ mode: 'paper', paperColour: 'sepia' }).paperColour).toBe('grayscale');
  });

  it('keeps an explicit colour choice', () => {
    expect(resolveCanvasMode({ mode: null, paperColour: 'colour' }).paperColour).toBe('colour');
  });

  it('keeps the colour setting while in Cosmos', () => {
    expect(resolveCanvasMode({ mode: 'cosmos', paperColour: 'colour' })).toEqual({
      mode: 'cosmos',
      paperColour: 'colour',
    });
  });
});
