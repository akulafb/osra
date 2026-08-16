import { describe, it, expect } from 'vitest';
import { findDuplicateCandidates, DUPLICATE_CANDIDATE_LIMIT } from './ghostNodeCandidates';
import { FamilyNode } from '../../types/graph';

const nodes: FamilyNode[] = [
  { id: 'a', firstName: 'Ahmad', familyCluster: 'Badran' },
  { id: 'b', firstName: 'Sara', familyCluster: 'Haddad' },
  { id: 'c', firstName: 'Ali', familyCluster: 'Badran' },
  { id: 'd', firstName: 'Amal', maternalFamilyCluster: 'Badran' },
  { id: 'e', firstName: 'Aya', familyCluster: 'Badran' },
  { id: 'f', firstName: 'Adam', familyCluster: 'Badran' },
];

describe('findDuplicateCandidates', () => {
  it('returns nothing until the query has at least two characters', () => {
    expect(findDuplicateCandidates('', nodes, 'zzz')).toEqual([]);
    expect(findDuplicateCandidates('a', nodes, 'zzz')).toEqual([]);
    expect(findDuplicateCandidates('ah', nodes, 'zzz')).toHaveLength(1);
  });

  it('ignores surrounding whitespace when measuring the query', () => {
    expect(findDuplicateCandidates('  a  ', nodes, 'zzz')).toEqual([]);
    expect(findDuplicateCandidates('  ahmad  ', nodes, 'zzz').map((n) => n.id)).toEqual(['a']);
  });

  it('matches case-insensitively on the first name', () => {
    expect(findDuplicateCandidates('SARA', nodes, 'zzz').map((n) => n.id)).toEqual(['b']);
  });

  it('matches on family cluster as well as first name', () => {
    const ids = findDuplicateCandidates('haddad', nodes, 'zzz').map((n) => n.id);
    expect(ids).toEqual(['b']);
  });

  it('matches on maternal family cluster', () => {
    const ids = findDuplicateCandidates('badran', nodes, 'zzz').map((n) => n.id);
    expect(ids).toContain('d');
  });

  it('excludes the anchor node itself', () => {
    const ids = findDuplicateCandidates('ahmad', nodes, 'a').map((n) => n.id);
    expect(ids).toEqual([]);
  });

  it('caps the number of candidates returned', () => {
    // 'badran' matches a, c, d, e, f — five nodes, one over the limit.
    const result = findDuplicateCandidates('badran', nodes, 'zzz');
    expect(result).toHaveLength(DUPLICATE_CANDIDATE_LIMIT);
    expect(DUPLICATE_CANDIDATE_LIMIT).toBe(4);
  });

  it('returns an empty list when nothing matches', () => {
    expect(findDuplicateCandidates('nobody', nodes, 'zzz')).toEqual([]);
  });
});
