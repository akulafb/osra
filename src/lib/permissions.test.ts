import { describe, it, expect } from 'vitest';
import { canEdit, canManageInvites } from './permissions';
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

describe('permissions for managing invites (LIN-60)', () => {
  const links: FamilyLink[] = [
    { source: 'user-node', target: 'child-1', type: 'parent' },
    { source: 'parent-1', target: 'user-node', type: 'parent' },
    { source: 'user-node', target: 'spouse-1', type: 'marriage' },
    { source: 'parent-1', target: 'sibling-1', type: 'parent' },
    { source: 'unrelated-1', target: 'unrelated-child', type: 'parent' },
  ];

  it('allows admin to manage invites for any node even without a bound node', () => {
    expect(canManageInvites('unrelated-1', null, true, links)).toBe(true);
    expect(canManageInvites('child-1', null, true, links)).toBe(true);
  });

  it('allows bound user to manage invites for 1-degree relatives', () => {
    expect(canManageInvites('child-1', 'user-node', false, links)).toBe(true);
    expect(canManageInvites('parent-1', 'user-node', false, links)).toBe(true);
    expect(canManageInvites('spouse-1', 'user-node', false, links)).toBe(true);
    expect(canManageInvites('sibling-1', 'user-node', false, links)).toBe(true);
  });

  it('denies bound user from managing invites outside 1-degree network', () => {
    expect(canManageInvites('unrelated-1', 'user-node', false, links)).toBe(false);
    expect(canManageInvites('unrelated-child', 'user-node', false, links)).toBe(false);
  });

  it('denies unbound non-admin from managing invites', () => {
    expect(canManageInvites('child-1', null, false, links)).toBe(false);
  });
});

