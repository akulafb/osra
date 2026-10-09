import { describe, it, expect } from 'vitest';
import { layoutPaperTree } from './paperLayout';
import { paperGhostLanding } from './paperGhost';
import { relativeToKinshipLinks } from './treeRecord';
import { otherParentChoice, resolveOtherParent } from './otherParent';
import { followWorkingRecord, type ReadyPaperLayout } from '../hooks/usePaperLayout';
import { FIXTURE_IDS, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';
import type { FamilyGraph, RelativeDirection } from '../types/graph';

const TREE: FamilyGraph = KINSHIP_FIXTURE_TREE;
const ready: ReadyPaperLayout = { status: 'ready', layout: layoutPaperTree(TREE), newcomers: new Set() };

/** The Working Record after the Ghost Node card is submitted as it opened: FamilyTree's optimistic write. */
function afterSubmit(anchorId: string, relation: RelativeDirection, personId: string): FamilyGraph {
  const otherParentId = relation === 'child' ? resolveOtherParent(otherParentChoice(anchorId, TREE.links), null) : null;
  const otherParent = otherParentId ? TREE.nodes.find((n) => n.id === otherParentId)! : null;
  return {
    nodes: [...TREE.nodes, { id: personId, firstName: 'Newcomer' }],
    links: [...TREE.links, ...relativeToKinshipLinks(anchorId, personId, relation, TREE.links, undefined, otherParent)],
  };
}

describe('paperGhostLanding: the Ghost Preview shows where the newcomer will land', () => {
  const cases: [string, string, RelativeDirection][] = [
    ['a child of a parent with one spouse', FIXTURE_IDS.huda, 'child'],
    ['a child of a parent with no spouse', FIXTURE_IDS.khalil, 'child'],
    ['a parent', FIXTURE_IDS.khalil, 'parent'],
    ['a spouse', FIXTURE_IDS.khalil, 'spouse'],
    ['a sibling', FIXTURE_IDS.omar, 'sibling'],
  ];

  it.each(cases)('lands %s exactly where the submitted Person is placed', (_, anchorId, relation) => {
    const landing = paperGhostLanding(ready.layout, TREE, anchorId, relation);
    const placed = followWorkingRecord(ready, afterSubmit(anchorId, relation, 'a1b2c3d4-real-uuid')).layout.get('a1b2c3d4-real-uuid');
    expect(landing).not.toBeNull();
    expect(landing).toEqual(placed);
  });

  it('has no landing when the card offers a choice of other parent, since the pick moves the newcomer', () => {
    expect(otherParentChoice(FIXTURE_IDS.layla, TREE.links).kind).toBe('choose');
    expect(paperGhostLanding(ready.layout, TREE, FIXTURE_IDS.layla, 'child')).toBeNull();
  });

  it('has no landing for an anchor the layout has not placed', () => {
    expect(paperGhostLanding(ready.layout, TREE, 'nobody', 'child')).toBeNull();
  });
});
