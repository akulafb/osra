import { describe, it, expect } from 'vitest';
import type { FamilyLink } from '../types/graph';
import { focusEmphasis, type FocusEmphasisInput } from './focusEmphasis';

// Grandpa + Grandma -> Dad (married Mum, once married Ex) -> Kid and Kid's sister Sis.
// Stranger has no links at all.
const personIds = ['grandpa', 'grandma', 'dad', 'mum', 'ex', 'kid', 'sis', 'stranger'];
const links: FamilyLink[] = [
  { source: 'grandpa', target: 'grandma', type: 'marriage' },
  { source: 'grandpa', target: 'dad', type: 'parent' },
  { source: 'grandma', target: 'dad', type: 'parent' },
  { source: 'dad', target: 'mum', type: 'marriage' },
  { source: 'dad', target: 'ex', type: 'divorce' },
  { source: 'dad', target: 'kid', type: 'parent' },
  { source: 'mum', target: 'kid', type: 'parent' },
  { source: 'dad', target: 'sis', type: 'parent' },
  { source: 'mum', target: 'sis', type: 'parent' },
];

const rest: FocusEmphasisInput = {
  personIds,
  links,
  hoveredId: null,
  focusedId: null,
  searchMatchIds: null,
};

const asObject = (input: FocusEmphasisInput) => Object.fromEntries(focusEmphasis(input));

describe('focusEmphasis', () => {
  it('leaves everyone normal when nobody is hovered or focused', () => {
    expect(new Set(focusEmphasis(rest).values())).toEqual(new Set(['normal']));
    expect(focusEmphasis(rest).size).toBe(personIds.length);
  });

  it('marks the hovered Person, their direct Kinship Link neighbours as relatives, and dims the rest', () => {
    expect(asObject({ ...rest, hoveredId: 'dad' })).toEqual({
      dad: 'hovered',
      grandpa: 'relative',
      grandma: 'relative',
      mum: 'relative',
      ex: 'relative',
      kid: 'relative',
      sis: 'relative',
      stranger: 'dimmed',
    });
  });

  it('counts only direct links as relatives, so siblings and grandparents are dimmed on hover', () => {
    const emphasis = focusEmphasis({ ...rest, hoveredId: 'kid' });
    expect(emphasis.get('dad')).toBe('relative');
    expect(emphasis.get('mum')).toBe('relative');
    expect(emphasis.get('sis')).toBe('dimmed');
    expect(emphasis.get('grandpa')).toBe('dimmed');
  });

  it('ghosts everyone outside the focused Person and their relatives', () => {
    expect(asObject({ ...rest, focusedId: 'kid' })).toEqual({
      kid: 'focused',
      dad: 'relative',
      mum: 'relative',
      grandpa: 'ghost',
      grandma: 'ghost',
      ex: 'ghost',
      sis: 'ghost',
      stranger: 'ghost',
    });
  });

  it('lets focus decide emphasis while another Person is hovered', () => {
    expect(focusEmphasis({ ...rest, focusedId: 'kid', hoveredId: 'stranger' })).toEqual(
      focusEmphasis({ ...rest, focusedId: 'kid' })
    );
  });

  it('hides search non-matches and leaves matches normal', () => {
    expect(asObject({ ...rest, searchMatchIds: new Set(['kid', 'sis']) })).toEqual({
      grandpa: 'hidden',
      grandma: 'hidden',
      dad: 'hidden',
      mum: 'hidden',
      ex: 'hidden',
      kid: 'normal',
      sis: 'normal',
      stranger: 'hidden',
    });
  });

  it('hides search non-matches even when they are relatives of the focused Person', () => {
    const emphasis = focusEmphasis({ ...rest, focusedId: 'kid', searchMatchIds: new Set(['kid', 'sis']) });
    expect(emphasis.get('kid')).toBe('focused');
    expect(emphasis.get('dad')).toBe('hidden');
    expect(emphasis.get('sis')).toBe('ghost');
  });

  it('hides everyone when a search matches nobody', () => {
    expect(new Set(focusEmphasis({ ...rest, searchMatchIds: new Set() }).values())).toEqual(new Set(['hidden']));
  });

  it('resolves links whose endpoints are node objects', () => {
    const objectLinks: FamilyLink[] = [
      { source: { id: 'dad', name: 'Dad' } as never, target: { id: 'kid', name: 'Kid' } as never, type: 'parent' },
    ];
    const emphasis = focusEmphasis({ ...rest, links: objectLinks, hoveredId: 'kid' });
    expect(emphasis.get('dad')).toBe('relative');
  });

  it('ignores a hovered or focused id that is not in the graph', () => {
    expect(focusEmphasis({ ...rest, hoveredId: 'nobody' })).toEqual(focusEmphasis(rest));
    expect(focusEmphasis({ ...rest, focusedId: 'nobody' })).toEqual(focusEmphasis(rest));
  });
});
