import { describe, it, expect } from 'vitest';
import {
  getRelatives,
  getFormerSpouses,
  getRecordedGender,
  getNodeId,
  findKinshipPaths,
  nameKinshipPath,
  findPersonsByName,
} from './familyGraph';
import type { KinshipPath, RelativeKind } from './familyGraph';
import { kinshipTermText } from './kinshipTerm';
import type { FamilyLink, FamilyNode } from '../types/graph';
import { FIXTURE_IDS as P, FIXTURE_LINKS as links, FIXTURE_PERSONS } from './fixtures/kinshipFixtureTree';

/** Order of a relatives list is not part of the contract. */
const sorted = (ids: readonly string[]) => [...ids].sort();
const COLD_RUN_TIMEOUT_MS = 30_000;

describe('the fixture tree', () => {
  it('has about 40 made-up Persons with unique ids', () => {
    expect(FIXTURE_PERSONS.length).toBe(41);
    expect(new Set(FIXTURE_PERSONS.map(p => p.id)).size).toBe(41);
  });
});

describe('getRecordedGender', () => {
  it('reads gender from parent_role on a Kinship Link where the Person is the parent', () => {
    expect(getRecordedGender(P.huda, links)).toBe('female');
    expect(getRecordedGender(P.yusuf, links)).toBe('male');
  });

  it('returns null when the record cannot tell', () => {
    expect(getRecordedGender(P.khalil, links)).toBeNull(); // no children
    expect(getRecordedGender(P.majed, links)).toBeNull(); // a parent with no parent_role
  });

  it("reads the Person's own gender first, so a childless Person has one", () => {
    const persons: FamilyNode[] = [
      { id: P.khalil, firstName: 'Khalil', gender: 'male' },
      { id: P.amal, firstName: 'Amal', gender: 'female' },
    ];
    expect(getRecordedGender(P.khalil, links, persons)).toBe('male');
    expect(getRecordedGender(P.amal, links, persons)).toBe('female');
  });

  it('falls back to parent_role when the Person has no gender recorded', () => {
    const persons: FamilyNode[] = [
      { id: P.huda, firstName: 'Huda', gender: null },
      { id: P.yusuf, firstName: 'Yusuf' },
    ];
    expect(getRecordedGender(P.huda, links, persons)).toBe('female');
    expect(getRecordedGender(P.yusuf, links, persons)).toBe('male');
    expect(getRecordedGender(P.majed, links, persons)).toBeNull();
  });
});

