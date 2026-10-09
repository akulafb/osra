import { describe, it, expect } from 'vitest';
import { paperCollapsible, paperPersonClick, paperShown } from './paperCollapse';
import type { PaperLayout } from './paperLayout';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

function person(id: string): FamilyNode {
  return { id, firstName: id, familyCluster: 'F' };
}

function link(source: string, target: string, type: FamilyLink['type'] = 'parent'): FamilyLink {
  return { source, target, type };
}

// gp → p → c, p married to s, s → c; u stands alone.
const graph: FamilyGraph = {
  nodes: ['gp', 'p', 's', 'c', 'u'].map(person),
  links: [link('gp', 'p'), link('p', 's', 'marriage'), link('p', 'c'), link('s', 'c')],
};

const layout: PaperLayout = new Map(
  graph.nodes.map((n, i) => [n.id, { x: i * 10, y: -i * 10, z: i, radius: 2 }])
);

const shownIds = (collapsed: string[], g: FamilyGraph = graph) =>
  paperShown(g, layout, new Set(collapsed), new Set(['F']), ['F']).nodes.map((n) => n.id);

describe('which Persons collapse', () => {
  it('is a Person with a child', () => {
    expect(paperCollapsible(graph.links, 'gp')).toBe(true);
    expect(paperCollapsible(graph.links, 'p')).toBe(true);
  });

  it('is not a Person whose only links are a marriage or their own parents', () => {
    expect(paperCollapsible(graph.links, 'c')).toBe(false);
    expect(paperCollapsible(graph.links, 'u')).toBe(false);
    expect(paperCollapsible([link('p', 's', 'marriage')], 'p')).toBe(false);
  });
});

describe('what a collapse shows', () => {
  it('shows everyone with nothing collapsed', () => {
    expect(shownIds([])).toEqual(['gp', 'p', 's', 'c', 'u']);
  });

  it('hides the descendants of a collapsed Person and keeps the Person', () => {
    const shown = shownIds(['gp']);
    expect(shown).toContain('gp');
    expect(shown).not.toContain('c');
    expect(shown).toContain('u');
  });

  it('shows everyone again once the collapse is cleared', () => {
    shownIds(['gp']);
    expect(shownIds([])).toEqual(['gp', 'p', 's', 'c', 'u']);
  });

  it('draws no line to a hidden Person', () => {
    const { nodes, lines } = paperShown(graph, layout, new Set(['p']), new Set(['F']), ['F']);
    const ids = new Set(nodes.map((n) => n.id));
    for (const l of lines) {
      expect(ids.has(l.sourceId)).toBe(true);
      expect(ids.has(l.targetId)).toBe(true);
    }
  });

  it('never moves anyone: a collapse reads the layout and leaves it as it was', () => {
    const before = JSON.stringify([...layout]);
    paperShown(graph, layout, new Set(['gp']), new Set(['F']), ['F']);
    paperShown(graph, layout, new Set(), new Set(['F']), ['F']);
    expect(JSON.stringify([...layout])).toBe(before);
  });

  it('leaves out a Person the layout has not placed', () => {
    const late = { ...graph, nodes: [...graph.nodes, person('late')] };
    expect(shownIds([], late)).not.toContain('late');
  });

  it('shows nobody without a layout', () => {
    expect(paperShown(graph, null, new Set(), new Set(['F']), ['F'])).toEqual({ nodes: [], lines: [] });
  });
});

describe('a click on a Person', () => {
  const click = (id: string, detail: number, selectedId: string | null, connecting = false) =>
    paperPersonClick({ id, detail, selectedId, connecting });

  it('selects a Person who is not selected', () => {
    expect(click('a', 1, null)).toBe('select');
    expect(click('a', 1, 'b')).toBe('select');
  });

  it('waits to deselect the selected Person, so a double-click on them collapses and keeps the selection', () => {
    expect(click('a', 1, 'a')).toBe('deselect-later');
  });

  it('ignores the second click of a double-click', () => {
    expect(click('a', 2, 'a')).toBe('ignore');
    expect(click('a', 2, null)).toBe('ignore');
  });

  it('picks the target in Connect Mode', () => {
    expect(click('a', 1, 'b', true)).toBe('pick');
    expect(click('b', 1, 'b', true)).toBe('pick');
  });
});
