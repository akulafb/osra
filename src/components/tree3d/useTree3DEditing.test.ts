import { describe, it, expect } from 'vitest';
import { connectEnds } from './useTree3DEditing';
import type { ConnectPair } from '../cards/connectCandidates';

const pair: ConnectPair = { source: { id: 'huda', firstName: 'Huda' }, target: { id: 'omar', firstName: 'Omar' } };

describe('connectEnds: the Kinship Link a confirmed Connect Mode pair writes', () => {
  it('runs from source to target when the source is the parent', () => {
    expect(connectEnds(pair, 'parent', true)).toEqual({ sourceNodeId: 'huda', targetNodeId: 'omar' });
  });

  it('flips when the picker names the target as the parent', () => {
    expect(connectEnds(pair, 'parent', false)).toEqual({ sourceNodeId: 'omar', targetNodeId: 'huda' });
  });

  it('keeps the source first when the picker does not say who the parent is', () => {
    expect(connectEnds(pair, 'parent')).toEqual({ sourceNodeId: 'huda', targetNodeId: 'omar' });
  });

  it.each(['marriage', 'divorce'] as const)('never flips a %s', (type) => {
    expect(connectEnds(pair, type, false)).toEqual({ sourceNodeId: 'huda', targetNodeId: 'omar' });
  });
});
