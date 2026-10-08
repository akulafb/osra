import { describe, it, expect } from 'vitest';
import { resolvePaperLayout } from './usePaperLayout';
import type { FamilyGraph } from '../types/graph';

const graph: FamilyGraph = {
  nodes: [
    { id: 'mum', firstName: 'Mum' },
    { id: 'dad', firstName: 'Dad' },
    { id: 'kid', firstName: 'Kid' },
  ],
  links: [
    { source: 'mum', target: 'dad', type: 'marriage' },
    { source: 'dad', target: 'kid', type: 'parent', parentRole: 'father' },
    { source: 'mum', target: 'kid', type: 'parent', parentRole: 'mother' },
  ],
};

describe('resolvePaperLayout', () => {
  it('lays out nobody until Paper 3D needs it', () => {
    expect(resolvePaperLayout(null, graph, false)).toBeNull();
  });

  it('lays out every Person once Paper 3D needs it', () => {
    const layout = resolvePaperLayout(null, graph, true);
    expect([...(layout?.keys() ?? [])].sort()).toEqual(['dad', 'kid', 'mum']);
  });

  it('keeps the layout it has when the Working Record changes', () => {
    const first = resolvePaperLayout(null, graph, true)!;
    const grown: FamilyGraph = {
      nodes: [...graph.nodes, { id: 'baby', firstName: 'Baby' }],
      links: [...graph.links, { source: 'kid', target: 'baby', type: 'parent' }],
    };
    expect(resolvePaperLayout(first, grown, true)).toBe(first);
  });

  it('keeps the layout while another view is showing', () => {
    const first = resolvePaperLayout(null, graph, true)!;
    expect(resolvePaperLayout(first, graph, false)).toBe(first);
  });

  it('waits for a Working Record', () => {
    expect(resolvePaperLayout(null, null, true)).toBeNull();
  });
});
