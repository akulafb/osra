import { describe, it, expect } from 'vitest';
import { calculateLayout, keepDrawnParentLinks } from './layoutEngine';
import { filterGraphData } from './filterGraphData';
import { getNodeId } from './familyGraph';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

/**
 * A small Tree Record across three families, in two states: as prod held it
 * before the LIN-78 fill-in (each child linked to the father only) and after it
 * (each child linked to both parents, ADR 0012).
 *
 *   Badran: Fahd + Ebtisam Kutob          -> Ali, Celine  (maternal Kutob)
 *           Omar + Aya Badran (cousins)  -> Yusuf        (maternal Badran)
 *           Hala, divorced Hisham Shaban  -> Seif, Zeina  (paternal Shaban, maternal Badran)
 *   Kutob:  Kamal + Widad Sabbagh         -> Ebtisam, Nader
 *   Shaban: Hisham
 */
function person(id: string, familyCluster: string, maternalFamilyCluster?: string, gender?: 'male' | 'female'): FamilyNode {
  return { id, firstName: id, familyCluster, ...(maternalFamilyCluster && { maternalFamilyCluster }), ...(gender && { gender }) };
}

const NODES: FamilyNode[] = [
  person('kamal', 'Kutob', undefined, 'male'),
  person('widad', 'Sabbagh', undefined, 'female'),
  person('ebtisam', 'Kutob', 'Sabbagh', 'female'),
  person('nader', 'Kutob', 'Sabbagh', 'male'),
  person('grandpa', 'Badran', undefined, 'male'),
  person('fahd', 'Badran', undefined, 'male'),
  person('omar', 'Badran', undefined, 'male'),
  person('hala', 'Badran', undefined, 'female'),
  person('aya', 'Badran', undefined, 'female'),
  person('ali', 'Badran', 'Kutob', 'male'),
  person('celine', 'Badran', 'Kutob', 'female'),
  person('yusuf', 'Badran', 'Badran', 'male'),
  person('hisham', 'Shaban', undefined, 'male'),
  person('seif', 'Shaban', 'Badran', 'male'),
  person('zeina', 'Shaban', 'Badran', 'female'),
];

const father = (source: string, target: string): FamilyLink => ({ source, target, type: 'parent', parentRole: 'father' });
const mother = (source: string, target: string): FamilyLink => ({ source, target, type: 'parent', parentRole: 'mother' });

const SHARED: FamilyLink[] = [
  { source: 'kamal', target: 'widad', type: 'marriage' },
  father('kamal', 'ebtisam'),
  father('kamal', 'nader'),
  father('grandpa', 'fahd'),
  father('grandpa', 'omar'),
  father('grandpa', 'hala'),
  father('grandpa', 'aya'),
  { source: 'fahd', target: 'ebtisam', type: 'marriage' },
  father('fahd', 'ali'),
  father('fahd', 'celine'),
  { source: 'omar', target: 'aya', type: 'marriage' },
  father('omar', 'yusuf'),
  { source: 'hisham', target: 'hala', type: 'divorce' },
  father('hisham', 'seif'),
  father('hisham', 'zeina'),
];

const BEFORE: FamilyGraph = { nodes: NODES, links: SHARED };
const AFTER: FamilyGraph = {
  nodes: NODES,
  links: [
    ...SHARED,
    mother('widad', 'ebtisam'),
    mother('widad', 'nader'),
    mother('ebtisam', 'ali'),
    mother('ebtisam', 'celine'),
    mother('aya', 'yusuf'),
    mother('hala', 'seif'),
    mother('hala', 'zeina'),
  ],
};

/** The parent lines the 2D view draws for one family preset, as "parent>child". */
function drawn2D(graph: FamilyGraph, preset: string): string[] {
  const filtered = filterGraphData(graph, new Set(), preset);
  const { links } = calculateLayout(filtered.nodes, filtered.links, 'tree', preset);
  return links
    .filter(l => l.type === 'parent')
    .map(l => `${l.source.id}>${l.target.id}`)
    .sort();
}

