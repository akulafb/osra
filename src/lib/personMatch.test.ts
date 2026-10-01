import { describe, it, expect } from 'vitest';
import {
  connectedPersonIds,
  matchExistingPersons,
  readMatchResolution,
  MATCH_CANDIDATE_LIMIT,
  MIN_MATCH_QUERY_LENGTH,
  SPELLING_MATCH_THRESHOLD,
  spellingLookupQuery,
  spellingScoresFrom,
} from './personMatch';
import { FamilyLink, FamilyNode } from '../types/graph';

const nodes: FamilyNode[] = [
  { id: 'a', firstName: 'Ahmad', familyCluster: 'Badran' },
  { id: 'b', firstName: 'Sara', familyCluster: 'Haddad' },
  { id: 'c', firstName: 'Ali', familyCluster: 'Badran' },
  { id: 'd', firstName: 'Amal', maternalFamilyCluster: 'Badran' },
  { id: 'e', firstName: 'Aya', familyCluster: 'Badran' },
  { id: 'f', firstName: 'Adam', familyCluster: 'Badran' },
];

/** Ids of the matches a resolution carries, in order. */
function matchIds(resolution: ReturnType<typeof matchExistingPersons>): string[] {
  return resolution.kind === 'none' ? [] : resolution.matches.map((m) => m.person.id);
}

function creating(query: string, overrides: Partial<Parameters<typeof matchExistingPersons>[0]> = {}) {
  return matchExistingPersons({
    query,
    intent: 'creating',
    pool: nodes,
    excludePersonId: 'zzz',
    ...overrides,
  });
}

describe('matchExistingPersons — query length', () => {
  it('resolves to none until the query has at least two characters', () => {
    expect(creating('').kind).toBe('none');
    expect(creating('a').kind).toBe('none');
    expect(matchIds(creating('ah'))).toEqual(['a']);
    expect(MIN_MATCH_QUERY_LENGTH).toBe(2);
  });

  it('ignores surrounding whitespace when measuring the query', () => {
    expect(creating('  a  ').kind).toBe('none');
    expect(matchIds(creating('  ahmad  '))).toEqual(['a']);
  });
});

describe('matchExistingPersons — what counts as a match (the cases the deleted ghost-node lookup carried)', () => {
  it('matches case-insensitively on the given name', () => {
    expect(matchIds(creating('SARA'))).toEqual(['b']);
  });

  it('matches on family cluster as well as given name', () => {
    expect(matchIds(creating('haddad'))).toEqual(['b']);
  });

  it('matches on maternal family cluster', () => {
    expect(matchIds(creating('badran'))).toContain('d');
  });

  it('never matches the excluded person', () => {
    expect(creating('ahmad', { excludePersonId: 'a' }).kind).toBe('none');
  });

  it('resolves to none when nothing matches', () => {
    expect(creating('nobody')).toEqual({ kind: 'none' });
  });
});

describe('matchExistingPersons — resolution', () => {
  it('requires confirmation on an exact given-name match', () => {
    const result = creating('Ahmad');
    expect(result.kind).toBe('must-confirm');
  });

  it('is advisory when the query only matches as a substring', () => {
    const result = creating('Bad');
    expect(result.kind).toBe('candidates');
  });

  it('treats exactness as case- and whitespace-insensitive', () => {
    expect(creating('  aHmAd ').kind).toBe('must-confirm');
  });

  it('requires confirmation even when the exact match falls past the cap', () => {
    // 'a' prefixed names sort alphabetically; push Ahmad behind five other matches.
    const pool: FamilyNode[] = [
      { id: '1', firstName: 'Zed', familyCluster: 'Ahmadi' },
      { id: '2', firstName: 'Yara', familyCluster: 'Ahmadi' },
      { id: '3', firstName: 'Xena', familyCluster: 'Ahmadi' },
      { id: '4', firstName: 'Wael', familyCluster: 'Ahmadi' },
      { id: '5', firstName: 'Vera', familyCluster: 'Ahmadi' },
      { id: '6', firstName: 'Ahmad' },
    ];
    const result = matchExistingPersons({
      query: 'ahmad',
      intent: 'creating',
      pool,
      excludePersonId: 'zzz',
      limit: 2,
    });
    expect(result.kind).toBe('must-confirm');
    // The exact match sorts first, so it survives the cap even though five others matched.
    expect(matchIds(result)).toEqual(['6', '5']);
  });
});

