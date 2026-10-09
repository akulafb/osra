import type { RelativeDirection } from '../types/graph';

const RELATION_COLORS: Record<RelativeDirection, string> = {
  parent: '#fef08a',
  spouse: '#f472b6',
  child: '#93c5fd',
  sibling: '#86efac',
};

export const CONNECT_ACCENT = '#c084fc';

export function relationColor(relation: RelativeDirection): string {
  return RELATION_COLORS[relation];
}
