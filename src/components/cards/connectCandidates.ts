import { FamilyGraph, FamilyNode } from '../../types/graph';
import { MSG_DUPLICATE } from '../../lib/adminGraphValidation';
import { TargetVisibility } from '../../utils/connectTargeting';
import { buildConnectOptions } from './connectOptions';

/**
 * Who can be the target of a Connect Mode link, and why not when they cannot.
 *
 * In 2D a rejected pair is discovered late — you click two cards and the picker
 * greys out every option. In 3D that failure mode is far worse: a target may be
 * occluded, off-screen, or a few pixels wide, so a click that does nothing is
 * indistinguishable from bad aim. Deciding candidacy up front is what lets the
 * scene rim-light the valid targets and name the reason for the rest (LIN-50).
 */

export type Candidacy = { ok: true } | { ok: false; reason: string };

/** The two ends of a Kinship Link being drawn, in the order they were aimed at. */
export interface ConnectPair {
  source: FamilyNode;
  target: FamilyNode;
}

export const MSG_TARGET_NOT_IN_VIEW = 'This person is not in the current view.';

/**
 * Whether any Kinship Link at all could join these two people.
 *
 * The role is deliberately left null: which role a parent link carries is asked
 * for by the kinship picker *after* a pair is chosen, and demanding one here
 * would hide people who can still be linked some other way.
 */
export function candidacyFor(
  graphData: FamilyGraph,
  sourceId: string,
  targetId: string
): Candidacy {
  const options = buildConnectOptions(graphData, sourceId, targetId, null);
  const outcomes = [options.marriage, options.divorce, options.sourceParent, options.targetParent];

  if (outcomes.some((o) => o.ok)) return { ok: true };

  // Every offer failed, so the four messages must be summarised into one. An
  // existing link between the pair is the fact that explains all four, so it
  // wins; otherwise the first refusal is as good a summary as any.
  const refusals = outcomes.flatMap((o) => (o.ok ? [] : [o.message]));
  return { ok: false, reason: refusals.find((m) => m === MSG_DUPLICATE) ?? refusals[0] };
}

/**
 * Judge a whole set of people at once.
 *
 * Pass only the people currently in the scene: a hidden cluster is not a
 * legitimate target, and rim-lighting cannot advertise what is not drawn.
 */
export function buildCandidacy(
  graphData: FamilyGraph,
  sourceId: string,
  nodes: { id: string }[]
): Map<string, Candidacy> {
  return new Map(nodes.map((node) => [node.id, candidacyFor(graphData, sourceId, node.id)]));
}

/** The accepted ids, for the per-frame lookups the scene does while rendering. */
export function candidateIds(candidacy: Map<string, Candidacy>): Set<string> {
  const ids = new Set<string>();
  for (const [id, verdict] of candidacy) {
    if (verdict.ok) ids.add(id);
  }
  return ids;
}

export interface TargetOption {
  node: FamilyNode;
  candidacy: Candidacy;
  visibility: TargetVisibility;
}

/** Most rows the fallback picker shows at once, so it cannot overrun the panel. */
export const TARGET_OPTION_LIMIT = 8;

/**
 * The rows of the fallback picker — the way to reach a target that aiming
 * cannot.
 *
 * Two pools, because the user is asking two different questions. Having typed a
 * name they mean *that person*, so the existing search result set is offered
 * verbatim, unlinkable people included with their reason; a silent omission
 * would read as a broken search. Having typed nothing they mean "who can I even
 * link to", so only linkable people are listed, unreachable ones first — those
 * are the ones the picker exists for.
 */
export function buildTargetOptions(params: {
  query: string;
  /** The existing `TreeSearchBar` result set. */
  matches: FamilyNode[];
  /** Everyone currently drawn in the scene. */
  visibleNodes: FamilyNode[];
  sourceId: string;
  candidacy: Map<string, Candidacy>;
  visibility: Map<string, TargetVisibility>;
  limit?: number;
  /** `total` is the whole pool before the cap, so the panel can admit what it left out. */
}): { options: TargetOption[]; total: number } {
  const { query, matches, visibleNodes, sourceId, candidacy, visibility } = params;
  const limit = params.limit ?? TARGET_OPTION_LIMIT;

  // Anyone absent from the candidacy map is not in the scene — a hidden cluster
  // or a stale search result — and is not linkable from here.
  const verdictFor = (id: string): Candidacy =>
    candidacy.get(id) ?? { ok: false, reason: MSG_TARGET_NOT_IN_VIEW };

  const pool = query.trim()
    ? matches
    : visibleNodes.filter((node) => verdictFor(node.id).ok);

  const ranked = pool
    .filter((node) => node.id !== sourceId)
    .map((node) => ({
      node,
      candidacy: verdictFor(node.id),
      // An unmeasured candidate is treated as unreachable rather than dropped:
      // the picker is the safe side to err on.
      visibility: visibility.get(node.id) ?? 'offscreen',
    }))
    .sort((a, b) => rank(a) - rank(b));

  return { options: ranked.slice(0, limit), total: ranked.length };
}

/** Linkable before unlinkable; within each, the ones aiming cannot reach first. */
function rank(option: TargetOption): number {
  const linkable = option.candidacy.ok ? 0 : 2;
  const reachable = option.visibility === 'onscreen' ? 1 : 0;
  return linkable + reachable;
}
