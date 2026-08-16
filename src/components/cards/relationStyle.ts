import { RelativeDirection } from '../../types/graph';

/**
 * Presentation of a relation, shared between the Ghost Node card and the hosts
 * that draw a connector to it — the 2D shell needs the same accent colour for
 * its dashed line as the card uses for its border.
 */
const RELATION_COLORS: Record<RelativeDirection, string> = {
  parent: '#fef08a',
  spouse: '#f472b6',
  child: '#93c5fd',
};

export function relationColor(relation: RelativeDirection): string {
  return RELATION_COLORS[relation];
}

export function relationLabel(relation: RelativeDirection, anchorFirstName: string): string {
  switch (relation) {
    case 'parent':
      return `+ Parent of ${anchorFirstName}`;
    case 'spouse':
      return `+ Spouse of ${anchorFirstName}`;
    case 'child':
    default:
      return `+ Child of ${anchorFirstName}`;
  }
}
