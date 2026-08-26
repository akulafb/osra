import { describe, it, expect } from 'vitest';
import {
  connectedPersonIds,
  matchExistingPersons,
  MATCH_CANDIDATE_LIMIT,
  MIN_MATCH_QUERY_LENGTH,
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
