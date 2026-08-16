import { FamilyGraph, FamilyLink } from '../../types/graph';
import { validateProposedLink } from '../../lib/adminGraphValidation';

/** The kinds of Kinship Link this picker can create. */
export type KinshipLinkType = FamilyLink['type'];

export type ParentRole = NonNullable<FamilyLink['parentRole']> | null;

/** Which of the four offers the user has picked in the picker. */
export type ConnectSelection = 'parent-source' | 'parent-target' | 'marriage' | 'divorce';

type Validation = { ok: true } | { ok: false; message: string };

export interface ConnectOptions {
  /** Source is parent of target. */
  sourceParent: Validation;
  /** Target is parent of source. */
  targetParent: Validation;
  marriage: Validation;
  divorce: Validation;
}

export interface ConnectConfirmation {
  type: KinshipLinkType;
  parentRole: ParentRole;
  /** Only meaningful for parent links: which end is the parent. */
  parentIsSource?: boolean;
}

/**
 * Validate all four relationships on offer between two people at once, so the
 * picker can disable the impossible ones before the user commits to any.
 */
export function buildConnectOptions(
  graphData: FamilyGraph,
  sourceId: string,
  targetId: string,
  parentRole: ParentRole
): ConnectOptions {
  return {
    sourceParent: validateProposedLink(graphData, {
      source: sourceId,
      target: targetId,
      type: 'parent',
      parentRole,
    }),
    targetParent: validateProposedLink(graphData, {
      source: targetId,
      target: sourceId,
      type: 'parent',
      parentRole,
    }),
    marriage: validateProposedLink(graphData, {
      source: sourceId,
      target: targetId,
      type: 'marriage',
    }),
    divorce: validateProposedLink(graphData, {
      source: sourceId,
      target: targetId,
      type: 'divorce',
    }),
  };
}

/**
 * Turn the user's pick into the arguments a Kinship Link mutation needs,
 * refusing if that pick is not actually valid on this graph.
 *
 * A parent role is only carried on parent links; marriage and divorce drop it,
 * because `validateProposedLink` rejects a role on any non-parent link.
 */
export function resolveConnectSelection(
  selection: ConnectSelection,
  options: ConnectOptions,
  parentRole: ParentRole
): { ok: true; confirmation: ConnectConfirmation } | { ok: false; message: string } {
  switch (selection) {
    case 'parent-source':
      if (!options.sourceParent.ok) return { ok: false, message: options.sourceParent.message };
      return { ok: true, confirmation: { type: 'parent', parentRole, parentIsSource: true } };

    case 'parent-target':
      if (!options.targetParent.ok) return { ok: false, message: options.targetParent.message };
      return { ok: true, confirmation: { type: 'parent', parentRole, parentIsSource: false } };

    case 'marriage':
      if (!options.marriage.ok) return { ok: false, message: options.marriage.message };
      return { ok: true, confirmation: { type: 'marriage', parentRole: null } };

    case 'divorce':
      if (!options.divorce.ok) return { ok: false, message: options.divorce.message };
      return { ok: true, confirmation: { type: 'divorce', parentRole: null } };
  }
}
