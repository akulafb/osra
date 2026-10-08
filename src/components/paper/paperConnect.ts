import type { Emphasis } from '../../lib/focusEmphasis';

/** Connect Mode's emphasis in ink: the source stays focused, every Person it may link to keeps their ink, and the rest fade. */
export function paperConnectEmphasis(
  ids: readonly string[],
  sourceId: string,
  candidateIds: ReadonlySet<string>,
  hoveredId: string | null
): Map<string, Emphasis> {
  return new Map(
    ids.map((id): [string, Emphasis] => {
      if (id === sourceId) return [id, 'focused'];
      if (!candidateIds.has(id)) return [id, 'ghost'];
      return [id, id === hoveredId ? 'hovered' : 'normal'];
    })
  );
}
