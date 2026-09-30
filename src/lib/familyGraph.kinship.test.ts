import { describe, it, expect } from 'vitest';
import {
  getRelatives,
  getRecordedGender,
  findKinshipPaths,
  nameKinshipPath,
  findPersonsByName,
} from './familyGraph';
import type { KinshipPath, RelativeKind } from './familyGraph';
import type { FamilyLink, FamilyNode } from '../types/graph';
import { FIXTURE_IDS as P, FIXTURE_LINKS as links, FIXTURE_PERSONS } from './fixtures/kinshipFixtureTree';

/** Order of a relatives list is not part of the contract. */
const sorted = (ids: readonly string[]) => [...ids].sort();

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
      source: byId.get(l.source as string) as FamilyNode,
      target: byId.get(l.target as string) as FamilyNode,
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

  it('returns no path, not an error, for two Persons with no connection', () => {
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
    expect(paths[0].relation).toBeNull();
  });

  it('resolves Kinship Link endpoints that are node objects', () => {
    const byId = new Map(FIXTURE_PERSONS.map(p => [p.id, p] as const));
    const live: FamilyLink[] = links.map(l => ({
      ...l,
      source: byId.get(l.source as string) as FamilyNode,
      target: byId.get(l.target as string) as FamilyNode,
    }));
    const paths = findKinshipPaths(P.omar, P.sara, live);
    expect(paths.map(p => p.kind)).toEqual(['blood', 'marriage']);
    expect(paths[0].personIds).toHaveLength(5);
  });
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

  it('returns the chain with no name when no rule fits', () => {
    // Great-grandparent: a blood path, but not in the fixed rules.
    const [greatGrandparent] = findKinshipPaths(P.yusufJr, P.idris, links);
    expect(greatGrandparent.kind).toBe('blood');
    expect(greatGrandparent.personIds).toEqual([P.yusufJr, P.omar, P.yusuf, P.idris]);
    expect(greatGrandparent.steps).toHaveLength(3);
    expect(greatGrandparent.relation).toBeNull();

    // The child of a former spouse: a path through a divorce, not a step-child.
    const [formerStepChild] = findKinshipPaths(P.tarek, P.nour, links);
    expect(formerStepChild.kind).toBe('marriage');
    expect(kinds(formerStepChild)).toEqual(['formerSpouse', 'child']);
    expect(formerStepChild.relation).toBeNull();
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