/** The drawing recorded from BEFORE with the code as it was before LIN-78. */
const DRAWN_BEFORE_FILL_IN: Record<string, string[]> = {
  Badran: ['fahd>ali', 'fahd>celine', 'grandpa>aya', 'grandpa>fahd', 'grandpa>hala', 'grandpa>omar', 'hala>seif', 'hala>zeina', 'omar>yusuf'],
  Kutob: ['ebtisam>ali', 'ebtisam>celine', 'kamal>ebtisam', 'kamal>nader'],
  Shaban: ['hisham>seif', 'hisham>zeina'],
};

describe('2D: one parent line per child, the same before and after both parents are linked', () => {
  it.each(Object.keys(DRAWN_BEFORE_FILL_IN))('draws the %s family as it did before the fill-in', preset => {
    expect(drawn2D(AFTER, preset)).toEqual(DRAWN_BEFORE_FILL_IN[preset]);
  });

  it('draws a child of two parents from the viewed family under the father, not by id', () => {
    // Yusuf's parents Omar and Aya are both Badran: the father, as before.
    expect(drawn2D(AFTER, 'Badran')).toContain('omar>yusuf');
    expect(drawn2D(AFTER, 'Badran')).not.toContain('aya>yusuf');
  });

  it("draws a child in the view through the mother's family under the mother", () => {
    expect(drawn2D(AFTER, 'Kutob')).toEqual(expect.arrayContaining(['ebtisam>ali', 'ebtisam>celine']));
  });
});

describe('filterGraphData', () => {
  it('invents no parent link: a child whose linked parent is outside the preset has no line', () => {
    // Before the fill-in, the Kutob preset borrowed a mother link from Fahd's marriage.
    const filtered = filterGraphData(BEFORE, new Set(), 'Kutob');
    const parentLinks = filtered.links.filter(l => l.type === 'parent').map(l => `${getNodeId(l.source)}>${getNodeId(l.target)}`);
    expect(parentLinks.sort()).toEqual(['kamal>ebtisam', 'kamal>nader']);
  });

  it('keeps every Kinship Link between Persons in the preset, both parent links included', () => {
    const filtered = filterGraphData(AFTER, new Set(), 'Badran');
    const toYusuf = filtered.links.filter(l => l.type === 'parent' && getNodeId(l.target) === 'yusuf');
    expect(toYusuf.map(l => getNodeId(l.source)).sort()).toEqual(['aya', 'omar']);
  });
});

describe('keepDrawnParentLinks (the 3D view)', () => {
  it('keeps one parent link per child, chosen by the 2D rule, and every marriage and divorce', () => {
    const kept = keepDrawnParentLinks(AFTER.nodes, AFTER.links);
    const parentLinks = kept.filter(l => l.type === 'parent');
    const children = parentLinks.map(l => getNodeId(l.target));
    expect(new Set(children).size).toBe(children.length);
    // With no family preset, the father is drawn, as in the 2D rule.
    expect(parentLinks.map(l => `${getNodeId(l.source)}>${getNodeId(l.target)}`).sort()).toEqual(
      SHARED.filter(l => l.type === 'parent').map(l => `${getNodeId(l.source)}>${getNodeId(l.target)}`).sort()
    );
    expect(kept.filter(l => l.type !== 'parent')).toEqual(AFTER.links.filter(l => l.type !== 'parent'));
  });

  it('draws the one linked parent when only one is linked', () => {
    const onlyMother = [mother('hala', 'seif')];
    expect(keepDrawnParentLinks(NODES, onlyMother)).toEqual(onlyMother);
  });

  it('chooses among the parents it is given, so a hidden father leaves the mother drawn', () => {
    const visible = NODES.filter(n => n.id !== 'hisham');
    const links = AFTER.links.filter(l => getNodeId(l.source) !== 'hisham' && getNodeId(l.target) !== 'hisham');
    const kept = keepDrawnParentLinks(visible, links).filter(l => getNodeId(l.target) === 'seif');
    expect(kept.map(l => getNodeId(l.source))).toEqual(['hala']);
  });

  it('returns the same link objects it was given, so the 3D view keeps its simulation state', () => {
    const kept = keepDrawnParentLinks(AFTER.nodes, AFTER.links);
    for (const link of kept) expect(AFTER.links).toContain(link);
  });
});
