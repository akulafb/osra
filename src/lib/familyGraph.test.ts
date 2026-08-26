import { describe, it, expect } from 'vitest';
import {
  getNodeId,
  getLinkEndpoints,
  isDirectlyLinked,
  getParents,
  getChildren,
  getSpouses,
  getSiblings,
  get1DegreeRelatives,
  get1DegreeNodeIds,
} from './familyGraph';
import type { FamilyNode, FamilyLink } from '../types/graph';

describe('familyGraph module', () => {
  describe('getNodeId', () => {
    it('extracts ID from a string', () => {
      expect(getNodeId('node-123')).toBe('node-123');
    });

    it('extracts ID from a FamilyNode object', () => {
      const node: FamilyNode = { id: 'node-456', firstName: 'Tariq' };
      expect(getNodeId(node)).toBe('node-456');
    });

    it('extracts ID from an object with id property', () => {
      expect(getNodeId({ id: 'custom-id', extra: true })).toBe('custom-id');
    });

    it('converts numeric id to string', () => {
      expect(getNodeId({ id: 12345 })).toBe('12345');
    });

    it('returns empty string for null, undefined, and non-objects without id', () => {
      expect(getNodeId(null)).toBe('');
      expect(getNodeId(undefined)).toBe('');
      expect(getNodeId('')).toBe('');
      expect(getNodeId(42)).toBe('');
      expect(getNodeId({})).toBe('');
      expect(getNodeId({ name: 'No ID' })).toBe('');
      expect(getNodeId({ id: null })).toBe('');
      expect(getNodeId({ id: undefined })).toBe('');
    });
  });

  describe('getLinkEndpoints', () => {
    it('extracts sourceId and targetId from string endpoints', () => {
      const link: FamilyLink = {
        source: 'parent-1',
        target: 'child-1',
        type: 'parent',
      };
      expect(getLinkEndpoints(link)).toEqual({
        sourceId: 'parent-1',
        targetId: 'child-1',
      });
    });

    it('extracts sourceId and targetId from object endpoints (d3-force live mutation)', () => {
      const nodeA: FamilyNode = { id: 'parent-1', firstName: 'Parent' };
      const nodeB: FamilyNode = { id: 'child-1', firstName: 'Child' };
      const link: FamilyLink = {
        source: nodeA,
        target: nodeB,
        type: 'parent',
      };
      expect(getLinkEndpoints(link)).toEqual({
        sourceId: 'parent-1',
        targetId: 'child-1',
      });
    });

    it('handles mixed string and object endpoints', () => {
      const nodeB: FamilyNode = { id: 'child-1', firstName: 'Child' };
      const link: FamilyLink = {
        source: 'parent-1',
        target: nodeB,
        type: 'parent',
      };
      expect(getLinkEndpoints(link)).toEqual({
        sourceId: 'parent-1',
        targetId: 'child-1',
      });
    });
  });

  describe('Kinship Adjacency Queries', () => {
    const nodeFather: FamilyNode = { id: 'father-1', firstName: 'Father' };
    const nodeMother: FamilyNode = { id: 'mother-1', firstName: 'Mother' };
    const nodeChild1: FamilyNode = { id: 'child-1', firstName: 'Child 1' };
    const nodeChild2: FamilyNode = { id: 'child-2', firstName: 'Child 2' };
    const nodeHalfSibling: FamilyNode = { id: 'half-sib-1', firstName: 'Half Sibling' };
    const nodeExSpouse: FamilyNode = { id: 'ex-1', firstName: 'Ex Spouse' };

    const sampleLinks: FamilyLink[] = [
      { source: nodeFather, target: nodeMother, type: 'marriage' },
      { source: 'father-1', target: 'child-1', type: 'parent' },
      { source: 'mother-1', target: nodeChild1, type: 'parent' },
      { source: 'father-1', target: nodeChild2, type: 'parent' },
      { source: 'mother-1', target: 'child-2', type: 'parent' },
      { source: 'father-1', target: nodeExSpouse, type: 'divorce' },
      { source: 'father-1', target: nodeHalfSibling, type: 'parent' },
      { source: 'unrelated-1', target: 'unrelated-2', type: 'marriage' },
    ];

    describe('isDirectlyLinked', () => {
      it('returns true for directly linked nodes regardless of endpoint order', () => {
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'mother-1')).toBe(true);
        expect(isDirectlyLinked(sampleLinks, 'mother-1', 'father-1')).toBe(true);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'child-1')).toBe(true);
        expect(isDirectlyLinked(sampleLinks, 'child-1', 'father-1')).toBe(true);
      });

      it('filters by link type when specified', () => {
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'mother-1', 'marriage')).toBe(true);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'mother-1', 'divorce')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'mother-1', 'parent')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'child-1', 'parent')).toBe(true);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'child-1', 'marriage')).toBe(false);
      });

      it('returns false for unlinked nodes', () => {
        expect(isDirectlyLinked(sampleLinks, 'child-1', 'child-2')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, 'mother-1', 'ex-1')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, 'father-1', 'unrelated-1')).toBe(false);
      });

      it('handles empty links or missing IDs gracefully', () => {
        expect(isDirectlyLinked([], 'father-1', 'mother-1')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, '', 'mother-1')).toBe(false);
        expect(isDirectlyLinked(sampleLinks, 'father-1', '')).toBe(false);
      });
    });

    describe('getParents', () => {
      it('returns all parent IDs for a node', () => {
        const parents = getParents('child-1', sampleLinks);
        expect(parents).toEqual(expect.arrayContaining(['father-1', 'mother-1']));
        expect(parents.length).toBe(2);
      });

      it('returns single parent for half-sibling', () => {
        expect(getParents('half-sib-1', sampleLinks)).toEqual(['father-1']);
      });

      it('returns empty array when node has no parents', () => {
        expect(getParents('father-1', sampleLinks)).toEqual([]);
        expect(getParents('unknown-id', sampleLinks)).toEqual([]);
      });
    });

    describe('getChildren', () => {
      it('returns all child IDs for a parent node', () => {
        const fatherChildren = getChildren('father-1', sampleLinks);
        expect(fatherChildren).toEqual(expect.arrayContaining(['child-1', 'child-2', 'half-sib-1']));
        expect(fatherChildren.length).toBe(3);

        const motherChildren = getChildren('mother-1', sampleLinks);
        expect(motherChildren).toEqual(expect.arrayContaining(['child-1', 'child-2']));
        expect(motherChildren.length).toBe(2);
      });

      it('returns empty array when node has no children', () => {
        expect(getChildren('child-1', sampleLinks)).toEqual([]);
      });
    });

    describe('getSpouses', () => {
      it('returns both marriage and divorce partners', () => {
        const spouses = getSpouses('father-1', sampleLinks);
        expect(spouses).toEqual(expect.arrayContaining(['mother-1', 'ex-1']));
        expect(spouses.length).toBe(2);
      });

      it('works bidirectionally for spouse links', () => {
        expect(getSpouses('mother-1', sampleLinks)).toEqual(['father-1']);
        expect(getSpouses('ex-1', sampleLinks)).toEqual(['father-1']);
      });

      it('returns empty array when node has no spouses', () => {
        expect(getSpouses('child-1', sampleLinks)).toEqual([]);
      });
    });

    describe('getSiblings', () => {
      it('returns nodes sharing at least one parent (excluding self)', () => {
        const child1Siblings = getSiblings('child-1', sampleLinks);
        expect(child1Siblings).toEqual(expect.arrayContaining(['child-2', 'half-sib-1']));
        expect(child1Siblings.length).toBe(2);
        expect(child1Siblings).not.toContain('child-1');
      });

      it('returns half-siblings sharing one parent', () => {
        const halfSiblings = getSiblings('half-sib-1', sampleLinks);
        expect(halfSiblings).toEqual(expect.arrayContaining(['child-1', 'child-2']));
        expect(halfSiblings.length).toBe(2);
      });

      it('returns empty array when node has no parents or no siblings', () => {
        expect(getSiblings('father-1', sampleLinks)).toEqual([]);
        expect(getSiblings('unrelated-1', sampleLinks)).toEqual([]);
      });
    });
  });

  describe('1-Degree Kinship Network', () => {
    // Family topology:
    // Anchor (user-1)
    // - Father (father-1) [Direct Parent]
    //   - Stepmother (step-mother-1) married to Father [Stepparent -> parent, blended]
    //   - Half-sibling (half-brother-1) child of Father & Stepmother [Sibling]
    // - Mother (mother-1) [Direct Parent]
    // - Sibling (sister-1) child of Father & Mother [Sibling]
    // - Spouse (spouse-1) [Direct Spouse]
    //   - Stepchild (step-son-1) child of Spouse & ex-partner [Stepchild -> child, blended]
    // - Child (child-1) child of Anchor & other partner (co-parent-1) [Direct Child]
    // - Co-parent (co-parent-1) not married to Anchor, but parent of child-1 [Co-parent -> spouse, blended]
    // - Unrelated (unrelated-1)
    const links: FamilyLink[] = [
      // Direct parents
      { source: 'father-1', target: 'user-1', type: 'parent' },
      { source: { id: 'mother-1', firstName: 'Mother' }, target: 'user-1', type: 'parent' },
      // Direct spouse
      { source: 'user-1', target: { id: 'spouse-1', firstName: 'Spouse' }, type: 'marriage' },
      // Sibling
      { source: 'father-1', target: 'sister-1', type: 'parent' },
      { source: 'mother-1', target: 'sister-1', type: 'parent' },
      // Stepparent (father's spouse)
      { source: 'father-1', target: 'step-mother-1', type: 'marriage' },
      // Half-sibling (child of father and stepmother)
      { source: 'father-1', target: 'half-brother-1', type: 'parent' },
      { source: 'step-mother-1', target: 'half-brother-1', type: 'parent' },
      // Stepchild (spouse's child)
      { source: 'spouse-1', target: 'step-son-1', type: 'parent' },
      // Direct child
      { source: 'user-1', target: 'child-1', type: 'parent' },
      // Co-parent (child's other parent)
      { source: 'co-parent-1', target: 'child-1', type: 'parent' },
      // Unrelated nodes
      { source: 'unrelated-1', target: 'unrelated-2', type: 'marriage' },
    ];

    describe('get1DegreeRelatives', () => {
      it('identifies direct parents with relationship "parent" and isBlended false', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const father = relatives.find(r => r.nodeId === 'father-1');
        const mother = relatives.find(r => r.nodeId === 'mother-1');

        expect(father).toEqual({ nodeId: 'father-1', relationship: 'parent', isBlended: false });
        expect(mother).toEqual({ nodeId: 'mother-1', relationship: 'parent', isBlended: false });
      });

      it('identifies direct spouses with relationship "spouse" and isBlended false', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const spouse = relatives.find(r => r.nodeId === 'spouse-1');

        expect(spouse).toEqual({ nodeId: 'spouse-1', relationship: 'spouse', isBlended: false });
      });

      it('identifies direct children with relationship "child" and isBlended false', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const child = relatives.find(r => r.nodeId === 'child-1');

        expect(child).toEqual({ nodeId: 'child-1', relationship: 'child', isBlended: false });
      });

      it('identifies full siblings and half-siblings with relationship "sibling"', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const sister = relatives.find(r => r.nodeId === 'sister-1');
        const halfBrother = relatives.find(r => r.nodeId === 'half-brother-1');

        expect(sister).toEqual({ nodeId: 'sister-1', relationship: 'sibling', isBlended: false });
        expect(halfBrother).toEqual({ nodeId: 'half-brother-1', relationship: 'sibling', isBlended: false });
      });

      it('identifies stepparents (parent spouse) as relationship "parent" with isBlended true', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const stepMother = relatives.find(r => r.nodeId === 'step-mother-1');

        expect(stepMother).toEqual({ nodeId: 'step-mother-1', relationship: 'parent', isBlended: true });
      });

      it('identifies stepchildren (spouse child) as relationship "child" with isBlended true', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const stepSon = relatives.find(r => r.nodeId === 'step-son-1');

        expect(stepSon).toEqual({ nodeId: 'step-son-1', relationship: 'child', isBlended: true });
      });

      it('identifies co-parents (child other parent) as relationship "spouse" with isBlended true', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const coParent = relatives.find(r => r.nodeId === 'co-parent-1');

        expect(coParent).toEqual({ nodeId: 'co-parent-1', relationship: 'spouse', isBlended: true });
      });

      it('never includes the anchor node itself or unrelated nodes', () => {
        const relatives = get1DegreeRelatives('user-1', links);
        const relativeIds = relatives.map(r => r.nodeId);

        expect(relativeIds).not.toContain('user-1');
        expect(relativeIds).not.toContain('unrelated-1');
        expect(relativeIds).not.toContain('unrelated-2');
      });

      it('returns empty array when anchorNodeId is invalid or links empty', () => {
        expect(get1DegreeRelatives('', links)).toEqual([]);
        expect(get1DegreeRelatives('user-1', [])).toEqual([]);
      });
    });

    describe('get1DegreeNodeIds', () => {
      it('returns all 1-degree relative IDs plus the anchor node itself', () => {
        const ids = get1DegreeNodeIds('user-1', links);

        expect(ids).toContain('user-1');
        expect(ids).toContain('father-1');
        expect(ids).toContain('mother-1');
        expect(ids).toContain('spouse-1');
        expect(ids).toContain('sister-1');
        expect(ids).toContain('half-brother-1');
        expect(ids).toContain('step-mother-1');
        expect(ids).toContain('step-son-1');
        expect(ids).toContain('child-1');
        expect(ids).toContain('co-parent-1');

        expect(ids).not.toContain('unrelated-1');
        expect(ids).not.toContain('unrelated-2');
        expect(ids.length).toBe(10);
      });

      it('returns empty array if anchorNodeId is null or undefined or empty', () => {
        expect(get1DegreeNodeIds(null, links)).toEqual([]);
        expect(get1DegreeNodeIds(undefined, links)).toEqual([]);
        expect(get1DegreeNodeIds('', links)).toEqual([]);
      });
    });
  });
});
