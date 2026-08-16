import { describe, it, expect } from 'vitest';
import { canEdit } from './permissions';
import { FamilyLink } from '../types/graph';

describe('permissions for Action Handles', () => {
  const links: FamilyLink[] = [
    { source: 'user-node', target: 'child-1', type: 'parent' },
    { source: 'parent-1', target: 'user-node', type: 'parent' },
    { source: 'user-node', target: 'spouse-1', type: 'marriage' },
    { source: 'parent-1', target: 'sibling-1', type: 'parent' },
    { source: 'unrelated-1', target: 'unrelated-child', type: 'parent' },
  ];

  it('allows admin to edit any node', () => {
    expect(canEdit('unrelated-1', null, true, links)).toBe(true);
    expect(canEdit('unrelated-1', 'user-node', true, links)).toBe(true);
  });

  it('denies edit if user has no node binding and is not admin', () => {
    expect(canEdit('user-node', null, false, links)).toBe(false);
  });

  it('allows user to edit their own node', () => {
    expect(canEdit('user-node', 'user-node', false, links)).toBe(true);
  });

  it('allows user to edit 1-degree relatives (child, parent, spouse, sibling)', () => {
    expect(canEdit('child-1', 'user-node', false, links)).toBe(true);
    expect(canEdit('parent-1', 'user-node', false, links)).toBe(true);
    expect(canEdit('spouse-1', 'user-node', false, links)).toBe(true);
    expect(canEdit('sibling-1', 'user-node', false, links)).toBe(true);
  });

  it('denies user from editing nodes outside 1-degree network', () => {
    expect(canEdit('unrelated-1', 'user-node', false, links)).toBe(false);
    expect(canEdit('unrelated-child', 'user-node', false, links)).toBe(false);
  });
});