describe('getRelatives', () => {
  it('parents, by side and gender', () => {
    expect(sorted(getRelatives(P.omar, 'parents', links))).toEqual(sorted([P.yusuf, P.huda]));
    expect(getRelatives(P.omar, 'parents', links, { side: 'mother' })).toEqual([P.huda]);
    expect(getRelatives(P.omar, 'parents', links, { side: 'father' })).toEqual([P.yusuf]);
    expect(sorted(getRelatives(P.omar, 'parents', links, { side: 'both' }))).toEqual(sorted([P.yusuf, P.huda]));
    expect(getRelatives(P.omar, 'parents', links, { gender: 'female' })).toEqual([P.huda]);
  });

  it('a parent with no parent_role is on neither side', () => {
    expect(getRelatives(P.tarek, 'parents', links)).toEqual([P.majed]);
    expect(getRelatives(P.tarek, 'parents', links, { side: 'father' })).toEqual([]);
    expect(getRelatives(P.tarek, 'parents', links, { side: 'mother' })).toEqual([]);
  });

  it('children, by gender; side does not apply', () => {
    expect(sorted(getRelatives(P.idris, 'children', links))).toEqual(sorted([P.yusuf, P.mariam, P.khalil]));
    expect(getRelatives(P.idris, 'children', links, { gender: 'male' })).toEqual([P.yusuf]);
    expect(getRelatives(P.idris, 'children', links, { gender: 'female' })).toEqual([P.mariam]);
    const persons: FamilyNode[] = [{ id: P.khalil, firstName: 'Khalil', gender: 'male' }];
    expect(sorted(getRelatives(P.idris, 'children', links, { gender: 'male', persons }))).toEqual(
      sorted([P.yusuf, P.khalil])
    );
    expect(sorted(getRelatives(P.idris, 'children', links, { side: 'mother' }))).toEqual(
      sorted([P.yusuf, P.mariam, P.khalil])
    );
  });

  it('siblings, by side and gender', () => {
    expect(getRelatives(P.omar, 'siblings', links)).toEqual([P.layla]);
    expect(getRelatives(P.omar, 'siblings', links, { gender: 'female' })).toEqual([P.layla]);
    expect(getRelatives(P.omar, 'siblings', links, { gender: 'male' })).toEqual([]);
    // Jad and Nour share only their mother.
    expect(getRelatives(P.jad, 'siblings', links)).toEqual([P.nour]);
    expect(getRelatives(P.jad, 'siblings', links, { side: 'mother' })).toEqual([P.nour]);
    expect(getRelatives(P.jad, 'siblings', links, { side: 'father' })).toEqual([]);
  });

  it('spouses are current marriages only, by gender', () => {
    expect(getRelatives(P.layla, 'spouses', links)).toEqual([P.karim]);
    expect(getRelatives(P.omar, 'spouses', links, { gender: 'female' })).toEqual([P.sara]);
    expect(getRelatives(P.omar, 'spouses', links, { gender: 'male' })).toEqual([]);
    expect(getRelatives(P.omar, 'spouses', links, { side: 'father' })).toEqual([P.sara]);
  });

  it('grandparents, by side and gender', () => {
    expect(sorted(getRelatives(P.omar, 'grandparents', links))).toEqual(
      sorted([P.idris, P.salma, P.adel, P.widad])
    );
    expect(sorted(getRelatives(P.omar, 'grandparents', links, { side: 'father' }))).toEqual(
      sorted([P.idris, P.salma])
    );
    expect(sorted(getRelatives(P.omar, 'grandparents', links, { side: 'mother' }))).toEqual(
      sorted([P.adel, P.widad])
    );
    expect(getRelatives(P.omar, 'grandparents', links, { side: 'mother', gender: 'male' })).toEqual([P.adel]);
  });

  it('grandchildren, by gender; side does not apply', () => {
    expect(sorted(getRelatives(P.idris, 'grandchildren', links))).toEqual(
      sorted([P.omar, P.layla, P.sara, P.nabil])
    );
    expect(sorted(getRelatives(P.idris, 'grandchildren', links, { gender: 'female' }))).toEqual(
      sorted([P.layla, P.sara])
    );
    expect(sorted(getRelatives(P.idris, 'grandchildren', links, { gender: 'male', side: 'mother' }))).toEqual(
      sorted([P.omar, P.nabil])
    );
  });

  it('aunts and uncles, by side and gender', () => {
    expect(sorted(getRelatives(P.omar, 'auntsAndUncles', links))).toEqual(
      sorted([P.mariam, P.khalil, P.samir, P.amal])
    );
    expect(sorted(getRelatives(P.omar, 'auntsAndUncles', links, { side: 'father' }))).toEqual(
      sorted([P.mariam, P.khalil])
    );
    expect(sorted(getRelatives(P.omar, 'auntsAndUncles', links, { side: 'mother' }))).toEqual(
      sorted([P.samir, P.amal])
    );
    expect(getRelatives(P.omar, 'auntsAndUncles', links, { gender: 'female' })).toEqual([P.mariam]);
    expect(getRelatives(P.omar, 'auntsAndUncles', links, { gender: 'male' })).toEqual([P.samir]);
  });

  it('cousins, by side and gender', () => {
    expect(sorted(getRelatives(P.omar, 'cousins', links))).toEqual(sorted([P.sara, P.nabil, P.tala, P.ziad]));
    expect(sorted(getRelatives(P.omar, 'cousins', links, { side: 'father' }))).toEqual(sorted([P.sara, P.nabil]));
    expect(sorted(getRelatives(P.omar, 'cousins', links, { side: 'mother' }))).toEqual(sorted([P.tala, P.ziad]));
    expect(getRelatives(P.omar, 'cousins', links, { gender: 'female' })).toEqual([P.sara]);
    expect(getRelatives(P.omar, 'cousins', links, { side: 'father', gender: 'male' })).toEqual([P.nabil]);
  });

  it('nieces and nephews, by side and gender', () => {
    expect(sorted(getRelatives(P.omar, 'niecesAndNephews', links))).toEqual(sorted([P.jad, P.nour]));
    expect(sorted(getRelatives(P.khalil, 'niecesAndNephews', links, { gender: 'female' }))).toEqual(
      sorted([P.layla, P.sara])
    );
    expect(sorted(getRelatives(P.khalil, 'niecesAndNephews', links, { gender: 'male' }))).toEqual(
      sorted([P.omar, P.nabil])
    );
    // Lina is the child of Nour's half-brother Jad, who shares only their mother.
    expect(getRelatives(P.nour, 'niecesAndNephews', links)).toEqual([P.lina]);
    expect(getRelatives(P.nour, 'niecesAndNephews', links, { side: 'mother' })).toEqual([P.lina]);
    expect(getRelatives(P.nour, 'niecesAndNephews', links, { side: 'father' })).toEqual([]);
  });

  it('in-laws: the parents and siblings of a spouse, and the spouses of siblings and children', () => {
    expect(sorted(getRelatives(P.dina, 'inLaws', links))).toEqual(sorted([P.faris, P.mariam, P.sara]));
    // Omar is the husband of Nabil's sister Sara.
    expect(sorted(getRelatives(P.nabil, 'inLaws', links))).toEqual(sorted([P.bashir, P.walid, P.omar]));
    expect(sorted(getRelatives(P.faris, 'inLaws', links))).toEqual(
      sorted([P.idris, P.salma, P.yusuf, P.khalil, P.omar, P.dina])
    );
    expect(sorted(getRelatives(P.dina, 'inLaws', links, { gender: 'female' }))).toEqual(sorted([P.mariam, P.sara]));
    expect(getRelatives(P.dina, 'inLaws', links, { gender: 'male', side: 'mother' })).toEqual([P.faris]);
  });

  it('in-laws do not come through a divorce', () => {
    expect(getRelatives(P.layla, 'inLaws', links)).toEqual([P.sara]);
    expect(getRelatives(P.majed, 'inLaws', links)).toEqual([]);
  });

  it('ancestors, by side and gender', () => {
    expect(sorted(getRelatives(P.yusufJr, 'ancestors', links))).toEqual(
      sorted([
        P.omar, P.sara, P.yusuf, P.huda, P.faris, P.mariam,
        P.idris, P.salma, P.adel, P.widad, P.jamil, P.nadia,
      ])
    );
    expect(sorted(getRelatives(P.yusufJr, 'ancestors', links, { side: 'father' }))).toEqual(
      sorted([P.omar, P.yusuf, P.huda, P.idris, P.salma, P.adel, P.widad])
    );
    expect(sorted(getRelatives(P.yusufJr, 'ancestors', links, { side: 'mother' }))).toEqual(
      sorted([P.sara, P.faris, P.mariam, P.idris, P.salma, P.jamil, P.nadia])
    );
    expect(sorted(getRelatives(P.yusufJr, 'ancestors', links, { gender: 'female' }))).toEqual(
      sorted([P.sara, P.huda, P.mariam, P.salma, P.widad, P.nadia])
    );
  });

  it('descendants, by gender; side does not apply', () => {
    expect(sorted(getRelatives(P.idris, 'descendants', links))).toEqual(
      sorted([
        P.yusuf, P.mariam, P.khalil, P.omar, P.layla, P.sara, P.nabil,
        P.yusufJr, P.rima, P.jad, P.nour, P.hani, P.maya, P.sami, P.lina,
      ])
    );
    expect(sorted(getRelatives(P.idris, 'descendants', links, { gender: 'female', side: 'father' }))).toEqual(
      sorted([P.mariam, P.layla, P.sara])
    );
  });

  it('a Person with no parents recorded has no relatives above', () => {
    expect(getRelatives(P.karim, 'parents', links)).toEqual([]);
    expect(getRelatives(P.karim, 'ancestors', links)).toEqual([]);
    expect(getRelatives(P.karim, 'cousins', links)).toEqual([]);
    expect(getRelatives(P.hana, 'inLaws', links)).toEqual([]);
  });

  it('a Person with one parent recorded has only that side', () => {
    expect(getRelatives(P.dina, 'parents', links)).toEqual([P.bashir]);
    expect(getRelatives(P.dina, 'parents', links, { side: 'mother' })).toEqual([]);
    expect(getRelatives(P.dina, 'siblings', links)).toEqual([P.walid]);
  });

  it('resolves Kinship Link endpoints that are node objects', () => {
    const byId = new Map(FIXTURE_PERSONS.map(p => [p.id, p] as const));
    const live: FamilyLink[] = links.map(l => ({
      ...l,
      source: byId.get(getNodeId(l.source)) as FamilyNode,
      target: byId.get(getNodeId(l.target)) as FamilyNode,
    }));
    expect(sorted(getRelatives(P.omar, 'cousins', live, { side: 'father' }))).toEqual(sorted([P.sara, P.nabil]));
  });

  it('returns an empty list for an unknown Person or missing links', () => {
    expect(getRelatives('nobody', 'cousins', links)).toEqual([]);
    expect(getRelatives('', 'parents', links)).toEqual([]);
    expect(getRelatives(P.omar, 'parents', [])).toEqual([]);
  });
});

/** The step kinds of a Kinship Path, in order. */
const kinds = (path: KinshipPath) => path.steps.map(s => s.kind);

