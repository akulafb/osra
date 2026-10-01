import { describe, expect, it } from 'vitest';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import {
  findKinshipPaths,
  findPersonsByName,
  getRelatives,
  type RelativeFilter,
  type RelativeKind,
} from '../familyGraph';
import { CHAT_TEST_QUESTIONS, CHAT_TEST_SPEAKER } from './chatTestQuestions';
import { FIXTURE_IDS as P, FIXTURE_PERSONS, KINSHIP_FIXTURE_TREE } from './kinshipFixtureTree';

const { links } = KINSHIP_FIXTURE_TREE;
const nameOf = (id: string) => formatNodeDisplayName(FIXTURE_PERSONS.find((person) => person.id === id)!);
const names = (ids: string[]) => ids.map(nameOf).sort();
const relatives = (id: string, kind: RelativeKind, filter?: RelativeFilter) => names(getRelatives(id, kind, links, filter));
const byId = (id: string) => CHAT_TEST_QUESTIONS.find((q) => q.id === id)!;

describe('the chat test questions', () => {
  it('are 20, with unique ids, covering every group the ticket asks for', () => {
    expect(CHAT_TEST_QUESTIONS).toHaveLength(20);
    expect(new Set(CHAT_TEST_QUESTIONS.map((q) => q.id)).size).toBe(20);
    const groups = CHAT_TEST_QUESTIONS.reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.group]: (acc[q.group] ?? 0) + 1 }), {});
    expect(groups).toEqual({ relatives: 8, count: 3, how_related: 4, married_cousins: 1, two_matches: 1, no_path: 1, arabic: 2 });
  });

  it('name only Persons of the test tree', () => {
    const fixtureNames = new Set(FIXTURE_PERSONS.map((person) => formatNodeDisplayName(person)));
    for (const q of CHAT_TEST_QUESTIONS) {
      for (const name of [...(q.expect.names ?? []), ...(q.expect.allow ?? [])]) expect(fixtureNames, `${q.id}: ${name}`).toContain(name);
    }
    expect(nameOf(CHAT_TEST_SPEAKER.personId)).toBe(CHAT_TEST_SPEAKER.displayName);
  });

  it('expect the relatives the tree has', () => {
    const me = CHAT_TEST_SPEAKER.personId;
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
    // Every Person in the tree must be told apart by gender for the gendered questions.
    expect(relatives(P.idris, 'grandchildren', { gender: 'male' })).toEqual(['Nabil Khoury', 'Omar Haddad']);
    expect(relatives(me, 'siblings')).toEqual(['Hani Khoury']);
  });

  it('expect the counts the tree has', () => {
    expect(byId('adel-grandchildren-count').expect.number).toBe(getRelatives(P.adel, 'grandchildren', links).length);
    expect(byId('my-cousins-count').expect.number).toBe(getRelatives(CHAT_TEST_SPEAKER.personId, 'cousins', links).length);
    expect(byId('tree-size').expect.number).toBe(FIXTURE_PERSONS.length);
  });

  it('expect the relation the code names, blood first, and no path for the island', () => {
    // "How is A related to B": what A is to B.
    const relation = (a: string, b: string) => findKinshipPaths(b, a, links).map((path) => path.relation?.label);
    expect(relation(P.tala, P.omar)).toEqual(['first cousin']);
    expect(relation(P.faris, P.dina)).toEqual(['parent-in-law']);
    expect(relation(P.karim, P.jad)).toEqual(['step-parent']);
    expect(relation(P.rima, P.sami)).toEqual(['first cousin once removed']);
    expect(findKinshipPaths(P.omar, P.sara, links).map((path) => [path.kind, path.relation?.label])).toEqual([
      ['blood', 'first cousin'],
      ['marriage', 'spouse'],
    ]);
    expect(findKinshipPaths(P.fuad, P.idris, links)).toEqual([]);
    for (const id of ['cousin', 'in-law', 'step', 'once-removed', 'married-cousins', 'no-path']) {
      expect(byId(id).expect.names ?? [], id).toEqual([]);
    }
  });

  it('ask about a given name with two matches', () => {
    expect(names(findPersonsByName('Omar', KINSHIP_FIXTURE_TREE.nodes, links).map((m) => m.personId))).toEqual(
      [...(byId('two-omars').expect.names ?? [])].sort(),
    );
  });
});
