import { describe, it, expect } from 'vitest';
import {
  layoutPaperTree,
  paperLines,
  placeNewcomer,
  paperDiscRadius,
  kinshipLinkCounts,
  PAPER_DISC_GAP,
  type PaperLayout,
} from './paperLayout';
import { calculateLayout, keepDrawnParentLinks } from './layoutEngine';
import { filterGraphData } from './filterGraphData';
import { getNodeId } from './familyGraph';
import { FIXTURE_IDS, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

function person(id: string, familyCluster: string, maternalFamilyCluster?: string): FamilyNode {
  return { id, firstName: id, familyCluster, ...(maternalFamilyCluster && { maternalFamilyCluster }) };
}

const NODES: FamilyNode[] = [
  person('kamal', 'Kutob'),
  person('widad', 'Sabbagh'),
  person('ebtisam', 'Kutob', 'Sabbagh'),
  person('nader', 'Kutob', 'Sabbagh'),
  person('grandpa', 'Badran'),
  person('fahd', 'Badran'),
  person('omar', 'Badran'),
  person('hala', 'Badran'),
  person('aya', 'Badran'),
  person('ali', 'Badran', 'Kutob'),
  person('celine', 'Badran', 'Kutob'),
  person('yusuf', 'Badran', 'Badran'),
  person('hisham', 'Shaban'),
  person('seif', 'Shaban', 'Badran'),
  person('zeina', 'Shaban', 'Badran'),
];

const father = (source: string, target: string): FamilyLink => ({ source, target, type: 'parent', parentRole: 'father' });
const mother = (source: string, target: string): FamilyLink => ({ source, target, type: 'parent', parentRole: 'mother' });

const LINKS: FamilyLink[] = [
  { source: 'kamal', target: 'widad', type: 'marriage' },
  father('kamal', 'ebtisam'),
  father('kamal', 'nader'),
  mother('widad', 'ebtisam'),
  mother('widad', 'nader'),
  father('grandpa', 'fahd'),
  father('grandpa', 'omar'),
  father('grandpa', 'hala'),
  father('grandpa', 'aya'),
  { source: 'fahd', target: 'ebtisam', type: 'marriage' },
  father('fahd', 'ali'),
  father('fahd', 'celine'),
  mother('ebtisam', 'ali'),
  mother('ebtisam', 'celine'),
  { source: 'omar', target: 'aya', type: 'marriage' },
  father('omar', 'yusuf'),
  mother('aya', 'yusuf'),
  { source: 'hisham', target: 'hala', type: 'divorce' },
  father('hisham', 'seif'),
  father('hisham', 'zeina'),
  mother('hala', 'seif'),
  mother('hala', 'zeina'),
];

const TREE: FamilyGraph = { nodes: NODES, links: LINKS };

function bigTree(generations: number): FamilyGraph {
  const nodes: FamilyNode[] = [person('root-f', 'Big'), person('root-m', 'Wed')];
  const links: FamilyLink[] = [{ source: 'root-f', target: 'root-m', type: 'marriage' }];
  let couples: [string, string][] = [['root-f', 'root-m']];
  for (let g = 0; g < generations; g++) {
    const next: [string, string][] = [];
    couples.forEach(([f, m], c) => {
      for (let k = 0; k < 3; k++) {
        const child = `g${g}-c${c}-k${k}`;
        nodes.push(person(child, 'Big'));
        links.push(father(f, child), mother(m, child));
        if (k < 2) {
          const spouse = `${child}-spouse`;
          nodes.push(person(spouse, 'Wed'));
          links.push({ source: child, target: spouse, type: k === 0 ? 'marriage' : 'divorce' });
          next.push([child, spouse]);
        }
      }
    });
    couples = next;
  }
  return { nodes, links };
}

function distance(layout: PaperLayout, a: string, b: string): number {
  const p = layout.get(a)!;
  const q = layout.get(b)!;
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

function overlappingPairs(layout: PaperLayout): string[] {
  const ids = [...layout.keys()];
  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const clearance = layout.get(ids[i])!.radius + layout.get(ids[j])!.radius + PAPER_DISC_GAP;
      if (distance(layout, ids[i], ids[j]) < clearance - 1e-9) pairs.push(`${ids[i]}~${ids[j]}`);
    }
  }
  return pairs;
}

const asLines = (graph: FamilyGraph) =>
  paperLines(graph.nodes, graph.links)
    .filter(line => line.type === 'parent')
    .map(line => `${line.sourceId}>${line.targetId}`)
    .sort();

