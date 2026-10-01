import { describe, expect, it } from 'vitest';
import { bloodLabel, genderedLabel } from './kinshipTerm';

describe('bloodLabel: the Kinship Term for up `up` generations and down `down`', () => {
  it('ancestors, at any depth', () => {
    expect(bloodLabel(1, 0)).toBe('parent');
    expect(bloodLabel(2, 0)).toBe('grandparent');
    expect(bloodLabel(3, 0)).toBe('great-grandparent');
    expect(bloodLabel(4, 0)).toBe('great-great-grandparent');
    expect(bloodLabel(5, 0)).toBe('3rd great-grandparent');
  });

  it('descendants, at any depth', () => {
    expect(bloodLabel(0, 1)).toBe('child');
    expect(bloodLabel(0, 2)).toBe('grandchild');
    expect(bloodLabel(0, 3)).toBe('great-grandchild');
  });

  it('siblings, aunts and uncles, nieces and nephews', () => {
    expect(bloodLabel(1, 1)).toBe('sibling');
    expect(bloodLabel(2, 1)).toBe('aunt or uncle');
    expect(bloodLabel(3, 1)).toBe('great-aunt or great-uncle');
    expect(bloodLabel(4, 1)).toBe('great-great-aunt or great-great-uncle');
    expect(bloodLabel(1, 2)).toBe('niece or nephew');
    expect(bloodLabel(1, 3)).toBe('grandniece or grandnephew');
    expect(bloodLabel(1, 4)).toBe('great-grandniece or great-grandnephew');
  });

  it('cousins of any degree, any times removed', () => {
    expect(bloodLabel(2, 2)).toBe('first cousin');
    expect(bloodLabel(3, 2)).toBe('first cousin once removed');
    expect(bloodLabel(3, 3)).toBe('second cousin');
    expect(bloodLabel(4, 4)).toBe('third cousin');
    expect(bloodLabel(4, 6)).toBe('third cousin twice removed');
    expect(bloodLabel(2, 5)).toBe('first cousin three times removed');
  });
});

describe('genderedLabel: the gendered word, or the neutral one when gender is not recorded', () => {
  it('keeps the neutral word when the gender is unknown', () => {
    expect(genderedLabel('niece or nephew', null)).toBe('niece or nephew');
    expect(genderedLabel('child', null)).toBe('child');
    expect(genderedLabel('sibling', null)).toBe('sibling');
  });

  it('genders blood terms at depth', () => {
    expect(genderedLabel('great-grandparent', 'male')).toBe('great-grandfather');
    expect(genderedLabel('great-aunt or great-uncle', 'female')).toBe('great-aunt');
    expect(genderedLabel('great-aunt or great-uncle', 'male')).toBe('great-uncle');
    expect(genderedLabel('grandniece or grandnephew', 'male')).toBe('grandnephew');
    expect(genderedLabel('half-sibling', 'female')).toBe('half-sister');
    expect(genderedLabel('third cousin twice removed', 'female')).toBe('third cousin twice removed');
  });

  it('genders in-law and by-marriage terms', () => {
    expect(genderedLabel('parent-in-law', 'female')).toBe('mother-in-law');
    expect(genderedLabel('child-in-law', 'male')).toBe('son-in-law');
    expect(genderedLabel('aunt-in-law or uncle-in-law', 'male')).toBe('uncle-in-law');
    expect(genderedLabel('aunt or uncle by marriage', 'female')).toBe('aunt by marriage');
  });

  it('writes the step words that are one word as one word', () => {
    expect(genderedLabel('step-parent', 'female')).toBe('stepmother');
    expect(genderedLabel('step-child', 'male')).toBe('stepson');
    expect(genderedLabel('step-sibling', 'female')).toBe('stepsister');
    expect(genderedLabel('step-grandchild', 'male')).toBe('step-grandson');
    expect(genderedLabel('step-niece or step-nephew', 'male')).toBe('step-nephew');
  });
});
