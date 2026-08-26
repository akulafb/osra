import { describe, it, expect } from 'vitest';
import { formatFamilyData } from './familyContext';
import type { FamilyNode, FamilyLink } from '../types/graph';

describe('formatFamilyData', () => {
  it('returns fallback message when node list is empty', () => {
    expect(formatFamilyData([], [])).toBe('No family data available.');
  });

  it('formats family profiles with parents, siblings, spouses, and children', () => {
    const nodes: FamilyNode[] = [
      { id: 'father-1', firstName: 'Ahmad', familyCluster: 'Badran' },
      { id: 'mother-1', firstName: 'Fatima', familyCluster: 'Al-Masri' },
      { id: 'child-1', firstName: 'Tariq', familyCluster: 'Badran' },
      { id: 'child-2', firstName: 'Layla', familyCluster: 'Badran' },
      { id: 'spouse-1', firstName: 'Nour', familyCluster: 'Khalil' },
    ];

    const links: FamilyLink[] = [
      { source: 'father-1', target: 'mother-1', type: 'marriage' },
      { source: 'father-1', target: 'child-1', type: 'parent' },
      { source: 'mother-1', target: 'child-1', type: 'parent' },
      { source: 'father-1', target: 'child-2', type: 'parent' },
      { source: 'mother-1', target: 'child-2', type: 'parent' },
      { source: 'child-1', target: 'spouse-1', type: 'marriage' },
    ];

    const context = formatFamilyData(nodes, links);

    expect(context).toContain('FAMILY PROFILES');
    expect(context).toContain('PERSON: Tariq Badran');
    expect(context).toContain('- Parents: Ahmad Badran, Fatima Al-Masri');
    expect(context).toContain('- Siblings: Layla Badran');
    expect(context).toContain('- Spouse: Nour Khalil');
    expect(context).toContain('VALID NAMES SUMMARY (FOR VERIFICATION):');
    expect(context).toContain('Ahmad Badran, Fatima Al-Masri, Tariq Badran, Layla Badran, Nour Khalil');
  });
});