describe('matchExistingPersons — capping and counting', () => {
  it('caps the matches it returns', () => {
    // 'badran' matches a, c, d, e, f — five people, one over the limit.
    const result = creating('badran');
    expect(matchIds(result)).toHaveLength(MATCH_CANDIDATE_LIMIT);
    expect(MATCH_CANDIDATE_LIMIT).toBe(4);
  });

  it('reports the uncapped total alongside the capped matches', () => {
    const result = creating('badran');
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.totalMatchCount).toBe(5);
  });

  it('honours an explicit limit', () => {
    expect(matchIds(creating('badran', { limit: 2 }))).toHaveLength(2);
  });
});

describe('matchExistingPersons — ordering', () => {
  it('puts the exact given-name match first, then sorts alphabetically', () => {
    const pool: FamilyNode[] = [
      { id: 'zaid', firstName: 'Zaid', familyCluster: 'Badran' },
      { id: 'ali', firstName: 'Ali', familyCluster: 'Badran' },
      { id: 'badran', firstName: 'Badran' },
    ];
    const result = matchExistingPersons({
      query: 'badran',
      intent: 'creating',
      pool,
      excludePersonId: 'zzz',
    });
    expect(matchIds(result)).toEqual(['badran', 'ali', 'zaid']);
  });
});

describe('matchExistingPersons — labelling', () => {
  it('marks everyone visible when no visible set is given', () => {
    const result = creating('badran');
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.matches.every((m) => m.isVisible)).toBe(true);
  });

  it('marks people absent from the visible set as hidden, without excluding them', () => {
    const result = creating('badran', { visibleIds: new Set(['a', 'c']) });
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.totalMatchCount).toBe(5);
    const visibility = Object.fromEntries(result.matches.map((m) => [m.person.id, m.isVisible]));
    expect(visibility).toMatchObject({ a: true, c: true, d: false });
  });

  it('marks already-connected people without excluding them', () => {
    const result = creating('badran', { connectedIds: new Set(['a']) });
    if (result.kind === 'none') throw new Error('expected matches');
    expect(matchIds(result)).toContain('a');
    expect(result.matches.find((m) => m.person.id === 'a')?.isAlreadyConnected).toBe(true);
    expect(result.matches.find((m) => m.person.id === 'c')?.isAlreadyConnected).toBe(false);
  });

  it('marks nothing connected when no connected set is given', () => {
    const result = creating('badran');
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.matches.some((m) => m.isAlreadyConnected)).toBe(false);
  });
});

describe('matchExistingPersons — renaming', () => {
  const renaming = (query: string, currentGivenName: string) =>
    matchExistingPersons({
      query,
      intent: 'renaming',
      pool: nodes,
      excludePersonId: 'z',
      currentGivenName,
    });

  it('resolves to none while the name is unchanged', () => {
    expect(renaming('Ahmad', 'Ahmad')).toEqual({ kind: 'none' });
    expect(renaming('  ahmad ', 'Ahmad')).toEqual({ kind: 'none' });
  });

  it('requires confirmation once the name is changed into a collision', () => {
    expect(renaming('Ahmad', 'Fahd').kind).toBe('must-confirm');
  });

  it('matches on cluster too, not just the given name', () => {
    // The widening: EditNodeModal used to match on firstName alone.
    expect(matchIds(renaming('haddad', 'Fahd'))).toEqual(['b']);
  });
});

describe('connectedPersonIds', () => {
  const links: FamilyLink[] = [
    { source: 'anchor', target: 'a', type: 'parent' },
    { source: 'b', target: 'anchor', type: 'marriage' },
    { source: 'c', target: 'd', type: 'parent' },
  ];

  it('collects the other end of every link touching the anchor', () => {
    expect(connectedPersonIds(links, 'anchor')).toEqual(new Set(['a', 'b']));
  });

  it('reads endpoints that the force simulation has replaced with node objects', () => {
    const simulated = [
      { source: { id: 'anchor' }, target: { id: 'a' }, type: 'parent' },
    ] as unknown as FamilyLink[];
    expect(connectedPersonIds(simulated, 'anchor')).toEqual(new Set(['a']));
  });

  it('is empty for a Person with no links', () => {
    expect(connectedPersonIds(links, 'lonely')).toEqual(new Set());
  });
});

