import { describe, it, expect } from 'vitest';
import type { Emphasis } from '../../lib/focusEmphasis';
import type { PaperLine } from '../../lib/paperLayout';
import { emptyEmphasisState, lineEndInks } from './paperEmphasis';

function stateWith(entries: [string, Emphasis][]) {
  return { ...emptyEmphasisState(), emphasis: new Map(entries) };
}

const line = { sourceId: 'ghost', targetId: 'relative', type: 'parent' } as PaperLine;

describe('lineEndInks', () => {
  it('gives each end of a line its own Person’s ink, so a faint line darkens into a dark disc', () => {
    expect(lineEndInks(stateWith([['ghost', 'ghost'], ['relative', 'relative']]), line)).toEqual([0.2, 1]);
  });

  it('keeps full ink at both ends when nobody is emphasised', () => {
    expect(lineEndInks(emptyEmphasisState(), line)).toEqual([1, 1]);
  });

  it('fades a hover-dimmed end and keeps the hovered end', () => {
    expect(lineEndInks(stateWith([['ghost', 'dimmed'], ['relative', 'hovered']]), line)).toEqual([0.5, 1]);
  });
});
