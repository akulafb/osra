// src/utils/familyContext.ts

import type { FamilyNode, FamilyLink } from '../types/graph';
import { getParents, getChildren, getSpouses, getSiblings } from '../lib/familyGraph';
import { formatNodeDisplayName } from './nodeDisplayName';

export function formatFamilyData(nodes: FamilyNode[], links: FamilyLink[]): string {
  if (!nodes || nodes.length === 0) return 'No family data available.';

  const nameMap = new Map<string, string>(nodes.map(n => [n.id, formatNodeDisplayName(n)]));

  // Format into a structured text profile for each person
  let context = 'FAMILY PROFILES\n';
  context += '===============\n\n';

  nodes.forEach(node => {
    const displayName = nameMap.get(node.id) || formatNodeDisplayName(node);
    const cluster = node.familyCluster || 'Unknown';

    // Direct parents + inferred parent spouses
    const directParents = getParents(node.id, links);
    const allParentIds = new Set<string>(directParents);
    directParents.forEach(pId => {
      getSpouses(pId, links).forEach(spId => allParentIds.add(spId));
    });

    const parents = Array.from(allParentIds)
      .map(id => nameMap.get(id))
      .filter((name): name is string => Boolean(name));

    const siblings = getSiblings(node.id, links)
      .map(id => nameMap.get(id))
      .filter((name): name is string => Boolean(name));

    const spouses = getSpouses(node.id, links)
      .map(id => nameMap.get(id))
      .filter((name): name is string => Boolean(name));

    const children = getChildren(node.id, links)
      .map(id => nameMap.get(id))
      .filter((name): name is string => Boolean(name));

    context += `PERSON: ${displayName}\n`;
    context += `- Family Cluster: ${cluster}\n`;
    if (parents.length > 0) context += `- Parents: ${parents.join(', ')}\n`;
    if (siblings.length > 0) context += `- Siblings: ${siblings.join(', ')}\n`;
    if (spouses.length > 0) context += `- Spouse: ${spouses.join(', ')}\n`;
    if (children.length > 0) context += `- Children: ${children.join(', ')}\n`;
    context += '\n';
  });

  context += '\nVALID NAMES SUMMARY (FOR VERIFICATION):\n';
  context += nodes.map(n => formatNodeDisplayName(n)).join(', ');
  context += '\n';

  return context;
}