describe('readMatchResolution', () => {
  it('reads a none resolution as nothing to show and nothing to answer', () => {
    expect(readMatchResolution({ kind: 'none' })).toEqual({
      matches: [],
      hiddenMatchCount: 0,
      mustConfirm: false,
    });
  });

  it('reports what the cap left out', () => {
    const read = readMatchResolution(creating('badran'));
    expect(read.hiddenMatchCount).toBe(1);
    expect(read.mustConfirm).toBe(false);
  });

  it('reports must-confirm only for the resolution that blocks', () => {
    expect(readMatchResolution(creating('Ahmad')).mustConfirm).toBe(true);
    expect(readMatchResolution(creating('Bad')).mustConfirm).toBe(false);
  });
});

describe('matchExistingPersons — spelling matches (advice only)', () => {
  const pool: FamilyNode[] = [
    { id: 'mz', firstName: 'Mohammed', familyCluster: 'Zabalawi' },
    { id: 'om', firstName: 'Omar', familyCluster: 'Zabalawi' },
  ];

  /** Scores as the server would report them for `typedName`. */
  const scores = (typedName: string, byName: Record<string, number>) =>
    spellingScoresFrom(
      typedName,
      Object.entries(byName).map(([name, score]) => ({ name, score }))
    );

  const spelling = (
    query: string,
    byName: Record<string, number>,
    overrides: Partial<Parameters<typeof matchExistingPersons>[0]> = {}
  ) =>
    matchExistingPersons({
      query,
      intent: 'creating',
      pool,
      excludePersonId: 'zzz',
      spellingScores: scores(query, byName),
      ...overrides,
    });

  it('offers a Person whose given name is a different spelling, as a candidate', () => {
    const result = spelling('Mohamed', { Mohammed: 0.93, Omar: 0.02 });
    expect(result.kind).toBe('candidates');
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.matches.map((m) => [m.person.id, m.isSpellingVariant])).toEqual([['mz', true]]);
  });

  it('sorts exact matches first, then spelling matches, then other substring matches', () => {
    const mixed: FamilyNode[] = [
      { id: 'sub', firstName: 'Aaron', familyCluster: 'Alis' },
      { id: 'var', firstName: 'Aly' },
      { id: 'exact', firstName: 'Ali' },
    ];
    const result = spelling('Ali', { Aaron: 0.01, Aly: 0.8 }, { pool: mixed });
    expect(matchIds(result)).toEqual(['exact', 'var', 'sub']);
  });

  it('counts a score of 0.5 as a spelling match and anything below it as none', () => {
    expect(SPELLING_MATCH_THRESHOLD).toBe(0.5);
    expect(matchIds(spelling('Mohamed', { Mohammed: 0.5 }))).toEqual(['mz']);
    expect(spelling('Mohamed', { Mohammed: 0.49 }).kind).toBe('none');
  });

  it('never requires confirmation for spelling matches alone', () => {
    const many: FamilyNode[] = [
      { id: '1', firstName: 'Mohammed' },
      { id: '2', firstName: 'Muhammad' },
      { id: '3', firstName: 'Mohammad' },
    ];
    const result = spelling(
      'Mohamed',
      { Mohammed: 0.99, Muhammad: 0.97, Mohammad: 0.98 },
      { pool: many }
    );
    expect(result.kind).toBe('candidates');
    expect(readMatchResolution(result).mustConfirm).toBe(false);
  });

  it('still requires confirmation on an exact given-name match beside spelling matches', () => {
    const withExact: FamilyNode[] = [...pool, { id: 'exact', firstName: 'mohamed' }];
    const result = spelling('Mohamed', { Mohammed: 0.93, mohamed: 1 }, { pool: withExact });
    expect(result.kind).toBe('must-confirm');
    if (result.kind === 'none') throw new Error('expected matches');
    // The exact match is exact, not a spelling variant of itself.
    expect(result.matches.map((m) => [m.person.id, m.isExactGivenName, m.isSpellingVariant])).toEqual(
      [
        ['exact', true, false],
        ['mz', false, true],
      ]
    );
  });

  it('applies a score to every Person with that given name, whatever its case', () => {
    const twins: FamilyNode[] = [
      { id: 'm1', firstName: 'Mohammed', familyCluster: 'Zabalawi' },
      { id: 'm2', firstName: ' mohammed ', familyCluster: 'Badran' },
    ];
    expect(matchIds(spelling('Mohamed', { Mohammed: 0.9 }, { pool: twins }))).toEqual(['m2', 'm1']);
  });

  it('ignores scores that answer a different query (a stale reply)', () => {
    const result = matchExistingPersons({
      query: 'Omer',
      intent: 'creating',
      pool,
      excludePersonId: 'zzz',
      spellingScores: scores('Mohamed', { Mohammed: 0.93 }),
    });
    expect(result.kind).toBe('none');
  });

  it('accepts scores for the same query typed with other case or spacing', () => {
    const result = matchExistingPersons({
      query: '  mohamed ',
      intent: 'creating',
      pool,
      excludePersonId: 'zzz',
      spellingScores: scores('Mohamed', { Mohammed: 0.93 }),
    });
    expect(matchIds(result)).toEqual(['mz']);
  });

  it('with no scores, resolves exactly as substring matching does', () => {
    // The fallback when the function is slow, failing or offline.
    for (const query of ['Ahmad', 'Bad', 'badran', 'nobody', 'a']) {
      const without = creating(query);
      expect(without).toEqual(creating(query, { spellingScores: undefined }));
      if (without.kind !== 'none') {
        expect(without.matches.every((m) => !m.isSpellingVariant)).toBe(true);
      }
    }
  });

  it('keeps the cap and counts spelling matches the cap left out', () => {
    const crowd: FamilyNode[] = [
      { id: '1', firstName: 'Mohammed' },
      { id: '2', firstName: 'Muhammad' },
      { id: '3', firstName: 'Mohammad' },
      { id: '4', firstName: 'Mohamad' },
      { id: '5', firstName: 'Muhamed' },
    ];
    const result = spelling(
      'Mohamed',
      { Mohammed: 0.9, Muhammad: 0.9, Mohammad: 0.9, Mohamad: 0.9, Muhamed: 0.9 },
      { pool: crowd }
    );
    expect(matchIds(result)).toHaveLength(MATCH_CANDIDATE_LIMIT);
    expect(readMatchResolution(result).hiddenMatchCount).toBe(1);
  });

  it('labels spelling matches hidden by the filter or already connected', () => {
    const result = spelling(
      'Mohamed',
      { Mohammed: 0.93 },
      { visibleIds: new Set(['om']), connectedIds: new Set(['mz']) }
    );
    if (result.kind === 'none') throw new Error('expected matches');
    expect(result.matches[0]).toMatchObject({
      isSpellingVariant: true,
      isVisible: false,
      isAlreadyConnected: true,
    });
  });

  it('never offers the excluded Person as a spelling match', () => {
    expect(spelling('Mohamed', { Mohammed: 0.93 }, { excludePersonId: 'mz' }).kind).toBe('none');
  });

  it('asks for no lookup on an unchanged rename, and the typed query otherwise', () => {
    expect(spellingLookupQuery({ query: ' ahmad', intent: 'renaming', currentGivenName: 'Ahmad' })).toBe('');
    expect(spellingLookupQuery({ query: 'Ahmed', intent: 'renaming', currentGivenName: 'Ahmad' })).toBe('Ahmed');
    expect(spellingLookupQuery({ query: 'Ahmad', intent: 'creating' })).toBe('Ahmad');
  });

  it('resolves an unchanged rename to none even with scores', () => {
    const result = spelling(
      'Mohammed',
      { Mohammed: 1 },
      { intent: 'renaming', currentGivenName: 'Mohammed', excludePersonId: 'om' }
    );
    expect(result).toEqual({ kind: 'none' });
  });
});
