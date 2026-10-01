import { describe, expect, it } from 'vitest';
import { MAX_TOOL_RESULT_CHARS } from '../../supabase/functions/family-chat/request.ts';
import type { FamilyLink, FamilyNode } from '../types/graph';
import { runChatTool } from './chatTools';
import { FIXTURE_IDS as P, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';

function run(name: string, args: Record<string, unknown> | null) {
  return JSON.parse(runChatTool({ id: 'call-1', name, arguments: args }, KINSHIP_FIXTURE_TREE));
}

describe('runChatTool: getRelatives', () => {
  it("lists Omar Haddad's cousins on his mother's side, with the total", () => {
    const result = run('getRelatives', { personId: P.omar, kind: 'cousins', side: 'mother' });
    expect(result.person).toBe('Omar Haddad');
    expect(result.total).toBe(2);
    expect(result.relatives.map((r: { displayName: string }) => r.displayName).sort()).toEqual([
      'Tala Mansour',
      'Ziad Mansour',
    ]);
  });
});

describe('runChatTool: findPersonsByName', () => {
  it("returns both Persons named Yusuf Haddad, each with the father's name, so the chat can ask which", () => {
    const result = run('findPersonsByName', { name: 'Yusuf Haddad' });
    expect(result.total).toBe(2);
    expect(result.matches).toEqual([
      { personId: P.yusuf, displayName: 'Yusuf Haddad', fatherName: 'Idris Haddad' },
      { personId: P.yusufJr, displayName: 'Yusuf Haddad', fatherName: 'Omar Haddad' },
    ]);
    expect(result.note).toMatch(/ask the user which/i);
  });
});

describe('runChatTool: findKinshipPaths', () => {
  it('gives the Kinship Term from code, with the side, and no chain to name', () => {
    const result = run('findKinshipPaths', { fromPersonId: P.tala, toPersonId: P.omar });
    expect(result.paths).toEqual([{ kind: 'blood', term: "first cousin, father's side" }]);
    expect(result.note).toMatch(/exactly as given/i);
  });

  it('gives a gendered term at depth, and two terms joined by one Person when no one word fits', () => {
    expect(run('findKinshipPaths', { fromPersonId: P.rima, toPersonId: P.idris }).paths).toEqual([
      { kind: 'blood', term: "great-grandfather, father's side" },
    ]);
    expect(run('findKinshipPaths', { fromPersonId: P.tarek, toPersonId: P.nour }).paths).toEqual([
      { kind: 'marriage', term: "former wife Layla Haddad's child" },
    ]);
  });

  it('gives the blood path of two married cousins first, then the marriage', () => {
    const result = run('findKinshipPaths', { fromPersonId: P.omar, toPersonId: P.sara });
    expect(result.from).toBe('Omar Haddad');
    expect(result.to).toBe('Sara Khoury');
    expect(result.paths).toEqual([
      { kind: 'blood', term: "first cousin, father's side" },
      { kind: 'marriage', term: 'wife' },
    ]);
    expect(result.note).toMatch(/blood term first.*also related by marriage/i);
  });

  it('says when two Persons are not related', () => {
    const result = run('findKinshipPaths', { fromPersonId: P.omar, toPersonId: P.omarZaher });
    expect(result.paths).toEqual([]);
    expect(result.note).toMatch(/not related/i);
  });
});

describe('runChatTool: getTreeCounts', () => {
  it('counts the Persons and the Kinship Links of each type', () => {
    expect(run('getTreeCounts', {})).toEqual({
      persons: 41,
      kinshipLinks: { parent: 48, marriage: 11, divorce: 1 },
    });
  });
});

describe('runChatTool: getFamilyOverview', () => {
  it('gives the whole tree as counts, with no list of the Persons', () => {
    const result = run('getFamilyOverview', {});
    expect(result).toMatchObject({ family: null, persons: 41, generations: 5, branches: 11 });
    expect(result.founders.total).toBe(9);
    expect(result.note).toMatch(/short overview/i);
  });

  it('gives one family as counts', () => {
    expect(run('getFamilyOverview', { familyName: 'Haddad' })).toMatchObject({
      family: 'Haddad',
      persons: 8,
      generations: 4,
      founders: { total: 1, names: ['Idris Haddad'] },
      branches: 3,
    });
  });

  it('names the families there are when no Person has the family name', () => {
    const result = run('getFamilyOverview', { familyName: 'Smith' });
    expect(result.error).toMatch(/no person has the family name smith/i);
    expect(result.largestFamilies.map((f: { name: string }) => f.name)).toContain('Haddad');
  });

  it('refuses a family name that is not text', () => {
    expect(run('getFamilyOverview', { familyName: 7 }).error).toMatch(/familyName/);
  });
});

describe('runChatTool: arguments the model got wrong', () => {
  it.each([
    ['an unknown tool', 'deleteEveryone', { personId: P.omar }, /no tool/i],
    ['arguments that are not an object', 'getRelatives', null, /arguments/i],
    ['an unknown personId', 'getRelatives', { personId: 'nobody', kind: 'cousins' }, /no person has the personid/i],
    ['an unknown kind', 'getRelatives', { personId: P.omar, kind: 'friends' }, /kind/i],
    ['an unknown side', 'getRelatives', { personId: P.omar, kind: 'cousins', side: 'left' }, /side/i],
    ['an unknown gender', 'getRelatives', { personId: P.omar, kind: 'cousins', gender: 'x' }, /gender/i],
    ['a missing name', 'findPersonsByName', {}, /name/i],
    ['an unknown second Person', 'findKinshipPaths', { fromPersonId: P.omar, toPersonId: 'p8' }, /no person has the personid/i],
  ])('answers %s with an error the model can read', (_why, name, args, message) => {
    const result = run(name, args);
    expect(result.error).toMatch(message);
  });
});

describe('runChatTool: filters', () => {
  it("keeps only the aunts on Omar Haddad's mother's side when asked for female relatives", () => {
    const result = run('getRelatives', { personId: P.omar, kind: 'auntsAndUncles', side: 'mother', gender: 'female' });
    // Amal has no children, so the record cannot tell her gender; Samir is a father.
    expect(result.relatives).toEqual([]);
    const all = run('getRelatives', { personId: P.omar, kind: 'auntsAndUncles', side: 'mother' });
    expect(all.relatives.map((r: { displayName: string }) => r.displayName).sort()).toEqual(['Amal Mansour', 'Samir Mansour']);
  });
});

describe('runChatTool: recorded gender', () => {
  it("reads a Person's own gender before parent_role", () => {
    const record = {
      ...KINSHIP_FIXTURE_TREE,
      nodes: KINSHIP_FIXTURE_TREE.nodes.map((node) => (node.id === P.amal ? { ...node, gender: 'female' as const } : node)),
    };
    const result = JSON.parse(
      runChatTool({ id: 'call-1', name: 'getRelatives', arguments: { personId: P.omar, kind: 'auntsAndUncles', side: 'mother', gender: 'female' } }, record),
    );
    expect(result.relatives.map((r: { displayName: string }) => r.displayName)).toEqual(['Amal Mansour']);
  });
});

describe('runChatTool: a large list', () => {
  // A founder with 900 children, and 300 Persons who are not related to them.
  const founder: FamilyNode = { id: 'founder', firstName: 'Founder', familyCluster: 'Big' };
  const children: FamilyNode[] = Array.from({ length: 900 }, (_, i) => ({
    id: `child-0000-0000-0000-${String(i).padStart(12, '0')}`,
    firstName: `Child${i}`,
    familyCluster: 'Bigfamilyname',
  }));
  const strangers: FamilyNode[] = Array.from({ length: 300 }, (_, i) => ({
    id: `stranger-${i}`,
    firstName: `Stranger${i}`,
    familyCluster: 'Elsewhere',
  }));
  const links: FamilyLink[] = children.map((c) => ({
    source: founder.id,
    target: c.id,
    type: 'parent',
    parentRole: 'father',
  }));
  const tree = { nodes: [founder, ...children, ...strangers], links };

  it('fits in one tool turn, keeps the full total, and sends nothing but the relatives', () => {
    const content = runChatTool(
      { id: 'c', name: 'getRelatives', arguments: { personId: 'founder', kind: 'children' } },
      tree,
    );
    expect(content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    const result = JSON.parse(content);
    expect(result.total).toBe(900);
    expect(result.relatives.length).toBeGreaterThan(100);
    expect(result.note).toMatch(/too long/i);
    expect(content).not.toMatch(/Stranger/);
  });

  it('drops the ids before it drops any name', () => {
    const someChildren = { nodes: tree.nodes, links: links.slice(0, 300) };
    const result = JSON.parse(
      runChatTool({ id: 'c', name: 'getRelatives', arguments: { personId: 'founder', kind: 'children' } }, someChildren),
    );
    expect(result.total).toBe(300);
    expect(result.relatives).toHaveLength(300);
    expect(result.relatives[0]).toBe('Child0 Bigfamilyname');
  });
});
