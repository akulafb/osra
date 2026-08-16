import { describe, it, expect } from 'vitest';
import {
  candidacyFor,
  buildCandidacy,
  candidateIds,
  buildTargetOptions,
} from './connectCandidates';
import { FamilyGraph, FamilyNode } from '../../types/graph';
import { MSG_DUPLICATE, MSG_SELF } from '../../lib/adminGraphValidation';
import { TargetVisibility } from '../../utils/connectTargeting';

const graph: FamilyGraph = {
  nodes: [
    { id: 'p1', firstName: 'Ahmad' },
    { id: 'p2', firstName: 'Sara' },
    { id: 'p3', firstName: 'Ali' },
    { id: 'p4', firstName: 'Layla' },
  ],
  links: [
    { source: 'p1', target: 'p2', type: 'marriage' },
    { source: 'p1', target: 'p3', type: 'parent' },
  ],
};

describe('candidacyFor', () => {
  it('accepts two people no link joins yet', () => {
    expect(candidacyFor(graph, 'p1', 'p4')).toEqual({ ok: true });
  });

  it('refuses the source itself, so a stray click on the source is not a target', () => {
    expect(candidacyFor(graph, 'p1', 'p1')).toEqual({ ok: false, reason: MSG_SELF });
  });

  it('refuses an already-married pair, saying they are already connected', () => {
    expect(candidacyFor(graph, 'p1', 'p2')).toEqual({ ok: false, reason: MSG_DUPLICATE });
  });

  it('refuses an existing parent-child pair, saying they are already connected', () => {
    expect(candidacyFor(graph, 'p1', 'p3')).toEqual({ ok: false, reason: MSG_DUPLICATE });
  });

  it('accepts a pair only one of the four relationships could join', () => {
    // Siblings: neither parent direction is allowed, but a partnership is.
    const siblings: FamilyGraph = {
      ...graph,
      links: [...graph.links, { source: 'p1', target: 'p4', type: 'parent' }],
    };
    expect(candidacyFor(siblings, 'p3', 'p4')).toEqual({ ok: true });
  });

  it('is symmetric — aiming from either end offers the same pair', () => {
    expect(candidacyFor(graph, 'p4', 'p2').ok).toBe(candidacyFor(graph, 'p2', 'p4').ok);
    expect(candidacyFor(graph, 'p1', 'p2').ok).toBe(candidacyFor(graph, 'p2', 'p1').ok);
  });

  it('always gives a reason when it refuses, so bad aim is distinguishable from a bad target', () => {
    const refusal = candidacyFor(graph, 'p1', 'p2');
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) expect(refusal.reason.length).toBeGreaterThan(0);
  });

  it('ignores the parent role, which the kinship picker asks for only after a pair is chosen', () => {
    // p3 already has p1 as a role-less parent; a second parent is still offerable.
    expect(candidacyFor(graph, 'p4', 'p3')).toEqual({ ok: true });
  });
});