describe('layoutPaperTree: the same tree gives the same positions', () => {
  it('places every Person it is given', () => {
    const layout = layoutPaperTree(KINSHIP_FIXTURE_TREE);
    expect([...layout.keys()].sort()).toEqual(KINSHIP_FIXTURE_TREE.nodes.map(n => n.id).sort());
    for (const disc of layout.values()) {
      expect(Number.isFinite(disc.x) && Number.isFinite(disc.y) && Number.isFinite(disc.z)).toBe(true);
    }
  });

  it('gives identical positions on every run', () => {
    expect(layoutPaperTree(KINSHIP_FIXTURE_TREE)).toEqual(layoutPaperTree(KINSHIP_FIXTURE_TREE));
  });

  it('does not depend on the order Persons and Kinship Links arrive in', () => {
    const shuffled: FamilyGraph = {
      nodes: [...KINSHIP_FIXTURE_TREE.nodes].reverse(),
      links: [...KINSHIP_FIXTURE_TREE.links].reverse(),
    };
    expect(layoutPaperTree(shuffled)).toEqual(layoutPaperTree(KINSHIP_FIXTURE_TREE));
  });

  it('resolves both Kinship Link endpoint forms the same way (ADR 0006)', () => {
    const byId = new Map(TREE.nodes.map(n => [n.id, n]));
    const asObjects: FamilyGraph = {
      nodes: TREE.nodes,
      links: TREE.links.map(l => ({ ...l, source: byId.get(getNodeId(l.source))!, target: byId.get(getNodeId(l.target))! })),
    };
    expect(layoutPaperTree(asObjects)).toEqual(layoutPaperTree(TREE));
    expect(asLines(asObjects)).toEqual(asLines(TREE));
  });

  it('ignores positions a force simulation left on the Person objects', () => {
    const moved: FamilyGraph = { nodes: TREE.nodes.map(n => ({ ...n, x: 999, y: -999, z: 5, fx: 1 })), links: TREE.links };
    expect(layoutPaperTree(moved)).toEqual(layoutPaperTree(TREE));
  });

  it('keeps relatives closer together than strangers', () => {
    const layout = layoutPaperTree(TREE);
    expect(distance(layout, 'omar', 'aya')).toBeLessThan(distance(layout, 'omar', 'widad'));
    expect(distance(layout, 'hisham', 'seif')).toBeLessThan(distance(layout, 'hisham', 'kamal'));
  });
});

describe('layoutPaperTree: no two Persons overlap', () => {
  it.each([
    ['the three-family tree', TREE],
    ['the Kinship fixture tree', KINSHIP_FIXTURE_TREE],
    ['a tree of six generations', bigTree(6)],
  ])('leaves every pair of discs clear in %s', (_name, graph) => {
    const layout = layoutPaperTree(graph);
    expect(layout.size).toBe(graph.nodes.length);
    expect(overlappingPairs(layout)).toEqual([]);
  });

  it('keeps Persons with no Kinship Link apart too', () => {
    const loners: FamilyGraph = { nodes: ['a', 'b', 'c', 'd', 'e'].map(id => person(id, 'Solo')), links: [] };
    expect(overlappingPairs(layoutPaperTree(loners))).toEqual([]);
  });
});

describe('disc size grows with the Kinship Link count', () => {
  it('counts every stored Kinship Link, both parent links included', () => {
    const counts = kinshipLinkCounts(NODES.map(n => n.id), TREE.links);
    expect(counts.get('ebtisam')).toBe(5);
    expect(counts.get('omar')).toBe(counts.get('aya'));
    expect(counts.get('nader')).toBe(2);
  });

  it('gives a Person with more Kinship Links a bigger disc, up to a limit', () => {
    expect(paperDiscRadius(0)).toBeGreaterThan(0);
    expect(paperDiscRadius(4)).toBeGreaterThan(paperDiscRadius(1));
    expect(paperDiscRadius(1000)).toBe(paperDiscRadius(2000));
    const layout = layoutPaperTree(TREE);
    expect(layout.get('ebtisam')!.radius).toBeGreaterThan(layout.get('nader')!.radius);
  });
});

