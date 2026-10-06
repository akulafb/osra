import { describe, it, expect } from 'vitest';
import {
  otherParentChoice,
  otherParentChoiceKey,
  resolveOtherParent,
  stillOfferedOtherParent,
} from './otherParent';
import type { FamilyLink } from '../types/graph';

const marriage = (a: string, b: string): FamilyLink => ({ source: a, target: b, type: 'marriage' });
const divorce = (a: string, b: string): FamilyLink => ({ source: a, target: b, type: 'divorce' });
const parent = (p: string, c: string): FamilyLink => ({ source: p, target: c, type: 'parent' });

describe('otherParentChoice', () => {
  it('offers no other parent when the parent has no spouse', () => {
    const links = [parent('walid', 'sami')];
    expect(otherParentChoice('walid', links)).toEqual({ kind: 'none' });
  });

  it('links the only spouse of a father without asking', () => {
    const links = [marriage('fadi', 'ebtisam')];
    expect(otherParentChoice('fadi', links)).toEqual({ kind: 'one', personId: 'ebtisam' });
  });

  it('links the only spouse of a mother without asking, whichever way the marriage was recorded', () => {
    const links = [marriage('yusuf', 'huda')];
    expect(otherParentChoice('huda', links)).toEqual({ kind: 'one', personId: 'yusuf' });
  });

  it('links an only spouse who is a former spouse without asking', () => {
    const links = [divorce('hala', 'hisham')];
    expect(otherParentChoice('hisham', links)).toEqual({ kind: 'one', personId: 'hala' });
  });

  it('asks when the parent has had more than one spouse, current spouse first and preselected', () => {
    const links = [divorce('karim', 'mona'), marriage('rasha', 'karim')];
    expect(otherParentChoice('karim', links)).toEqual({
      kind: 'choose',
      candidates: [
        { personId: 'rasha', current: true },
        { personId: 'mona', current: false },
      ],
      preselectedId: 'rasha',
    });
  });

  it('asks a mother with two former husbands, with nothing preselected', () => {
    const links = [divorce('hala', 'hisham'), divorce('omar', 'hala')];
    expect(otherParentChoice('hala', links)).toEqual({
      kind: 'choose',
      candidates: [
        { personId: 'hisham', current: false },
        { personId: 'omar', current: false },
      ],
      preselectedId: null,
    });
  });

  it('counts a spouse with both a marriage and a divorce link as former', () => {
    const links = [marriage('karim', 'mona'), divorce('karim', 'mona'), marriage('karim', 'rasha')];
    const choice = otherParentChoice('karim', links);
    expect(choice).toEqual({
      kind: 'choose',
      candidates: [
        { personId: 'rasha', current: true },
        { personId: 'mona', current: false },
      ],
      preselectedId: 'rasha',
    });
  });

  it('offers no other parent for an existing child who already has another parent', () => {
    const links = [marriage('fadi', 'ebtisam'), parent('ebtisam', 'celine')];
    expect(otherParentChoice('fadi', links, 'celine')).toEqual({ kind: 'none' });
  });

  it('still offers the spouse for an existing child linked only to this parent', () => {
    const links = [marriage('fadi', 'ebtisam'), parent('fadi', 'ali')];
    expect(otherParentChoice('fadi', links, 'ali')).toEqual({ kind: 'one', personId: 'ebtisam' });
  });

  it('never offers the child as its own parent', () => {
    const links = [marriage('fadi', 'ebtisam'), marriage('fadi', 'ali')];
    expect(otherParentChoice('fadi', links, 'ali')).toEqual({ kind: 'one', personId: 'ebtisam' });
  });
});

describe('resolveOtherParent', () => {
  const choose = otherParentChoice('karim', [marriage('karim', 'rasha'), divorce('karim', 'mona')]);

  it('is nobody when there is no other parent', () => {
    expect(resolveOtherParent({ kind: 'none' }, 'anyone')).toBeNull();
  });

  it('is the only spouse whatever was picked', () => {
    expect(resolveOtherParent({ kind: 'one', personId: 'ebtisam' }, undefined)).toBe('ebtisam');
  });

  it('is the picked candidate', () => {
    expect(resolveOtherParent(choose, 'mona')).toBe('mona');
  });

  it('is nobody for "Not known"', () => {
    expect(resolveOtherParent(choose, null)).toBeNull();
  });

  it('is nobody when the pick is not one of the candidates', () => {
    expect(resolveOtherParent(choose, 'huda')).toBeNull();
  });
});

describe('otherParentChoiceKey', () => {
  const karimLinks = [marriage('karim', 'rasha'), divorce('karim', 'mona')];

  it('is the same for a choice recomputed after an unrelated write', () => {
    const before = otherParentChoice('karim', karimLinks);
    const after = otherParentChoice('karim', [...karimLinks, parent('karim', 'jad'), marriage('fadi', 'ebtisam')]);
    expect(after).not.toBe(before);
    expect(otherParentChoiceKey(after)).toBe(otherParentChoiceKey(before));
  });

  it('changes when the candidates change', () => {
    const before = otherParentChoice('karim', karimLinks);
    const after = otherParentChoice('karim', [...karimLinks, marriage('karim', 'huda')]);
    expect(otherParentChoiceKey(after)).not.toBe(otherParentChoiceKey(before));
  });

  it('changes when the candidates are reordered', () => {
    const before = otherParentChoice('karim', karimLinks);
    const after = otherParentChoice('karim', [marriage('karim', 'mona'), divorce('karim', 'rasha')]);
    expect(otherParentChoiceKey(after)).not.toBe(otherParentChoiceKey(before));
  });

  it('tells the kinds apart', () => {
    const keys = [
      otherParentChoiceKey({ kind: 'none' }),
      otherParentChoiceKey({ kind: 'one', personId: 'rasha' }),
      otherParentChoiceKey({ kind: 'choose', candidates: [{ personId: 'rasha', current: true }], preselectedId: 'rasha' }),
    ];
    expect(new Set(keys).size).toBe(3);
  });
});

describe('stillOfferedOtherParent', () => {
  const choose = otherParentChoice('karim', [marriage('karim', 'rasha'), divorce('karim', 'mona')]);

  it('is nobody when the choice offers nobody', () => {
    expect(stillOfferedOtherParent({ kind: 'none' }, 'ebtisam')).toBeNull();
  });

  it('is the only spouse when that is who was sent', () => {
    expect(stillOfferedOtherParent({ kind: 'one', personId: 'ebtisam' }, 'ebtisam')).toBe('ebtisam');
  });

  it('is nobody when the form sent nobody, even with one spouse on offer now', () => {
    expect(stillOfferedOtherParent({ kind: 'one', personId: 'ebtisam' }, null)).toBeNull();
  });

  it('is a candidate that was sent', () => {
    expect(stillOfferedOtherParent(choose, 'mona')).toBe('mona');
  });

  it('is nobody for a stale pick the choice no longer offers', () => {
    expect(stillOfferedOtherParent(choose, 'huda')).toBeNull();
    expect(stillOfferedOtherParent({ kind: 'one', personId: 'rasha' }, 'mona')).toBeNull();
  });

  it('is nobody for "Not known"', () => {
    expect(stillOfferedOtherParent(choose, null)).toBeNull();
    expect(stillOfferedOtherParent(choose, undefined)).toBeNull();
  });
});
