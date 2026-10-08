import type { FamilyLink } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';

export type Emphasis = 'normal' | 'hovered' | 'focused' | 'relative' | 'dimmed' | 'ghost' | 'hidden';

export interface FocusEmphasisInput {
  personIds: readonly string[];
  links: readonly FamilyLink[];
  hoveredId: string | null;
  focusedId: string | null;
  /** null while no search is active. */
  searchMatchIds: ReadonlySet<string> | null;
}

function directNeighbours(personId: string, links: readonly FamilyLink[]): Set<string> {
  const neighbours = new Set<string>();
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    if (sourceId === personId) neighbours.add(targetId);
    else if (targetId === personId) neighbours.add(sourceId);
  }
  return neighbours;
}

/**
 * Each Person's emphasis in a Paper view. Focus outranks hover; a search hides
 * every non-match whatever else applies. Relatives are direct Kinship Link
 * neighbours only.
 */
export function focusEmphasis(input: FocusEmphasisInput): Map<string, Emphasis> {
  const { personIds, links, hoveredId, focusedId, searchMatchIds } = input;
  const present = new Set(personIds);
  const subjectId = focusedId && present.has(focusedId) ? focusedId : hoveredId && present.has(hoveredId) ? hoveredId : null;
  const subjectState: Emphasis = subjectId === focusedId ? 'focused' : 'hovered';
  const othersState: Emphasis = subjectId === focusedId ? 'ghost' : 'dimmed';
  const relatives = subjectId ? directNeighbours(subjectId, links) : new Set<string>();

  const emphasis = new Map<string, Emphasis>();
  for (const id of personIds) {
    if (searchMatchIds && !searchMatchIds.has(id)) emphasis.set(id, 'hidden');
    else if (!subjectId) emphasis.set(id, 'normal');
    else if (id === subjectId) emphasis.set(id, subjectState);
    else emphasis.set(id, relatives.has(id) ? 'relative' : othersState);
  }
  return emphasis;
}