describe('placeNewcomer: a newcomer lands near relatives and nobody else moves', () => {
  const layout = layoutPaperTree(KINSHIP_FIXTURE_TREE);
  const anchor = FIXTURE_IDS.huda;
  const newcomer = person('newcomer', 'Haddad');
  const linksWithNewcomer: FamilyLink[] = [...KINSHIP_FIXTURE_TREE.links, father(anchor, 'newcomer')];
  const placed = placeNewcomer(layout, newcomer.id, linksWithNewcomer);

  it('keeps every other Person exactly where they were, at the same size', () => {
    for (const [id, disc] of layout) expect(placed.get(id)).toEqual(disc);
    expect(placed.size).toBe(layout.size + 1);
  });

  it('does not change the layout it was given', () => {
    expect(layout.has('newcomer')).toBe(false);
  });

  it('places the newcomer clear of every disc', () => {
    expect(overlappingPairs(placed)).toEqual([]);
  });

  it('places the newcomer beside the relative, nearer than most of the tree', () => {
    const toRelative = distance(placed, 'newcomer', anchor);
    const toOthers = [...layout.keys()].filter(id => id !== anchor).map(id => distance(placed, 'newcomer', id)).sort((a, b) => a - b);
    expect(toRelative).toBeLessThan(toOthers[Math.floor(toOthers.length / 4)]);
    const clearance = placed.get('newcomer')!.radius + placed.get(anchor)!.radius + PAPER_DISC_GAP;
    expect(toRelative).toBeLessThan(clearance * 4);
  });

  it('places the same newcomer in the same spot every time, whatever order the links arrive in', () => {
    expect(placeNewcomer(layout, newcomer.id, linksWithNewcomer).get('newcomer')).toEqual(placed.get('newcomer'));
    const relatives: FamilyLink[] = [
      ...KINSHIP_FIXTURE_TREE.links,
      father(FIXTURE_IDS.khalil, 'baby'),
      mother(FIXTURE_IDS.adel, 'baby'),
      { source: 'baby', target: FIXTURE_IDS.sara, type: 'marriage' },
      father('baby', FIXTURE_IDS.rima),
    ];
    for (let shift = 1; shift < 4; shift++) {
      const rotated = [...relatives.slice(-shift), ...relatives.slice(0, -shift)].reverse();
      expect(placeNewcomer(layout, 'baby', rotated).get('baby')).toEqual(placeNewcomer(layout, 'baby', relatives).get('baby'));
    }
  });

  it('places a child of two parents far apart beside one of them, clear of every disc', () => {
    const links = [...KINSHIP_FIXTURE_TREE.links, father(FIXTURE_IDS.khalil, 'baby'), mother(FIXTURE_IDS.adel, 'baby')];
    const withBaby = placeNewcomer(layout, 'baby', links);
    const nearest = Math.min(distance(withBaby, 'baby', FIXTURE_IDS.khalil), distance(withBaby, 'baby', FIXTURE_IDS.adel));
    const clearance = withBaby.get('baby')!.radius + Math.max(layout.get(FIXTURE_IDS.khalil)!.radius, layout.get(FIXTURE_IDS.adel)!.radius) + PAPER_DISC_GAP;
    expect(nearest).toBeLessThan(clearance * 4);
    expect(overlappingPairs(withBaby)).toEqual([]);
    for (const [id, disc] of layout) expect(withBaby.get(id)).toEqual(disc);
  });

  it('places a newcomer with no relatives clear of the tree', () => {
    const alone = placeNewcomer(layout, 'alone', KINSHIP_FIXTURE_TREE.links);
    expect(alone.has('alone')).toBe(true);
    expect(overlappingPairs(alone)).toEqual([]);
  });

  it('returns the layout unchanged for a Person already placed', () => {
    expect(placeNewcomer(layout, anchor, linksWithNewcomer)).toBe(layout);
  });
});

describe('paperLines: the drawn-parent rule matches 2D and Cosmos (ADR 0012)', () => {
  function drawn2D(preset: string): string[] {
    const filtered = filterGraphData(TREE, new Set(), preset);
    const { links } = calculateLayout(filtered.nodes, filtered.links, 'tree', preset);
    return links.filter(l => l.type === 'parent').map(l => `${l.source.id}>${l.target.id}`);
  }

  it('draws the parent Cosmos draws to each child', () => {
    const cosmos = keepDrawnParentLinks(TREE.nodes, TREE.links)
      .filter(l => l.type === 'parent')
      .map(l => `${getNodeId(l.source)}>${getNodeId(l.target)}`)
      .sort();
    expect(asLines(TREE)).toEqual(cosmos);
  });

  it("draws each child under the parent 2D draws in the child's own family", () => {
    const lines = asLines(TREE);
    const children = new Set(lines.map(line => line.split('>')[1]));
    for (const childId of children) {
      const child = NODES.find(n => n.id === childId)!;
      const in2D = drawn2D(child.familyCluster!).filter(line => line.endsWith(`>${childId}`));
      expect(lines.filter(line => line.endsWith(`>${childId}`))).toEqual(in2D);
    }
  });

  it('draws one line per child, and every marriage and divorce', () => {
    const lines = paperLines(TREE.nodes, TREE.links);
    const children = lines.filter(l => l.type === 'parent').map(l => l.targetId);
    expect(new Set(children).size).toBe(children.length);
    expect(lines.filter(l => l.type !== 'parent').map(l => `${l.sourceId}-${l.type}-${l.targetId}`)).toEqual([
      'kamal-marriage-widad',
      'fahd-marriage-ebtisam',
      'omar-marriage-aya',
      'hisham-divorce-hala',
    ]);
  });

  it('chooses among the Persons shown, so a hidden father leaves the mother drawn', () => {
    const shown = NODES.filter(n => n.id !== 'hisham');
    const lines = paperLines(shown, LINKS).filter(l => l.targetId === 'seif');
    expect(lines.map(l => l.sourceId)).toEqual(['hala']);
  });
});
