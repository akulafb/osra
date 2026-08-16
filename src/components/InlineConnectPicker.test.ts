import { describe, it, expect } from 'vitest';
import { validateProposedLink } from '../lib/adminGraphValidation';
import { FamilyGraph } from '../types/graph';

describe('Connect Mode Validation & Logic', () => {
  const mockGraph: FamilyGraph = {
    nodes: [
      { id: 'p1', firstName: 'Ahmad' },
      { id: 'p2', firstName: 'Sara' },
      { id: 'p3', firstName: 'Ali' },
    ],
    links: [
      { source: 'p1', target: 'p2', type: 'marriage' },
    ],
  };

  it('validates marriage between disconnected nodes is allowed', () => {
    const res = validateProposedLink(mockGraph, {
      source: 'p1',
      target: 'p3',
      type: 'marriage',
    });
    expect(res.ok).toBe(true);
  });

  it('disallows duplicate marriage between already married nodes', () => {
    const res = validateProposedLink(mockGraph, {
      source: 'p1',
      target: 'p2',
      type: 'marriage',
    });
    expect(res.ok).toBe(false);
  });

  it('disallows self-linking', () => {
    const res = validateProposedLink(mockGraph, {
      source: 'p1',
      target: 'p1',
      type: 'parent',
    });
    expect(res.ok).toBe(false);
  });
});
