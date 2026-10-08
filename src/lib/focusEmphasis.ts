import type { FamilyLink } from '../types/graph';
import { getChildren, getParents, getSpouses } from './familyGraph';

export type Emphasis = 'normal' | 'hovered' | 'focused' | 'relative' | 'dimmed' | 'ghost' | 'hidden';

export interface FocusEmphasisInput {
  personIds: readonly string[];
  links: readonly FamilyLink[];
  hoveredId: string | null;
  focusedId: string | null;
  searchMatchIds: ReadonlySet<string> | null;
}

function directRelatives(personId: string, links: readonly FamilyLink[]): Set<string> {
  return new Set([...getParents(personId, links), ...getChildren(personId, links), ...getSpouses(personId, links)]);
}

export function focusEmphasis(input: FocusEmphasisInput): Map<string, Emphasis> {
  const { personIds, links, hoveredId, focusedId, searchMatchIds } = input;
  const present = new Set(personIds);
  const focusedSubject = focusedId && present.has(focusedId) ? focusedId : null;
  const hoveredSubject = hoveredId && present.has(hoveredId) ? hoveredId : null;
  const subjectId = focusedSubject ?? hoveredSubject;
  const subjectState: Emphasis = focusedSubject ? 'focused' : 'hovered';
  const othersState: Emphasis = focusedSubject ? 'ghost' : 'dimmed';
  const relatives = subjectId ? directRelatives(subjectId, links) : new Set<string>();

  const emphasis = new Map<string, Emphasis>();
  for (const id of personIds) {
    if (searchMatchIds && !searchMatchIds.has(id)) emphasis.set(id, 'hidden');
    else if (!subjectId) emphasis.set(id, 'normal');
    else if (id === subjectId) emphasis.set(id, subjectState);
    else emphasis.set(id, relatives.has(id) ? 'relative' : othersState);
  }
  return emphasis;
}
