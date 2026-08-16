import { describe, it, expect } from 'vitest';
import { buildConnectOptions, resolveConnectSelection } from './connectOptions';
import { FamilyGraph } from '../../types/graph';

const graph: FamilyGraph = {
  nodes: [
    { id: 'p1', firstName: 'Ahmad' },
    { id: 'p2', firstName: 'Sara' },
    { id: 'p3', firstName: 'Ali' },
  ],
  links: [{ source: 'p1', target: 'p2', type: 'marriage' }],
};

describe('buildConnectOptions', () => {
  it('offers every relationship between two unconnected people', () => {
    const options = buildConnectOptions(graph, 'p1', 'p3', null);
    expect(options.sourceParent.ok).toBe(true);
    expect(options.targetParent.ok).toBe(true);
    expect(options.marriage.ok).toBe(true);
    expect(options.divorce.ok).toBe(true);
  });

  it('refuses a second marriage between an already-married pair', () => {
    const options = buildConnectOptions(graph, 'p1', 'p2', null);
    expect(options.marriage.ok).toBe(false);
  });

  it('evaluates the two parent directions independently', () => {
    const withParent: FamilyGraph = {
      ...graph,
      links: [...graph.links, { source: 'p1', target: 'p3', type: 'parent' }],
    };
    const options = buildConnectOptions(withParent, 'p1', 'p3', null);
    // p1 is already p3's parent, so proposing it again must fail...
    expect(options.sourceParent.ok).toBe(false);
    // ...but the reverse direction is a different (also invalid — cyclic) proposal.
    expect(options.targetParent.ok).toBe(false);
  });

  it('rejects everything when both ends are the same person', () => {
    const options = buildConnectOptions(graph, 'p1', 'p1', null);
    expect(options.sourceParent.ok).toBe(false);
    expect(options.targetParent.ok).toBe(false);
    expect(options.marriage.ok).toBe(false);
    expect(options.divorce.ok).toBe(false);
  });
});

describe('resolveConnectSelection', () => {
  const options = buildConnectOptions(graph, 'p1', 'p3', null);

  it('maps a source-parent selection to a parent link owned by the source', () => {
    const result = resolveConnectSelection('parent-source', options, 'father');
    expect(result).toEqual({
      ok: true,
      confirmation: { type: 'parent', parentRole: 'father', parentIsSource: true },
    });
  });

  it('maps a target-parent selection to a parent link owned by the target', () => {
    const result = resolveConnectSelection('parent-target', options, 'mother');
    expect(result).toEqual({
      ok: true,
      confirmation: { type: 'parent', parentRole: 'mother', parentIsSource: false },
    });
  });

  it('drops the parent role for marriage, which cannot carry one', () => {
    const result = resolveConnectSelection('marriage', options, 'father');
    expect(result).toEqual({
      ok: true,
      confirmation: { type: 'marriage', parentRole: null },
    });
  });

  it('drops the parent role for divorce', () => {
    const result = resolveConnectSelection('divorce', options, 'mother');
    expect(result).toEqual({
      ok: true,
      confirmation: { type: 'divorce', parentRole: null },
    });
  });

  it('refuses a selection whose option is invalid, surfacing the reason', () => {
    const married = buildConnectOptions(graph, 'p1', 'p2', null);
    const result = resolveConnectSelection('marriage', married, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        married.marriage.ok ? '' : married.marriage.message
      );
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
