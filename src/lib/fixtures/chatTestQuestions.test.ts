import { describe, expect, it } from 'vitest';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import {
  findKinshipPaths,
  findPersonsByName,
  getRecordedGender,
  getRelatives,
  type KinshipRelation,
  type RelativeFilter,
  type RelativeKind,
} from '../familyGraph';
import { familyOverview } from '../familyOverview';
import { kinshipTermText } from '../kinshipTerm';
import { CHAT_TEST_QUESTIONS, CHAT_TEST_SPEAKER } from './chatTestQuestions';
import { CHAT_TEST_IDS as P, CHAT_TEST_PERSONS, CHAT_TEST_TREE } from './kinshipFixtureTree';

const { links, nodes } = CHAT_TEST_TREE;
const me = CHAT_TEST_SPEAKER.personId;
const nameOf = (id: string) => formatNodeDisplayName(CHAT_TEST_PERSONS.find((person) => person.id === id)!);
const names = (ids: string[]) => ids.map(nameOf).sort();
const relatives = (id: string, kind: RelativeKind, filter?: RelativeFilter) =>
  names(getRelatives(id, kind, links, { ...filter, persons: nodes }));
const byId = (id: string) => CHAT_TEST_QUESTIONS.find((q) => q.id === id)!;

const termsForAToB = (a: string, b: string) =>
  findKinshipPaths(b, a, links).map((path) =>
    kinshipTermText(path.relation, a, { genderOf: (id) => getRecordedGender(id, links, nodes), nameOf }),
  );

const termCount = (relation: KinshipRelation): number => (relation.via ? 1 + termCount(relation.via.second) : 1);

describe('the chat test questions', () => {
  it('have unique ids', () => {
    expect(new Set(CHAT_TEST_QUESTIONS.map((q) => q.id)).size).toBe(CHAT_TEST_QUESTIONS.length);
  });

  it('name only Persons of the test tree', () => {
    const treeNames = new Set(CHAT_TEST_PERSONS.map((person) => formatNodeDisplayName(person)));
    for (const q of CHAT_TEST_QUESTIONS) {
      for (const name of [...(q.expect.names ?? []), ...(q.expect.allow ?? [])]) expect(treeNames, `${q.id}: ${name}`).toContain(name);
    }
    expect(nameOf(CHAT_TEST_SPEAKER.personId)).toBe(CHAT_TEST_SPEAKER.displayName);
  });

  it('are asked on a tree where each Person has a gender but one', () => {
    expect(CHAT_TEST_PERSONS.filter((person) => !person.gender).map((person) => nameOf(person.id))).toEqual(['Ziad Mansour']);
    expect(getRecordedGender(P.ziad, links, nodes)).toBeNull();
  });

  it('expect the relatives the tree has', () => {
    const expected: Record<string, string[]> = {
      'my-parents': relatives(me, 'parents'),
      'my-brother': relatives(me, 'siblings', { gender: 'male' }),
      'my-nieces-nephews': relatives(me, 'niecesAndNephews'),
      'my-paternal-grandparents': relatives(me, 'grandparents', { side: 'father' }),
      'layla-children': relatives(P.layla, 'children'),
      'idris-granddaughters': relatives(P.idris, 'grandchildren', { gender: 'female' }),
      'tala-paternal-cousins': relatives(P.tala, 'cousins', { side: 'father' }),
      'karim-spouse': relatives(P.karim, 'spouses'),
      'adel-grandchildren-count': relatives(P.adel, 'grandchildren'),
      'my-cousins-count': relatives(me, 'cousins'),
      amto: relatives(me, 'auntsAndUncles', { side: 'father', gender: 'female' }),
      'jiddo-mama-side': relatives(me, 'grandparents', { side: 'mother', gender: 'male' }),
    };
    for (const [id, want] of Object.entries(expected)) {
      expect([...(byId(id).expect.names ?? [])].sort(), id).toEqual(want);
    }
    expect(relatives(P.idris, 'grandchildren', { gender: 'male' })).toEqual(['Nabil Khoury', 'Omar Haddad']);
    expect(relatives(me, 'siblings')).toEqual(['Hani Khoury']);
  });

  it('expect the counts the tree has', () => {
    expect(byId('adel-grandchildren-count').expect.number).toBe(getRelatives(P.adel, 'grandchildren', links).length);
    expect(byId('my-cousins-count').expect.number).toBe(getRelatives(me, 'cousins', links).length);
    expect(byId('tree-size').expect.number).toBe(CHAT_TEST_PERSONS.length);
  });

  it('expect the Kinship Term the code names, blood first, and no path for the island', () => {
    // "How is A related to B": what A is to B.
    const pairs: Record<string, [a: string, b: string]> = {
      cousin: [P.tala, P.omar],
      'in-law': [P.faris, P.dina],
      step: [P.karim, P.jad],
      'once-removed': [P.rima, P.sami],
      'niece-both-parents': [P.lara, me],
      'great-grandparent': [P.idris, me],
      'great-aunt': [P.amal, P.rima],
      'third-cousin': [P.lina, P.sami],
      'step-grandchild': [P.lina, P.karim],
      'son-in-law': [P.karim, P.huda],
      'two-terms': [P.karim, me],
      'no-gender': [P.ziad, P.samir],
      'married-cousins': [P.omar, P.sara],
    };
    expect(Object.fromEntries(Object.entries(pairs).map(([id, [a, b]]) => [id, termsForAToB(a, b)]))).toEqual({
      cousin: ['first cousin'],
      'in-law': ['father-in-law'],
      step: ['stepfather'],
      'once-removed': ['first cousin once removed'],
      'niece-both-parents': ['niece'],
      'great-grandparent': ['great-grandfather'],
      'great-aunt': ['great-aunt'],
      'third-cousin': ['third cousin'],
      'step-grandchild': ['step-granddaughter'],
      'son-in-law': ['son-in-law'],
      'two-terms': ["first cousin once removed Layla Haddad's husband"],
      'no-gender': ['child'],
      'married-cousins': ['first cousin', 'husband'],
    });

    for (const [id, [a, b]] of Object.entries(pairs)) {
      const { relations = [], forbid = [], joinedTerms = 1 } = byId(id).expect;
      const said = termsForAToB(a, b).join(' ');
      for (const relation of relations) expect(said, `${id}: ${relation}`).toMatch(relation);
      for (const word of forbid) expect(said, `${id}: ${word}`).not.toMatch(word);
      expect(termCount(findKinshipPaths(b, a, links)[0].relation), id).toBe(joinedTerms);
    }
    expect(findKinshipPaths(P.fuad, P.idris, links)).toEqual([]);
  });

  it('expect "khalo" for the mother\'s brother', () => {
    expect(termsForAToB(P.walid, me)).toEqual(['uncle']);
    expect(findKinshipPaths(me, P.walid, links)[0].relation.side).toBe('mother');
  });

  it('ask about a given name with two matches', () => {
    expect(names(findPersonsByName('Omar', nodes, links).map((m) => m.personId))).toEqual([...(byId('two-omars').expect.names ?? [])].sort());
  });

  it('expect the counts and names of the family overview for the open questions', () => {
    const whole = familyOverview(CHAT_TEST_TREE)!;
    const haddad = familyOverview(CHAT_TEST_TREE, 'Haddad')!;
    expect(byId('about-the-family').expect).toEqual({ number: whole.persons, allow: whole.founders.names });
    expect(byId('haddad-family').expect).toEqual({ number: haddad.persons, allow: haddad.founders.names });
  });
});
