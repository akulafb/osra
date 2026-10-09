import { describe, it, expect, vi } from 'vitest';
import { followWorkingRecord, makePaperLayout, needsPaperLayout, type PaperLayoutState } from './usePaperLayout';
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

describe('followWorkingRecord', () => {
  const ready = makePaperLayout(graph);
  if (ready.status !== 'ready') throw new Error('layout failed');

  it('places a Person it has not seen beside their relatives, and moves nobody else', () => {
    const next = followWorkingRecord(ready, grown);
    expect([...next.layout.keys()].sort()).toEqual(['baby', 'dad', 'kid', 'mum']);
    for (const [id, disc] of ready.layout) expect(next.layout.get(id)).toEqual(disc);
    const baby = next.layout.get('baby')!;
    const kid = next.layout.get('kid')!;
    expect(Math.hypot(baby.x - kid.x, baby.y - kid.y, baby.z - kid.z)).toBeLessThan((baby.radius + kid.radius) * 4);
  });

  it('places each newcomer once: later changes to the Working Record leave them where they landed', () => {
    const placed = followWorkingRecord(ready, grown);
    const confirmed: FamilyGraph = {
      nodes: grown.nodes.map((n) => (n.id === 'baby' ? { ...n, familyCluster: 'Kid' } : n)),
      links: [...grown.links, { source: 'mum', target: 'baby', type: 'parent' }],
    };
    expect(followWorkingRecord(placed, confirmed).layout.get('baby')).toEqual(placed.layout.get('baby'));
  });

  it('returns the same state when everyone is already placed', () => {
    expect(followWorkingRecord(ready, graph)).toBe(ready);
  });

  it('drops a newcomer whose Spawn was aborted, so their spot is free again', () => {
    const placed = followWorkingRecord(ready, grown);
    const reverted = followWorkingRecord(placed, graph);
    expect(reverted.layout.has('baby')).toBe(false);
    expect([...reverted.layout.keys()].sort()).toEqual(['dad', 'kid', 'mum']);
    expect(followWorkingRecord(reverted, grown).layout.get('baby')).toEqual(placed.layout.get('baby'));
  });

  it('keeps the spot of a Person from the full layout who leaves the Working Record', () => {
    const withoutKid: FamilyGraph = {
      nodes: graph.nodes.filter((n) => n.id !== 'kid'),
      links: graph.links.filter((l) => l.target !== 'kid'),
    };
    expect(followWorkingRecord(ready, withoutKid).layout.get('kid')).toEqual(ready.layout.get('kid'));
  });
});
