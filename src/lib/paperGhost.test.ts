import { describe, it, expect } from 'vitest';
import { layoutPaperTree } from './paperLayout';
import { paperGhostLanding } from './paperGhost';
import { packMatches, paperSearchLayout } from './paperSearch';
import { relativeToKinshipLinks } from './treeRecord';
import { otherParentChoice, resolveOtherParent, resolveOtherParentFor } from './otherParent';
import { followWorkingRecord, type ReadyPaperLayout } from '../hooks/usePaperLayout';
import { FIXTURE_IDS, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';
import type { FamilyGraph, RelativeDirection } from '../types/graph';

const TREE: FamilyGraph = KINSHIP_FIXTURE_TREE;
const ready: ReadyPaperLayout = { status: 'ready', layout: layoutPaperTree(TREE), newcomers: new Set() };

/** What the Ghost Node card sends as the other parent: the pick, or until the user picks, the preselection. */
function cardPick(anchorId: string, relation: RelativeDirection, picked?: string | null): string | null {
  if (relation !== 'child') return null;
  const choice = otherParentChoice(anchorId, TREE.links);
  return resolveOtherParent(choice, picked === undefined && choice.kind === 'choose' ? choice.preselectedId : picked);
}

/** The Working Record after the Ghost Node card is submitted: FamilyTree's optimistic write. */
function afterSubmit(anchorId: string, relation: RelativeDirection, sent: string | null, personId: string): FamilyGraph {
  const otherParentId = relation === 'child' ? resolveOtherParentFor(TREE.links, anchorId, sent) : null;
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
    const sent = cardPick(anchorId, relation);
    const landing = paperGhostLanding(ready.layout, TREE, anchorId, relation, sent);
    const placed = followWorkingRecord(ready, afterSubmit(anchorId, relation, sent, 'a1b2c3d4-real-uuid')).layout.get('a1b2c3d4-real-uuid');
    expect(landing).not.toBeNull();
    expect(landing).toEqual(placed);
  });

  describe('a child of a parent with two spouses, where the card offers a choice of other parent', () => {
    const anchorId = FIXTURE_IDS.layla;
    const picks: [string, string | null | undefined][] = [
      ['the preselected current spouse', undefined],
      ['a former spouse', FIXTURE_IDS.tarek],
      ['"Not known"', null],
    ];

    it('offers a choice', () => {
      expect(otherParentChoice(anchorId, TREE.links).kind).toBe('choose');
    });

    it.each(picks)('lands with %s exactly where the submitted Person is placed', (_, picked) => {
      const sent = cardPick(anchorId, 'child', picked);
      const landing = paperGhostLanding(ready.layout, TREE, anchorId, 'child', sent);
      const placed = followWorkingRecord(ready, afterSubmit(anchorId, 'child', sent, 'a1b2c3d4-real-uuid')).layout.get('a1b2c3d4-real-uuid');
      expect(landing).not.toBeNull();
      expect(landing).toEqual(placed);
    });

    it('moves with the pick', () => {
      const withKarim = paperGhostLanding(ready.layout, TREE, anchorId, 'child', FIXTURE_IDS.karim);
      const withTarek = paperGhostLanding(ready.layout, TREE, anchorId, 'child', FIXTURE_IDS.tarek);
      expect(withKarim).not.toEqual(withTarek);
    });
  });

  it('has no landing for an anchor the layout has not placed', () => {
    expect(paperGhostLanding(ready.layout, TREE, 'nobody', 'child', null)).toBeNull();
  });

  describe('during a search, when the anchor sits in the match cluster', () => {
    const matchIds = new Set([FIXTURE_IDS.huda, FIXTURE_IDS.khalil, FIXTURE_IDS.omar]);
    const shown = paperSearchLayout(ready.layout, packMatches(ready.layout, matchIds, TREE.links));
    const anchorId = FIXTURE_IDS.khalil;

    it('lands beside the anchor where the cluster drew it, keeping the still offset and size', () => {
      const still = paperGhostLanding(ready.layout, TREE, anchorId, 'parent', null)!;
      const landing = paperGhostLanding(ready.layout, TREE, anchorId, 'parent', null, shown)!;
      const fixedAnchor = ready.layout.get(anchorId)!;
      const shownAnchor = shown.get(anchorId)!;
      expect(shownAnchor).not.toEqual(fixedAnchor);
      expect(landing.x - shownAnchor.x).toBeCloseTo(still.x - fixedAnchor.x);
      expect(landing.y - shownAnchor.y).toBeCloseTo(still.y - fixedAnchor.y);
      expect(landing.z - shownAnchor.z).toBeCloseTo(still.z - fixedAnchor.z);
      expect(landing.radius).toBe(still.radius);
    });

    it('lands exactly where it does outside a search when the shown layout is the still one', () => {
      const still = paperGhostLanding(ready.layout, TREE, anchorId, 'parent', null);
      expect(paperGhostLanding(ready.layout, TREE, anchorId, 'parent', null, ready.layout)).toEqual(still);
    });
  });
});
