import { describe, expect, it } from 'vitest';
import type { FamilyLink, FamilyNode } from '../types/graph';
import { familyOverview, MAX_FAMILY_OVERVIEW_CHARS } from './familyOverview';
import { KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';

describe('familyOverview', () => {
  it('gives one family as counts: "Explain the Haddad family"', () => {
    expect(familyOverview(KINSHIP_FIXTURE_TREE, 'Haddad')).toEqual({
      family: 'Haddad',
      persons: 8,
      // Idris, Yusuf, Omar, and Omar's son Yusuf.
      generations: 4,
      founders: { total: 1, names: ['Idris Haddad'] },
      // Yusuf, Mariam and Khalil.
      branches: 3,
    });
  });

  it('reads the family name in any case, and as "the Khoury family"', () => {
    const khoury = {
      family: 'Khoury',
      persons: 7,
      // Jamil, Faris, Nabil, Hani, Sami.
      generations: 5,
      founders: { total: 1, names: ['Jamil Khoury'] },
      branches: 1,
    };
    expect(familyOverview(KINSHIP_FIXTURE_TREE, 'khoury')).toEqual(khoury);
    expect(familyOverview(KINSHIP_FIXTURE_TREE, 'the Khoury family')).toEqual(khoury);
  });

  it('gives the whole tree as counts, with the largest families: "Tell me about the family"', () => {
    expect(familyOverview(KINSHIP_FIXTURE_TREE)).toEqual({
      family: null,
      persons: 41,
      families: 14,
      largestFamilies: [
        { name: 'Haddad', persons: 8 },
        { name: 'Khoury', persons: 7 },
        { name: 'Mansour', persons: 6 },
        { name: 'Saleh', persons: 4 },
        { name: 'Zaher', persons: 4 },
      ],
      // Idris, Mariam, Nabil, Hani, Sami.
      generations: 5,
      // Persons with no parent recorded who have children, less those who married in:
      // Idris, Salma, Jamil, Nadia, Bashir, Adel, Widad, Fuad, Majed. Those with the most descendants first.
      founders: { total: 9, names: ['Idris Haddad', 'Salma Darwish', 'Adel Mansour'] },
      branches: 11,
    });
  });

  it('is null for a family name no Person has', () => {
    expect(familyOverview(KINSHIP_FIXTURE_TREE, 'Smith')).toBeNull();
  });

  it('stays under a fixed size, for every family in the test tree and for a family of 3,000', () => {
    const names = new Set(KINSHIP_FIXTURE_TREE.nodes.map((n) => n.familyCluster ?? ''));
    for (const name of [undefined, ...names]) {
      expect(JSON.stringify(familyOverview(KINSHIP_FIXTURE_TREE, name)).length).toBeLessThanOrEqual(MAX_FAMILY_OVERVIEW_CHARS);
    }

    // 1,000 founders with long names, each with two children, and 500 more family names.
    const nodes: FamilyNode[] = [];
    const links: FamilyLink[] = [];
    for (let i = 0; i < 1000; i++) {
      const founder = { id: `f${i}`, firstName: `Founderwithaverylonggivenname${i}`, familyCluster: 'Verylongfamilyname' };
      nodes.push(founder);
      for (const c of [0, 1]) {
        nodes.push({ id: `f${i}c${c}`, firstName: `Child${c}`, familyCluster: 'Verylongfamilyname' });
        links.push({ source: founder.id, target: `f${i}c${c}`, type: 'parent' });
      }
    }
    for (let i = 0; i < 500; i++) nodes.push({ id: `o${i}`, firstName: 'Other', familyCluster: `Otherlongfamilyname${i}` });
    const big = { nodes, links };
    expect(familyOverview(big, 'Verylongfamilyname')).toMatchObject({ persons: 3000, founders: { total: 1000 }, branches: 2000 });
    expect(JSON.stringify(familyOverview(big, 'Verylongfamilyname')).length).toBeLessThanOrEqual(MAX_FAMILY_OVERVIEW_CHARS);
    expect(JSON.stringify(familyOverview(big)).length).toBeLessThanOrEqual(MAX_FAMILY_OVERVIEW_CHARS);
  });

  it('counts generations without looping on a parent cycle', () => {
    const nodes = ['a', 'b'].map((id) => ({ id, firstName: id, familyCluster: 'Loop' }));
    const links: FamilyLink[] = [
      { source: 'a', target: 'b', type: 'parent' },
      { source: 'b', target: 'a', type: 'parent' },
    ];
    expect(familyOverview({ nodes, links }, 'Loop')).toMatchObject({ persons: 2, generations: 2 });
  });
});
