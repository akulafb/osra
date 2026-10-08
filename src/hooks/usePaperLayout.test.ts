import { describe, it, expect, vi } from 'vitest';
import { makePaperLayout, needsPaperLayout, type PaperLayoutState } from './usePaperLayout';
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

const grown: FamilyGraph = {
  nodes: [...graph.nodes, { id: 'baby', firstName: 'Baby' }],
  links: [...graph.links, { source: 'kid', target: 'baby', type: 'parent' }],
};

const waiting: PaperLayoutState = { status: 'waiting' };

describe('needsPaperLayout', () => {
  it('lays out nobody until Paper 3D needs it', () => {
    expect(needsPaperLayout(waiting, graph, false)).toBe(false);
  });

  it('lays out once Paper 3D needs it', () => {
    expect(needsPaperLayout(waiting, graph, true)).toBe(true);
  });

  it('waits for a Working Record', () => {
    expect(needsPaperLayout(waiting, null, true)).toBe(false);
  });

  it('keeps the layout it has when the Working Record changes', () => {
    const ready = makePaperLayout(graph);
    expect(needsPaperLayout(ready, grown, true)).toBe(false);
  });

  it('keeps the layout while another view is showing', () => {
    expect(needsPaperLayout(makePaperLayout(graph), graph, false)).toBe(false);
  });

  it('does not try again after a layout failed', () => {
    expect(needsPaperLayout({ status: 'failed' }, grown, true)).toBe(false);
  });
});

describe('makePaperLayout', () => {
  it('lays out every Person', () => {
    const state = makePaperLayout(graph);
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && [...state.layout.keys()].sort()).toEqual(['dad', 'kid', 'mum']);
  });

  it('reports a failure instead of throwing when the layout throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = makePaperLayout(graph, () => {
      throw new Error('no room');
    });
    expect(state).toEqual({ status: 'failed' });
  });
});