describe('buildCandidacy', () => {
  it('judges every node handed to it, including the source', () => {
    const candidacy = buildCandidacy(graph, 'p1', graph.nodes);
    expect([...candidacy.keys()].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(candidacy.get('p1')).toEqual({ ok: false, reason: MSG_SELF });
    expect(candidacy.get('p4')).toEqual({ ok: true });
  });

  it('judges only the nodes handed to it, so a hidden cluster is never targetable', () => {
    const candidacy = buildCandidacy(graph, 'p1', [{ id: 'p4' }]);
    expect([...candidacy.keys()]).toEqual(['p4']);
  });
});

describe('candidateIds', () => {
  it('keeps the accepted ids only', () => {
    const ids = candidateIds(buildCandidacy(graph, 'p1', graph.nodes));
    expect(ids.has('p4')).toBe(true);
    expect(ids.has('p1')).toBe(false);
    expect(ids.has('p2')).toBe(false);
    expect(ids.has('p3')).toBe(false);
  });

  it('is empty when nothing can be linked, rather than silently offering everything', () => {
    const pair: FamilyGraph = {
      nodes: [{ id: 'a', firstName: 'A' }, { id: 'b', firstName: 'B' }],
      links: [{ source: 'a', target: 'b', type: 'marriage' }],
    };
    expect(candidateIds(buildCandidacy(pair, 'a', pair.nodes)).size).toBe(0);
  });
});

describe('buildTargetOptions', () => {
  const visibleNodes: FamilyNode[] = graph.nodes;
  const candidacy = buildCandidacy(graph, 'p1', visibleNodes);

  const visibility = (overrides: Record<string, TargetVisibility> = {}) =>
    new Map<string, TargetVisibility>([
      ['p1', 'onscreen'],
      ['p2', 'onscreen'],
      ['p3', 'onscreen'],
      ['p4', 'onscreen'],
      ...Object.entries(overrides),
    ] as [string, TargetVisibility][]);

  const options = (over: Partial<Parameters<typeof buildTargetOptions>[0]> = {}) =>
    buildTargetOptions({
      query: '',
      matches: [],
      visibleNodes,
      sourceId: 'p1',
      candidacy,
      visibility: visibility(),
      ...over,
    });

  it('offers only linkable people when nothing has been typed', () => {
    expect(options().options.map((o) => o.node.id)).toEqual(['p4']);
  });

  it('never offers the source, whatever the search says', () => {
    const rows = options({ query: 'a', matches: [graph.nodes[0], graph.nodes[3]] });
    expect(rows.options.map((o) => o.node.id)).not.toContain('p1');
  });

  it('uses the typed search result set verbatim, so a specific person can be looked up', () => {
    const rows = options({ query: 'sara', matches: [graph.nodes[1]] });
    expect(rows.options.map((o) => o.node.id)).toEqual(['p2']);
  });

  it('keeps unlinkable search results, with the reason, rather than hiding them', () => {
    const rows = options({ query: 'sara', matches: [graph.nodes[1]] });
    expect(rows.options[0].candidacy).toEqual({ ok: false, reason: MSG_DUPLICATE });
  });

  it('puts linkable people above unlinkable ones', () => {
    const rows = options({ query: 'a', matches: [graph.nodes[1], graph.nodes[3]] });
    expect(rows.options.map((o) => o.node.id)).toEqual(['p4', 'p2']);
  });

  it('lifts targets aiming cannot reach to the top — they are why the picker exists', () => {
    const spread: FamilyGraph = { nodes: [...graph.nodes, { id: 'p5', firstName: 'Nour' }], links: graph.links };
    const rows = buildTargetOptions({
      query: '',
      matches: [],
      visibleNodes: spread.nodes,
      sourceId: 'p1',
      candidacy: buildCandidacy(spread, 'p1', spread.nodes),
      visibility: visibility({ p5: 'behind' }),
    });
    expect(rows.options.map((o) => o.node.id)).toEqual(['p5', 'p4']);
  });

  it('treats an unmeasured target as off-screen rather than dropping it', () => {
    const rows = options({ visibility: new Map() });
    expect(rows.options.map((o) => o.node.id)).toEqual(['p4']);
    expect(rows.options[0].visibility).toBe('offscreen');
  });

  it('caps the list so the docked panel cannot overrun the viewport', () => {
    const many: FamilyNode[] = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      firstName: `N${i}`,
    }));
    const bigGraph: FamilyGraph = { nodes: [{ id: 'p1', firstName: 'Ahmad' }, ...many], links: [] };
    const rows = buildTargetOptions({
      query: '',
      matches: [],
      visibleNodes: bigGraph.nodes,
      sourceId: 'p1',
      candidacy: buildCandidacy(bigGraph, 'p1', bigGraph.nodes),
      visibility: new Map(),
      limit: 5,
    });
    expect(rows.options).toHaveLength(5);
  });

  it('reports the whole pool, so the panel can admit what the cap left out', () => {
    const many: FamilyNode[] = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      firstName: `N${i}`,
    }));
    const bigGraph: FamilyGraph = { nodes: [{ id: 'p1', firstName: 'Ahmad' }, ...many], links: [] };
    const rows = buildTargetOptions({
      query: '',
      matches: [],
      visibleNodes: bigGraph.nodes,
      sourceId: 'p1',
      candidacy: buildCandidacy(bigGraph, 'p1', bigGraph.nodes),
      visibility: new Map(),
      limit: 5,
    });
    expect(rows.total).toBe(12);
    expect(rows.options).toHaveLength(5);
  });
});
