import { describe, it, expect } from 'vitest';
import type { FamilyLink } from '../types/graph';
import { focusEmphasis } from '../lib/focusEmphasis';
import { PAPER_2D_OPACITY } from './paper2D';

const links = [{ source: 'mother', target: 'son', type: 'parent' }] as FamilyLink[];
const personIds = ['mother', 'son', 'cousin', 'aunt'];
const searchMatchIds = new Set(['mother', 'cousin']);

function opacityOf(input: { hoveredId: string | null; focusedId: string | null }) {
  const emphasis = focusEmphasis({ personIds, links, searchMatchIds, ...input });
  return (id: string) => PAPER_2D_OPACITY[emphasis.get(id)!];
}

describe('PAPER_2D_OPACITY during a search', () => {
  it('draws no non-match as bright as a match, with a Person selected', () => {
    const opacity = opacityOf({ hoveredId: null, focusedId: 'mother' });
    expect(Math.max(opacity('son'), opacity('aunt'))).toBeLessThan(opacity('cousin'));
  });

  it('draws no non-match as bright as a match, with a Person hovered', () => {
    const opacity = opacityOf({ hoveredId: 'mother', focusedId: null });
    expect(Math.max(opacity('son'), opacity('aunt'))).toBeLessThan(opacity('cousin'));
  });
});