describe('getFormerSpouses', () => {
  it('lists the other end of each divorce, and not a current marriage', () => {
    expect(getFormerSpouses(P.layla, links)).toEqual([P.tarek]);
    expect(getFormerSpouses(P.tarek, links)).toEqual([P.layla]);
    expect(getFormerSpouses(P.karim, links)).toEqual([]);
    expect(getFormerSpouses('', links)).toEqual([]);
  });
});

describe('findKinshipPaths', () => {
  it('returns the chain of Kinship Links in order from one Person to the other', () => {
    const paths = findKinshipPaths(P.omar, P.idris, links);
    expect(paths).toHaveLength(1);
    const [path] = paths;
    expect(path.kind).toBe('blood');
    expect(path.personIds).toEqual([P.omar, P.yusuf, P.idris]);
    expect(kinds(path)).toEqual(['parent', 'parent']);
    expect(path.steps[0]).toMatchObject({ fromId: P.omar, toId: P.yusuf });
    expect(path.steps[1]).toMatchObject({ fromId: P.yusuf, toId: P.idris });
    // Each step carries the Kinship Link itself, not a copy.
    expect(links).toContain(path.steps[0].link);
    expect(path.steps[0].link).toMatchObject({ source: P.yusuf, target: P.omar, type: 'parent' });
  });

  it('gives married cousins the blood path first and the marriage path second', () => {
    const paths = findKinshipPaths(P.omar, P.sara, links);
    expect(paths.map(p => p.kind)).toEqual(['blood', 'marriage']);

    const [blood, marriage] = paths;
    expect(kinds(blood)).toEqual(['parent', 'parent', 'child', 'child']);
    expect(blood.personIds[0]).toBe(P.omar);
    expect(blood.personIds[1]).toBe(P.yusuf);
    expect(blood.personIds[3]).toBe(P.mariam);
    expect(blood.personIds[4]).toBe(P.sara);
    expect(blood.relation).toMatchObject({ name: 'cousin', label: 'first cousin', side: 'father' });

    expect(kinds(marriage)).toEqual(['spouse']);
    expect(marriage.personIds).toEqual([P.omar, P.sara]);
    expect(marriage.relation).toMatchObject({ name: 'spouse' });
  });

  it('gives a cousin who is also a sibling-in-law both paths', () => {
    // Sara is Layla's cousin, and the wife of Layla's brother Omar.
    const paths = findKinshipPaths(P.layla, P.sara, links);
    expect(paths.map(p => p.kind)).toEqual(['blood', 'marriage']);
    expect(paths[1].personIds).toEqual([P.layla, P.yusuf, P.omar, P.sara]);
  });

  it('does not report a marriage path that is only a longer way round a blood path', () => {
    expect(findKinshipPaths(P.omar, P.layla, links).map(p => p.kind)).toEqual(['blood']);
    expect(findKinshipPaths(P.omar, P.yusuf, links).map(p => p.kind)).toEqual(['blood']);
    expect(findKinshipPaths(P.omar, P.yusufJr, links).map(p => p.kind)).toEqual(['blood']);
  });

  it('returns no path, not an error, for two Persons with no Kinship Path', () => {
    expect(findKinshipPaths(P.omar, P.omarZaher, links)).toEqual([]);
    expect(findKinshipPaths(P.omar, P.hana, links)).toEqual([]);
    expect(findKinshipPaths(P.hana, P.omar, links)).toEqual([]);
    expect(findKinshipPaths(P.omar, 'nobody', links)).toEqual([]);
    expect(findKinshipPaths('', P.omar, links)).toEqual([]);
    expect(findKinshipPaths(P.omar, P.omar, links)).toEqual([]);
    expect(findKinshipPaths(P.omar, P.sara, [])).toEqual([]);
  });

  it('finds a path on the island', () => {
    const [path] = findKinshipPaths(P.laylaZaher, P.fuad, links);
    expect(path.personIds).toEqual([P.laylaZaher, P.munir, P.fuad]);
  });

  it('joins two Persons who only share a child with a path that is neither blood nor marriage', () => {
    const coParents: FamilyLink[] = [
      { source: 'a', target: 'c', type: 'parent', parentRole: 'father' },
      { source: 'b', target: 'c', type: 'parent', parentRole: 'mother' },
    ];
    const paths = findKinshipPaths('a', 'b', coParents);
    expect(paths).toHaveLength(1);
    expect(paths[0].kind).toBe('other');
    expect(paths[0].personIds).toEqual(['a', 'c', 'b']);
    // No one word: the child's mother, two terms joined at the child.
    expect(paths[0].relation).toMatchObject({ name: 'two terms', label: "child's parent", via: { personId: 'c' } });
  });

  it('finds the marriage path when a shorter walk would go through one Person twice', () => {
    // A and B share the child C and are not married. C is married to D, so the
    // shortest walk that crosses a marriage is A, C, D, C, B: not a Kinship Path.
    // A is married to E, and E is B's first cousin (G is their grandparent).
    const tree: FamilyLink[] = [
      { source: 'A', target: 'C', type: 'parent', parentRole: 'father' },
      { source: 'B', target: 'C', type: 'parent', parentRole: 'mother' },
      { source: 'C', target: 'D', type: 'marriage' },
      { source: 'A', target: 'E', type: 'marriage' },
      { source: 'G', target: 'M', type: 'parent', parentRole: 'father' },
      { source: 'G', target: 'N', type: 'parent', parentRole: 'father' },
      { source: 'M', target: 'E', type: 'parent', parentRole: 'mother' },
      { source: 'N', target: 'B', type: 'parent', parentRole: 'mother' },
    ];
    const paths = findKinshipPaths('A', 'B', tree);
    expect(paths).toHaveLength(1);
    expect(paths[0].kind).toBe('marriage');
    expect(paths[0].personIds).toEqual(['A', 'E', 'M', 'G', 'N', 'B']);
  });

  it('finds the marriage path when a walk that dead-ends reaches a Person on it first', () => {
    // A and T share the child Q and are not married. Q is married to N.
    // A is married to R, the grandparent of N (R, Y, N).
    // The only Kinship Path through a marriage is A, R, Y, N, Q, T. The walk
    // A, Q, N gets to N sooner, but it can only go on to T back through Q.
    const tree: FamilyLink[] = [
      { source: 'A', target: 'Q', type: 'parent', parentRole: 'father' },
      { source: 'T', target: 'Q', type: 'parent', parentRole: 'mother' },
      { source: 'Q', target: 'N', type: 'marriage' },
      { source: 'A', target: 'R', type: 'marriage' },
      { source: 'R', target: 'Y', type: 'parent', parentRole: 'mother' },
      { source: 'Y', target: 'N', type: 'parent', parentRole: 'mother' },
    ];
    const paths = findKinshipPaths('A', 'T', tree);
    expect(paths).toHaveLength(1);
    expect(paths[0].kind).toBe('marriage');
    expect(paths[0].personIds).toEqual(['A', 'R', 'Y', 'N', 'Q', 'T']);
    expect(kinds(paths[0])).toEqual(['spouse', 'child', 'child', 'spouse', 'parent']);
  });

  it('resolves Kinship Link endpoints that are node objects', () => {
    const byId = new Map(FIXTURE_PERSONS.map(p => [p.id, p] as const));
    const live: FamilyLink[] = links.map(l => ({
      ...l,
      source: byId.get(getNodeId(l.source)) as FamilyNode,
      target: byId.get(getNodeId(l.target)) as FamilyNode,
    }));
    const paths = findKinshipPaths(P.omar, P.sara, live);
    expect(paths.map(p => p.kind)).toEqual(['blood', 'marriage']);
    expect(paths[0].personIds).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// findKinshipPaths against a reference that tries every path.
//
// The reference below shares no code with the search. It lists every chain of
// Kinship Links from one Person to the other that goes through no Person
// twice, then picks the shortest of each kind by the documented rules.
// ---------------------------------------------------------------------------

/** A small seeded random number generator, so the trees are the same on every run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A made-up tree of `size` Persons: at most two parents each, plus marriages and divorces. */
function buildRandomTree(random: () => number, size: number): FamilyLink[] {
  const ids = Array.from({ length: size }, (_, i) => `r${i}`);
  const tree: FamilyLink[] = [];
  const pick = (max: number) => Math.floor(random() * max);
  // A parent always has a lower index than the child, so no Person is their own ancestor.
  for (let child = 1; child < size; child++) {
    const parents = new Set<number>();
    const count = pick(3);
    for (let k = 0; k < count; k++) parents.add(pick(child));
    for (const parent of parents) {
      tree.push({
        source: ids[parent],
        target: ids[child],
        type: 'parent',
        parentRole: random() < 0.5 ? 'mother' : 'father',
      });
    }
  }
  const unions = 1 + pick(4);
  for (let k = 0; k < unions; k++) {
    const a = pick(size);
    const b = pick(size);
    if (a !== b) tree.push({ source: ids[a], target: ids[b], type: random() < 0.25 ? 'divorce' : 'marriage' });
  }
  return tree;
}

/** The shortest length of each kind of Kinship Path, by trying every path. */
function shortestByTryingEveryPath(
  fromId: string,
  toId: string,
  tree: readonly FamilyLink[]
): { blood: number; marriage: number; other: number } {
  const best = { blood: Infinity, marriage: Infinity, other: Infinity };
  const onPath = new Set<string>([fromId]);
  // `U` up to a parent, `D` down to a child, `M` across a marriage or divorce.
  const walk = (at: string, code: string) => {
    if (at === toId) {
      const kind = code.includes('M') ? 'marriage' : /^U*D*$/.test(code) ? 'blood' : 'other';
      best[kind] = Math.min(best[kind], code.length);
      return;
    }
    for (const link of tree) {
      const source = getNodeId(link.source);
      const target = getNodeId(link.target);
      if (source !== at && target !== at) continue;
      const next = source === at ? target : source;
      if (onPath.has(next)) continue;
      const letter = link.type !== 'parent' ? 'M' : source === at ? 'D' : 'U';
      onPath.add(next);
      walk(next, code + letter);
      onPath.delete(next);
    }
  };
  walk(fromId, '');
  return best;
}

describe('findKinshipPaths against trying every path', () => {
  it('returns the shortest path of each kind on 400 small random trees', () => {
    const random = seededRandom(70);
    let pairs = 0;
    let marriagePaths = 0;
    for (let t = 0; t < 400; t++) {
      const size = 5 + (t % 4);
      const tree = buildRandomTree(random, size);
      for (let a = 0; a < size; a++) {
        for (let b = 0; b < size; b++) {
          if (a === b) continue;
          const fromId = `r${a}`;
          const toId = `r${b}`;
          const best = shortestByTryingEveryPath(fromId, toId, tree);
          const expected: Array<[string, number]> = [];
          if (best.blood < Infinity) expected.push(['blood', best.blood]);
          if (best.marriage < Infinity && best.marriage <= best.blood) expected.push(['marriage', best.marriage]);
          if (expected.length === 0 && best.other < Infinity) expected.push(['other', best.other]);

          const paths = findKinshipPaths(fromId, toId, tree);
          const where = `tree ${t}, ${fromId} to ${toId}: ${JSON.stringify(tree)}`;
          expect(paths.map(p => [p.kind, p.steps.length]), where).toEqual(expected);

          for (const path of paths) {
            // A real chain: from the first Person to the last, link by link, no Person twice.
            expect(path.personIds[0], where).toBe(fromId);
            expect(path.personIds[path.personIds.length - 1], where).toBe(toId);
            expect(new Set(path.personIds).size, where).toBe(path.personIds.length);
            expect(path.personIds, where).toHaveLength(path.steps.length + 1);
            path.steps.forEach((step, i) => {
              expect([step.fromId, step.toId], where).toEqual([path.personIds[i], path.personIds[i + 1]]);
              expect(tree, where).toContain(step.link);
              const source = getNodeId(step.link.source);
              const target = getNodeId(step.link.target);
              const stepKind =
                step.link.type === 'marriage'
                  ? 'spouse'
                  : step.link.type === 'divorce'
                    ? 'formerSpouse'
                    : source === step.toId
                      ? 'parent'
                      : 'child';
              expect(step.kind, where).toBe(stepKind);
              expect([source, target].sort(), where).toEqual([step.fromId, step.toId].sort());
            });
            const crossesMarriage = path.steps.some(s => s.link.type !== 'parent');
            expect(crossesMarriage, where).toBe(path.kind === 'marriage');
            if (path.kind === 'marriage') marriagePaths++;
          }
          pairs++;
        }
      }
    }
    // The run is not empty by accident.
    expect(pairs).toBeGreaterThan(10000);
    expect(marriagePaths).toBeGreaterThan(1000);
  }, COLD_RUN_TIMEOUT_MS);
});

describe('the name of the relation for a Kinship Path', () => {
  /** What `toId` is to `fromId`, by the first (nearest blood, else marriage) path. */
  const relation = (fromId: string, toId: string) => findKinshipPaths(fromId, toId, links)[0].relation;

  it('parent, with which parent', () => {
    expect(relation(P.omar, P.yusuf)).toEqual({ name: 'parent', label: 'parent', side: 'father' });
    expect(relation(P.omar, P.huda)).toEqual({ name: 'parent', label: 'parent', side: 'mother' });
    expect(relation(P.tarek, P.majed)).toEqual({ name: 'parent', label: 'parent' });
  });

  it('child', () => {
    expect(relation(P.yusuf, P.omar)).toEqual({ name: 'child', label: 'child' });
  });

  it('sibling', () => {
    expect(relation(P.omar, P.layla)).toEqual({ name: 'sibling', label: 'sibling' });
  });

  it('half-sibling, with the side of the shared parent', () => {
    expect(relation(P.jad, P.nour)).toEqual({ name: 'half-sibling', label: 'half-sibling', side: 'mother' });
    expect(relation(P.nour, P.jad)).toEqual({ name: 'half-sibling', label: 'half-sibling', side: 'mother' });
  });

  it('sibling, not half-sibling, when only one parent is recorded and the record cannot tell', () => {
    expect(relation(P.dina, P.walid)).toEqual({ name: 'sibling', label: 'sibling' });
  });

  it('spouse', () => {
    const [path] = findKinshipPaths(P.layla, P.karim, links);
    expect(path.kind).toBe('marriage');
    expect(path.relation).toEqual({ name: 'spouse', label: 'spouse' });
  });

  it('former spouse', () => {
    const [path] = findKinshipPaths(P.layla, P.tarek, links);
    expect(path.kind).toBe('marriage');
    expect(kinds(path)).toEqual(['formerSpouse']);
    expect(path.relation).toEqual({ name: 'former spouse', label: 'former spouse' });
  });

  it('grandparent, on the father\'s or mother\'s side', () => {
    expect(relation(P.omar, P.idris)).toEqual({ name: 'grandparent', label: 'grandparent', side: 'father' });
    expect(relation(P.omar, P.widad)).toEqual({ name: 'grandparent', label: 'grandparent', side: 'mother' });
  });

  it('grandchild', () => {
    expect(relation(P.idris, P.omar)).toEqual({ name: 'grandchild', label: 'grandchild' });
  });

  it('aunt or uncle, on the father\'s or mother\'s side', () => {
    expect(relation(P.omar, P.mariam)).toEqual({ name: 'aunt or uncle', label: 'aunt or uncle', side: 'father' });
    expect(relation(P.omar, P.samir)).toEqual({ name: 'aunt or uncle', label: 'aunt or uncle', side: 'mother' });
  });

  it('niece or nephew', () => {
    expect(relation(P.khalil, P.omar)).toEqual({ name: 'niece or nephew', label: 'niece or nephew' });
  });

  it('first cousin, on the father\'s or mother\'s side', () => {
    expect(relation(P.omar, P.tala)).toEqual({
      name: 'cousin', label: 'first cousin', side: 'mother', cousinDegree: 1, timesRemoved: 0,
    });
    expect(relation(P.omar, P.nabil)).toEqual({
      name: 'cousin', label: 'first cousin', side: 'father', cousinDegree: 1, timesRemoved: 0,
    });
  });

  it('second cousin', () => {
    // Jad's mother Layla and Hani's father Nabil are first cousins.
    expect(relation(P.jad, P.hani)).toEqual({
      name: 'cousin', label: 'second cousin', side: 'mother', cousinDegree: 2, timesRemoved: 0,
    });
  });

  it('first cousin once removed, in both directions', () => {
    // Hani is the son of Omar's first cousin Nabil.
    expect(relation(P.omar, P.hani)).toEqual({
      name: 'cousin', label: 'first cousin once removed', side: 'father', cousinDegree: 1, timesRemoved: 1,
    });
    expect(relation(P.hani, P.omar)).toEqual({
      name: 'cousin', label: 'first cousin once removed', side: 'father', cousinDegree: 1, timesRemoved: 1,
    });
  });

  it('second cousin once removed', () => {
    // Sami is the son of Jad's second cousin Hani.
    expect(relation(P.jad, P.sami)).toEqual({
      name: 'cousin', label: 'second cousin once removed', side: 'mother', cousinDegree: 2, timesRemoved: 1,
    });
  });

  it('in-law: the parent of a spouse', () => {
    const [path] = findKinshipPaths(P.nabil, P.bashir, links);
    expect(path.kind).toBe('marriage');
    expect(path.relation).toEqual({ name: 'in-law', label: 'parent-in-law', inLaw: 'parent' });
  });

  it('in-law: the sibling of a spouse, and the spouse of a sibling', () => {
    expect(relation(P.dina, P.sara)).toEqual({ name: 'in-law', label: 'sibling-in-law', inLaw: 'sibling' });
    expect(relation(P.sara, P.dina)).toEqual({ name: 'in-law', label: 'sibling-in-law', inLaw: 'sibling' });
  });

  it('in-law: the spouse of a child', () => {
    expect(relation(P.faris, P.dina)).toEqual({ name: 'in-law', label: 'child-in-law', inLaw: 'child' });
  });

  it('step-parent, on the side of the parent they married', () => {
    const [path] = findKinshipPaths(P.jad, P.karim, links);
    expect(path.kind).toBe('marriage');
    expect(path.personIds).toEqual([P.jad, P.layla, P.karim]);
    expect(path.relation).toEqual({ name: 'step-parent', label: 'step-parent', side: 'mother' });
  });

  it('step-child', () => {
    expect(relation(P.karim, P.jad)).toEqual({ name: 'step-child', label: 'step-child' });
  });

  it('great-grandparent, on the father\'s side', () => {
    const [greatGrandparent] = findKinshipPaths(P.yusufJr, P.idris, links);
    expect(greatGrandparent.kind).toBe('blood');
    expect(greatGrandparent.personIds).toEqual([P.yusufJr, P.omar, P.yusuf, P.idris]);
    expect(greatGrandparent.relation).toEqual({ name: 'grandparent', label: 'great-grandparent', side: 'father' });
  });

  it('great-aunt or great-uncle, on the father\'s side', () => {
    expect(relation(P.hani, P.khalil)).toEqual({ name: 'aunt or uncle', label: 'great-aunt or great-uncle', side: 'father' });
  });

  it('the child of a former spouse: two terms, not a step-child', () => {
    const [formerStepChild] = findKinshipPaths(P.tarek, P.nour, links);
    expect(formerStepChild.kind).toBe('marriage');
    expect(kinds(formerStepChild)).toEqual(['formerSpouse', 'child']);
    expect(formerStepChild.relation).toEqual({
      name: 'two terms',
      label: "former spouse's child",
      via: { personId: P.layla, first: { name: 'former spouse', label: 'former spouse' }, second: { name: 'child', label: 'child' } },
    });
  });

  it('names a marriage path that is shorter than the blood path', () => {
    // Sara is Layla's first cousin and also her brother's wife.
    const [blood, marriage] = findKinshipPaths(P.layla, P.sara, links);
    expect(blood.relation).toMatchObject({ name: 'cousin', label: 'first cousin', side: 'father' });
    expect(marriage.relation).toEqual({ name: 'in-law', label: 'sibling-in-law', inLaw: 'sibling' });
  });

  it('nameKinshipPath names a path on its own', () => {
    const [path] = findKinshipPaths(P.omar, P.mariam, links);
    expect(nameKinshipPath(path, links)).toEqual({ name: 'aunt or uncle', label: 'aunt or uncle', side: 'father' });
    expect(nameKinshipPath({ steps: [] }, links)).toBeNull();
  });

  it('does not call a Person\'s own parent a step-parent, or their own child a step-child', () => {
    // Omar, up to his father Yusuf, across to Yusuf's wife Huda: Huda is Omar's mother.
    const fatherLink = links.find(l => l.source === P.yusuf && l.target === P.omar) as FamilyLink;
    const marriageLink = links.find(l => l.source === P.yusuf && l.target === P.huda) as FamilyLink;
    expect(
      nameKinshipPath(
        {
          steps: [
            { fromId: P.omar, toId: P.yusuf, kind: 'parent', link: fatherLink },
            { fromId: P.yusuf, toId: P.huda, kind: 'spouse', link: marriageLink },
          ],
        },
        links
      )
    ).toMatchObject({ name: 'two terms', label: "parent's spouse" });
    expect(
      nameKinshipPath(
        {
          steps: [
            { fromId: P.huda, toId: P.yusuf, kind: 'spouse', link: marriageLink },
            { fromId: P.yusuf, toId: P.omar, kind: 'child', link: fatherLink },
          ],
        },
        links
      )
    ).toMatchObject({ name: 'two terms', label: "spouse's child" });
  });
});

describe('half-siblings and sides once both parents are linked (ADR 0012)', () => {
  // Dad married Mum, then Rana. Me and Sister are Dad and Mum's; Half is Dad
  // and Rana's. Mum's brother Khal has a son, Cousin.
  const fatherOnly: FamilyLink[] = [
    { source: 'dad', target: 'mum', type: 'divorce' },
    { source: 'dad', target: 'rana', type: 'marriage' },
    { source: 'dad', target: 'me', type: 'parent', parentRole: 'father' },
    { source: 'dad', target: 'sister', type: 'parent', parentRole: 'father' },
    { source: 'dad', target: 'half', type: 'parent', parentRole: 'father' },
    { source: 'grandpa', target: 'mum', type: 'parent', parentRole: 'father' },
    { source: 'grandpa', target: 'khal', type: 'parent', parentRole: 'father' },
    { source: 'khal', target: 'cousin', type: 'parent', parentRole: 'father' },
  ];
  const both: FamilyLink[] = [
    ...fatherOnly,
    { source: 'mum', target: 'me', type: 'parent', parentRole: 'mother' },
    { source: 'mum', target: 'sister', type: 'parent', parentRole: 'mother' },
    { source: 'rana', target: 'half', type: 'parent', parentRole: 'mother' },
  ];
  const relation = (fromId: string, toId: string, tree: FamilyLink[]) => findKinshipPaths(fromId, toId, tree)[0]?.relation;

  it('tells a half-sibling from a sibling', () => {
    expect(relation('me', 'half', fatherOnly)).toEqual({ name: 'sibling', label: 'sibling' });
    expect(relation('me', 'half', both)).toEqual({ name: 'half-sibling', label: 'half-sibling', side: 'father' });
    expect(relation('me', 'sister', both)).toEqual({ name: 'sibling', label: 'sibling' });
  });

  it("finds relatives on the mother's side", () => {
    expect(getRelatives('me', 'parents', fatherOnly, { side: 'mother' })).toEqual([]);
    expect(getRelatives('me', 'parents', both, { side: 'mother' })).toEqual(['mum']);
    expect(getRelatives('me', 'auntsAndUncles', both, { side: 'mother' })).toEqual(['khal']);
    expect(getRelatives('me', 'cousins', both, { side: 'mother' })).toEqual(['cousin']);
    expect(getRelatives('me', 'cousins', both, { side: 'father' })).toEqual([]);
    expect(relation('me', 'cousin', both)).toMatchObject({ name: 'cousin', side: 'mother' });
  });

  it("keeps a half-sibling on the father's side only", () => {
    expect(sorted(getRelatives('me', 'siblings', both, { side: 'father' }))).toEqual(['half', 'sister']);
    expect(getRelatives('me', 'siblings', both, { side: 'mother' })).toEqual(['sister']);
  });
});

describe('Kinship Terms for any Kinship Path', () => {
  const parent = (source: string, target: string, parentRole?: 'mother' | 'father'): FamilyLink => ({
    source,
    target,
    type: 'parent',
    ...(parentRole && { parentRole }),
  });
  const married = (source: string, target: string): FamilyLink => ({ source, target, type: 'marriage' });
  /** Gives `personId` a child, so the record shows their gender through `parent_role`. */
  const gendered = (personId: string, gender: 'female' | 'male'): FamilyLink =>
    parent(personId, `${personId}-child`, gender === 'female' ? 'mother' : 'father');

  /** What `toId` is to `fromId`, in words, for each path: gendered where the record shows it. */
  const terms = (fromId: string, toId: string, tree: FamilyLink[]) =>
    findKinshipPaths(fromId, toId, tree).map(path =>
      kinshipTermText(path.relation, toId, { genderOf: id => getRecordedGender(id, tree), nameOf: id => id })
    );

  describe('a sibling\'s child linked only through the sibling\'s spouse (the Issa case)', () => {
    // Me and May share a father. May is married to Ammar; Issa is linked to his father Ammar only.
    const tree: FamilyLink[] = [
      parent('father', 'me', 'father'),
      parent('father', 'may', 'father'),
      married('ammar', 'may'),
      parent('ammar', 'issa', 'father'),
    ];

    it('is a step-nephew, never a chain or no name', () => {
      const [path] = findKinshipPaths('me', 'issa', tree);
      expect(path.kind).toBe('marriage');
      expect(kinds(path)).toEqual(['parent', 'child', 'spouse', 'child']);
      expect(path.relation).toEqual({ name: 'step-relative', label: 'step-niece or step-nephew' });
      expect(terms('me', 'issa', tree)).toEqual(['step-niece or step-nephew']);
      expect(terms('me', 'issa', [...tree, gendered('issa', 'male')])).toEqual(['step-nephew']);
    });

    it('is a nephew or niece once also linked to the sibling, gendered when known', () => {
      const linked = [...tree, parent('may', 'issa', 'mother')];
      expect(findKinshipPaths('me', 'issa', linked)[0].relation).toEqual({ name: 'niece or nephew', label: 'niece or nephew' });
      expect(terms('me', 'issa', linked)[0]).toBe('niece or nephew');
      expect(terms('me', 'issa', [...linked, gendered('issa', 'male')])[0]).toBe('nephew');
      expect(terms('me', 'issa', [...linked, gendered('issa', 'female')])[0]).toBe('niece');
    });
  });

  it('blood terms at depth: great-grandparent, great-aunt, third cousin', () => {
    const fixture = (fromId: string, toId: string) => terms(fromId, toId, links)[0];
    expect(fixture(P.yusufJr, P.idris)).toBe('great-grandfather');
    expect(fixture(P.hani, P.yusuf)).toBe('great-uncle');
    expect(fixture(P.hani, P.khalil)).toBe('great-aunt or great-uncle');

    // Two lines of four generations down from one couple: third cousins, then twice removed.
    const line = (name: string, length: number) =>
      Array.from({ length }, (_, i) => parent(i === 0 ? 'root' : `${name}${i}`, `${name}${i + 1}`));
    const tree = [...line('a', 4), ...line('b', 6)];
    expect(findKinshipPaths('a4', 'b4', tree)[0].relation).toEqual({
      name: 'cousin', label: 'third cousin', cousinDegree: 3, timesRemoved: 0,
    });
    expect(terms('a4', 'b6', tree)).toEqual(['third cousin twice removed']);
    expect(terms('a2', 'root', tree)).toEqual(['grandparent']);
    expect(terms('b6', 'root', tree)).toEqual(['4th great-grandparent']);
    expect(terms('a1', 'b3', tree)).toEqual(['grandniece or grandnephew']);
  });

  it('in-law at the spouse end: mother-in-law, brother-in-law, grandparent-in-law', () => {
    const tree = [
      married('me', 'wife'),
      parent('mum', 'wife', 'mother'),
      parent('mum', 'brother', 'mother'),
      gendered('brother', 'male'),
      parent('granny', 'mum', 'mother'),
    ];
    expect(terms('me', 'mum', tree)).toEqual(['mother-in-law']);
    expect(terms('me', 'brother', tree)).toEqual(['brother-in-law']);
    expect(terms('me', 'granny', tree)).toEqual(['grandmother-in-law']);
    // The spouse's sibling's spouse.
    const withSpouse = [...tree, married('brother', 'hisWife'), gendered('hisWife', 'female')];
    expect(terms('me', 'hisWife', withSpouse)).toEqual(['sister-in-law']);
  });

  it('in-law at the far end: son-in-law, sister-in-law, aunt by marriage', () => {
    expect(terms(P.faris, P.omar, links)).toEqual(['son-in-law']);
    const tree = [
      parent('gran', 'dad', 'father'),
      parent('gran', 'uncle', 'father'),
      parent('dad', 'me', 'father'),
      parent('dad', 'brother', 'father'),
      married('uncle', 'auntie'),
      married('brother', 'sisterInLaw'),
      gendered('auntie', 'female'),
      gendered('sisterInLaw', 'female'),
    ];
    expect(findKinshipPaths('me', 'auntie', tree)[0].relation).toEqual({
      name: 'in-law', label: 'aunt or uncle by marriage', side: 'father',
    });
    expect(terms('me', 'auntie', tree)).toEqual(['aunt by marriage']);
    expect(terms('me', 'sisterInLaw', tree)).toEqual(['sister-in-law']);
  });

  it('step-relations at depth: stepmother, step-grandchild, step-sibling', () => {
    const tree = [
      parent('dad', 'me', 'father'),
      married('dad', 'stepmum'),
      parent('stepmum', 'stepsister', 'mother'),
      gendered('stepmum', 'female'),
      gendered('stepsister', 'female'),
      married('me', 'wife'),
      parent('wife', 'stepson', 'mother'),
      parent('stepson', 'stepgrandson', 'father'),
      gendered('stepgrandson', 'male'),
    ];
    expect(terms('me', 'stepmum', tree)).toEqual(['stepmother']);
    expect(terms('me', 'stepsister', tree)).toEqual(['stepsister']);
    expect(terms('me', 'stepson', tree)).toEqual(['stepson']);
    expect(findKinshipPaths('me', 'stepgrandson', tree)[0].relation).toEqual({ name: 'step-relative', label: 'step-grandchild' });
    expect(terms('me', 'stepgrandson', tree)).toEqual(['step-grandson']);
  });

  it('neutral words when the gender is not recorded', () => {
    const tree = [parent('dad', 'me', 'father'), parent('dad', 'sib'), parent('sib', 'kid'), married('me', 'spouse')];
    expect(terms('me', 'sib', tree)).toEqual(['sibling']);
    expect(terms('me', 'kid', tree)).toEqual(['niece or nephew']);
    expect(terms('sib', 'spouse', tree)).toEqual(['sibling-in-law']);
    expect(terms('dad', 'me', tree)).toEqual(['child']);
  });

  it('two terms joined by one Person when no one word fits, never a longer chain', () => {
    // Through a divorce: the former wife's child.
    expect(terms(P.tarek, P.nour, links)).toEqual([`former wife ${P.layla}'s child`]);
    // A sibling's spouse's parent: no English word.
    const tree = [
      parent('dad', 'me', 'father'),
      parent('dad', 'may', 'father'),
      gendered('may', 'female'),
      married('ammar', 'may'),
      parent('hisMum', 'ammar', 'mother'),
    ];
    const [path] = findKinshipPaths('me', 'hisMum', tree);
    expect(path.relation).toMatchObject({ name: 'two terms', label: "sibling's parent-in-law", via: { personId: 'may' } });
    expect(terms('me', 'hisMum', tree)).toEqual(["sister may's mother-in-law"]);
  });

  it('a chain no two terms fit is the fewest terms joined at Persons on it, never step by step', () => {
    const tree = [married('a', 'b'), married('b', 'c'), married('c', 'd'), gendered('b', 'female'), gendered('d', 'male')];
    const step = (fromId: string, toId: string): KinshipPath['steps'][number] => ({
      fromId,
      toId,
      kind: 'spouse',
      link: tree.find(l => l.type === 'marriage' && [l.source, l.target].includes(fromId) && [l.source, l.target].includes(toId)) as FamilyLink,
    });
    const relation = nameKinshipPath({ steps: [step('a', 'b'), step('b', 'c'), step('c', 'd')] }, tree)!;
    expect(relation).toMatchObject({
      name: 'joined terms',
      label: "spouse's spouse's spouse",
      via: { personId: 'b', second: { name: 'two terms', via: { personId: 'c' } } },
    });
    const genderOf = (id: string) => getRecordedGender(id, tree);
    expect(kinshipTermText(relation, 'd', { genderOf, nameOf: id => id })).toBe("wife b's spouse c's husband");
  });

  it('names every path found on 400 small random trees', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let t = 0; t < 400; t++) {
      const tree: FamilyLink[] = [];
      for (let i = 1; i < 10; i++) {
        const kind = random(3);
        if (kind === 0) tree.push(married(`p${random(i)}`, `p${i}`));
        else tree.push(parent(`p${random(i)}`, `p${i}`, random(2) ? 'father' : 'mother'));
      }
      for (let a = 0; a < 10; a++) {
        for (let b = 0; b < 10; b++) {
          for (const path of findKinshipPaths(`p${a}`, `p${b}`, tree)) {
            expect(path.relation.label).toBeTruthy();
            if (path.relation.via) expect(path.personIds).toContain(path.relation.via.personId);
          }
        }
      }
    }
  });
});

describe('findPersonsByName', () => {
  const find = (name: string) => findPersonsByName(name, FIXTURE_PERSONS, links);

  it('returns every Person with the given name, each with the father\'s name', () => {
    expect(find('Omar')).toEqual([
      { personId: P.omar, displayName: 'Omar Haddad', fatherId: P.yusuf, fatherName: 'Yusuf Haddad' },
      { personId: P.omarZaher, displayName: 'Omar Zaher', fatherId: P.munir, fatherName: 'Munir Zaher' },
    ]);
  });

  it('tells two Persons with the same display name apart by the father', () => {
    expect(find('Yusuf Haddad')).toEqual([
      { personId: P.yusuf, displayName: 'Yusuf Haddad', fatherId: P.idris, fatherName: 'Idris Haddad' },
      { personId: P.yusufJr, displayName: 'Yusuf Haddad', fatherId: P.omar, fatherName: 'Omar Haddad' },
    ]);
  });

  it('narrows a given name by the cluster', () => {
    expect(find('Layla Zaher').map(m => m.personId)).toEqual([P.laylaZaher]);
    expect(find('Layla').map(m => m.personId)).toEqual([P.layla, P.laylaZaher]);
  });

  it('ignores case and extra spaces', () => {
    expect(find('  omar   HADDAD ').map(m => m.personId)).toEqual([P.omar]);
  });

  it('matches whole words only', () => {
    expect(find('Om')).toEqual([]);
    expect(find('Omar Had')).toEqual([]);
  });

  it('gives no father\'s name when no father is recorded', () => {
    // Karim has no parents; Tarek has a parent with no parent_role; Sami has only a father.
    expect(find('Karim')).toEqual([
      { personId: P.karim, displayName: 'Karim Qasim', fatherId: null, fatherName: null },
    ]);
    expect(find('Tarek')[0]).toMatchObject({ fatherId: null, fatherName: null });
    expect(find('Sami')[0]).toMatchObject({ fatherName: 'Hani Khoury' });
  });

  it('returns an empty list for no match or an empty name', () => {
    expect(find('Zorro')).toEqual([]);
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
  });

  it('does not match a Person with no name on the placeholder display name', () => {
    const nameless: FamilyNode[] = [{ id: 'x', firstName: '' }];
    expect(findPersonsByName('Unknown', nameless, [])).toEqual([]);
  });

  it('keeps the father\'s id when the father is recorded but not among the Persons passed in', () => {
    const onlyOmar = FIXTURE_PERSONS.filter(p => p.id === P.omar);
    expect(findPersonsByName('Omar', onlyOmar, links)).toEqual([
      { personId: P.omar, displayName: 'Omar Haddad', fatherId: P.yusuf, fatherName: null },
    ]);
  });
});

/**
 * A made-up Tree Record of exactly `size` Persons: 20 founding couples, three
 * children for each couple, and marriages between the children of different
 * couples in every generation, so the tree is one connected piece with many
 * marriages between relatives.
 */
function buildLargeTree(size: number): { persons: FamilyNode[]; links: FamilyLink[] } {
  const persons: FamilyNode[] = [];
  const treeLinks: FamilyLink[] = [];
  const fatherOf = new Map<string, string>();
  const add = (cluster: string): string => {
    const id = `big-${persons.length}`;
    persons.push({ id, firstName: `Name${persons.length % 50}`, familyCluster: cluster });
    return id;
  };
  let couples: Array<[string, string]> = [];
  for (let i = 0; i < 20; i++) couples.push([add(`Clan${i}`), add(`Clan${i}`)]);
  while (persons.length < size) {
    const generation: string[] = [];
    for (const [father, mother] of couples) {
      treeLinks.push({ source: father, target: mother, type: 'marriage' });
      for (let c = 0; c < 3 && persons.length < size; c++) {
        const child = add(`Clan${persons.length % 20}`);
        fatherOf.set(child, father);
        treeLinks.push({ source: father, target: child, type: 'parent', parentRole: 'father' });
        treeLinks.push({ source: mother, target: child, type: 'parent', parentRole: 'mother' });
        generation.push(child);
      }
    }
    couples = [];
    for (let i = 0, j = generation.length - 1; i < j; i++, j--) {
      if (fatherOf.get(generation[i]) !== fatherOf.get(generation[j])) {
        couples.push([generation[i], generation[j]]);
      }
    }
  }
  return { persons, links: treeLinks };
}

describe('a Tree Record of 1,000 Persons', () => {
  const big = buildLargeTree(1000);
  const last = big.persons[big.persons.length - 1].id;
  const middle = big.persons[600].id;
  const founder = big.persons[0].id;
  // Generous: a chat reply shows no visible wait below about 100 ms.
  const LIMIT_MS = 100;

  const timed = (call: () => unknown): number => {
    call(); // warm up
    const start = performance.now();
    call();
    return performance.now() - start;
  };

  it('is the size it claims and is connected', () => {
    expect(big.persons).toHaveLength(1000);
    expect(findKinshipPaths(last, founder, big.links).length).toBeGreaterThan(0);
  });

  it('answers each relatives list fast enough for chat', () => {
    const relativeKinds: RelativeKind[] = [
      'parents', 'children', 'siblings', 'spouses', 'grandparents', 'grandchildren',
      'auntsAndUncles', 'cousins', 'niecesAndNephews', 'inLaws', 'ancestors', 'descendants',
    ];
    for (const kind of relativeKinds) {
      for (const personId of [founder, middle, last]) {
        const ms = timed(() => getRelatives(personId, kind, big.links, { side: 'mother', gender: 'female' }));
        expect(ms, `${kind} of ${personId}`).toBeLessThan(LIMIT_MS);
      }
    }
  });

  it('finds the Kinship Path fast enough for chat, connected or not', () => {
    const withStranger: FamilyLink[] = [
      ...big.links,
      { source: 'stranger-parent', target: 'stranger', type: 'parent', parentRole: 'mother' },
    ];
    expect(timed(() => findKinshipPaths(last, founder, big.links))).toBeLessThan(LIMIT_MS);
    expect(timed(() => findKinshipPaths(last, middle, big.links))).toBeLessThan(LIMIT_MS);
    expect(timed(() => findKinshipPaths(founder, big.persons[39].id, big.links))).toBeLessThan(LIMIT_MS);
    // No path: the search has to walk the whole tree before it gives up.
    expect(findKinshipPaths(last, 'stranger', withStranger)).toEqual([]);
    expect(timed(() => findKinshipPaths(last, 'stranger', withStranger))).toBeLessThan(LIMIT_MS);
  });

  it('finds Persons by name fast enough for chat', () => {
    expect(findPersonsByName('Name7', big.persons, big.links)).toHaveLength(20);
    expect(timed(() => findPersonsByName('Name7', big.persons, big.links))).toBeLessThan(LIMIT_MS);
  });
});
