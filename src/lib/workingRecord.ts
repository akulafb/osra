// src/lib/workingRecord.ts

import { getLinkEndpoints, getNodeId } from './familyGraph';
import { dropOrphanLinks } from './sanitizeFamilyGraph';
import type { ConfirmedRows } from './treeRecord';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

/**
 * The Working Record: what the browser currently believes the Tree Record says
 * (ADR-0008, LIN-58).
 *
 * State is the last thing the server said plus an ordered list of Pending
 * Changes, and the Working Record is *derived* from those two on every
 * transition. Changes go in; only a snapshot comes out. An incrementally
 * patched array drifts permanently if a change is dropped, re-ordered or
 * applied twice, and nothing can detect the drift; deriving cannot drift.
 *
 * Every function here is pure and returns new state. Nothing reads the clock
 * or mints an id: `changeId` and client Person ids are supplied by the caller,
 * so the whole module is deterministic under test.
 */

/** Handle for one Pending Change. Local only — never a database id. */
export type ChangeId = string;

/** A primitive change to the Tree Record. The vocabulary a Postgres change feed also speaks (D4). */
export type RecordChange =
  | { kind: 'person-upsert'; person: FamilyNode }
  | { kind: 'person-remove'; id: string }
  | { kind: 'link-upsert'; link: FamilyLink }
  | { kind: 'link-remove'; id: string };

/**
 * One thing the user did, and the changes it makes to the record.
 * A sibling addition is one Pending Change with several `link-upsert`s, because
 * `rel_type = 'sibling'` inserts one Kinship Link per parent.
 */
export interface PendingChange {
  changeId: ChangeId;
  changes: RecordChange[];
}

export interface WorkingRecordState {
  /**
   * The last thing the server said. Permission derivation reads this and never
   * the projection (D13): `canEdit` computes the 1-degree perimeter from
   * Kinship Links and the server computes the same perimeter from persisted
   * rows, so an affordance derived from a pending link is an affordance for a
   * write the server refuses.
   */
  confirmed: FamilyGraph;
  /** Ordered. Folded onto `confirmed` to derive the Working Record. */
  pending: PendingChange[];
}

/**
 * How far from their relatives a Person with no position yet is seeded, in
 * graph units. Without this the simulation drops them somewhere arbitrary and
 * then shoves the rest of the tree aside making room — which is the jolt, and
 * why it only ever happened on a Spawn (LIN-55).
 */
const SEED_RADIUS = 40;

/** Written by the simulation, not by the record. Never a reason to re-mint a Person. */
const POSITION_KEYS: Record<string, true> = { x: true, y: true, z: true, fx: true, fy: true, fz: true };

export function emptyWorkingRecord(): WorkingRecordState {
  return { confirmed: { nodes: [], links: [] }, pending: [] };
}

/**
 * Initial load and retry only (D14). Discards nothing pending: a write in
 * flight when the reload lands is still in flight when it finishes.
 */
export function withConfirmedSnapshot(
  state: WorkingRecordState,
  snapshot: FamilyGraph
): WorkingRecordState {
  return { confirmed: snapshot, pending: state.pending };
}

export function applyPending(
  state: WorkingRecordState,
  changeId: ChangeId,
  changes: RecordChange[]
): WorkingRecordState {
  return { confirmed: state.confirmed, pending: [...state.pending, { changeId, changes }] };
}

/** Server accepted and reported rows: fold them into `confirmed`, drop the Pending Change (D12). */
export function confirmPending(
  state: WorkingRecordState,
  changeId: ChangeId,
  rows: ConfirmedRows
): WorkingRecordState {
  return {
    confirmed: foldRows(state.confirmed, rows),
    pending: withoutChange(state.pending, changeId),
  };
}

/** Server rejected: drop the Pending Change, `confirmed` untouched (D6). */
export function revertPending(state: WorkingRecordState, changeId: ChangeId): WorkingRecordState {
  const pending = withoutChange(state.pending, changeId);
  if (pending === state.pending) return state;
  return { confirmed: state.confirmed, pending };
}

/**
 * Server accepted having done nothing — `already_connected` (D10). Identical in
 * effect to a revert, and deliberately a separate name: one is a failure the
 * caller must be told about and the other is not.
 */
export function dropPending(state: WorkingRecordState, changeId: ChangeId): WorkingRecordState {
  return revertPending(state, changeId);
}

/**
 * The only output (D5). `previous` supplies node objects to reuse by Person id
 * when that Person's facts are unchanged (D7); pass `null` on first projection.
 *
 * `previous` is also where the positions live: react-force-graph writes
 * `x/y/z/fx/fy/fz` onto the objects it was handed, and this function never
 * hands out an object held in `confirmed`, so the record itself stays a value.
 */
export function projectWorkingRecord(
  state: WorkingRecordState,
  previous: FamilyGraph | null
): FamilyGraph {
  const folded = foldRecord(state);
  // The removal cascade is not re-implemented: a Kinship Link whose endpoint is
  // gone is dropped here, exactly as it is for an inconsistent fetch.
  const links = dropOrphanLinks(folded.nodes, folded.links);

  const priorNodes = new Map<string, FamilyNode>();
  if (previous) for (const node of previous.nodes) priorNodes.set(node.id, node);

  const nodes = folded.nodes.map((next) => {
    const prior = priorNodes.get(next.id);
    if (!prior) return { ...next };
    if (personFactsEqual(prior, next)) return prior;
    return {
      ...next,
      x: prior.x,
      y: prior.y,
      z: prior.z,
      fx: prior.fx,
      fy: prior.fy,
      fz: prior.fz,
    };
  });

  seedUnplacedPersons(nodes, links);

  return { nodes, links: projectLinks(links, nodes, previous) };
}

// --- Folding ----------------------------------------------------------------

interface FoldedRecord {
  nodes: FamilyNode[];
  links: FamilyLink[];
}

/**
 * `confirmed`, then `pending` in list order. A later `person-upsert` for the
 * same id wins; a `person-remove` wins over an earlier `person-upsert`.
 */
function foldRecord(state: WorkingRecordState): FoldedRecord {
  const nodes = new Map<string, FamilyNode>();
  for (const person of state.confirmed.nodes) nodes.set(person.id, person);

  const links = new Map<string, FamilyLink>();
  /** How many links carry each `source|target|type`, so a pending one can tell it would double up. */
  const pairs = new Map<string, number>();

  const addLink = (link: FamilyLink): void => {
    const signature = pairSignature(link);
    const key = linkKey(link);
    const existing = links.get(key);
    if (!existing && !link.id && (pairs.get(signature) ?? 0) > 0) {
      // An id-less pending Kinship Link the record already has: `already_connected`,
      // one round-trip before the server says so. Rendering both draws a duplicate.
      return;
    }
    if (existing) countPair(pairs, pairSignature(existing), -1);
    links.set(key, link);
    countPair(pairs, signature, 1);
  };

  for (const link of state.confirmed.links) addLink(link);

  for (const change of state.pending) {
    for (const entry of change.changes) {
      switch (entry.kind) {
        case 'person-upsert':
          nodes.set(entry.person.id, entry.person);
          break;
        case 'person-remove':
          nodes.delete(entry.id);
          break;
        case 'link-upsert':
          addLink(entry.link);
          break;
        case 'link-remove': {
          const key = `id:${entry.id}`;
          const existing = links.get(key);
          if (existing) {
            links.delete(key);
            countPair(pairs, pairSignature(existing), -1);
          }
          break;
        }
      }
    }
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

/**
 * Fold what a write reported into `confirmed` (D12: the server row wins
 * wholesale). `isClaimed` is the one exception, and not a merge: it is derived
 * from `public.users.node_id` by a separate RPC, so no `nodes` row can carry
 * it, and letting a row erase it would clear a Person's claim on every rename.
 */
function foldRows(confirmed: FamilyGraph, rows: ConfirmedRows): FamilyGraph {
  const nodes = new Map<string, FamilyNode>();
  for (const person of confirmed.nodes) nodes.set(person.id, person);
  for (const person of rows.persons ?? []) {
    const held = nodes.get(person.id);
    nodes.set(
      person.id,
      held?.isClaimed !== undefined && person.isClaimed === undefined
        ? { ...person, isClaimed: held.isClaimed }
        : person
    );
  }
  for (const id of rows.removedPersonIds ?? []) nodes.delete(id);

  const links = new Map<string, FamilyLink>();
  for (const link of confirmed.links) links.set(linkKey(link), link);
  for (const link of rows.links ?? []) links.set(linkKey(link), link);
  for (const id of rows.removedLinkIds ?? []) links.delete(`id:${id}`);

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

function withoutChange(pending: PendingChange[], changeId: ChangeId): PendingChange[] {
  const next = pending.filter((change) => change.changeId !== changeId);
  return next.length === pending.length ? pending : next;
}

function countPair(pairs: Map<string, number>, signature: string, delta: number): void {
  const next = (pairs.get(signature) ?? 0) + delta;
  if (next > 0) pairs.set(signature, next);
  else pairs.delete(signature);
}

/** A persisted Kinship Link is its row; a pending one is its endpoints and type (D11). */
function linkKey(link: FamilyLink): string {
  return link.id ? `id:${link.id}` : `pair:${pairSignature(link)}`;
}

/**
 * What makes two Kinship Links "the same edge" for a pending link with no row.
 *
 * `marriage` and `divorce` are symmetric — the server's duplicate guard matches
 * both orderings of the pair — so the endpoints are sorted and A–B and B–A
 * collapse to one signature. `parent` is not: A is B's parent is a different
 * claim from B is A's parent, and both are writable.
 */
function pairSignature(link: FamilyLink): string {
  const { sourceId, targetId } = getLinkEndpoints(link);
  if (link.type === 'parent') return `${sourceId}|${targetId}|parent`;
  const [a, b] = sourceId <= targetId ? [sourceId, targetId] : [targetId, sourceId];
  return `${a}|${b}|${link.type}`;
}

// --- Projection -------------------------------------------------------------

/**
 * Every fact except the six the simulation writes. Compared over the union of
 * both objects' keys rather than a fixed list, so a field added to `FamilyNode`
 * cannot silently stop re-minting the Person who changed it.
 */
function personFactsEqual(a: FamilyNode, b: FamilyNode): boolean {
  if (a === b) return true;
  // `FamilyNode` is an interface with no index signature, so a keyed read is
  // unexpressible without this; nothing here writes, and every value is
  // compared as `unknown`.
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  const seen = new Set<string>();
  for (const key of Object.keys(left)) {
    seen.add(key);
    if (POSITION_KEYS[key]) continue;
    if (left[key] !== right[key]) return false;
  }
  for (const key of Object.keys(right)) {
    if (seen.has(key) || POSITION_KEYS[key]) continue;
    if (right[key] !== undefined) return false;
  }
  return true;
}

/**
 * A Person nobody has ever drawn has no coordinates, so seed them beside the
 * relative they were added to (LIN-55). Mutates the freshly minted objects the
 * projection owns, never anything held in `confirmed`.
 */
function seedUnplacedPersons(nodes: FamilyNode[], links: FamilyLink[]): void {
  if (!nodes.some((node) => node.x === undefined)) return;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const neighbours = new Map<string, string[]>();
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    neighbours.set(sourceId, [...(neighbours.get(sourceId) ?? []), targetId]);
    neighbours.set(targetId, [...(neighbours.get(targetId) ?? []), sourceId]);
  }

  nodes.forEach((node, index) => {
    if (node.x !== undefined) return;
    const anchors = (neighbours.get(node.id) ?? [])
      .map((id) => byId.get(id))
      .filter((n): n is FamilyNode => !!n && n.x !== undefined);
    if (anchors.length === 0) return;

    const mean = (pick: (n: FamilyNode) => number | undefined): number =>
      anchors.reduce((sum, n) => sum + (pick(n) ?? 0), 0) / anchors.length;
    // Golden angle, so several new Persons fan out rather than landing on top
    // of each other. Deterministic: no randomness to chase.
    const angle = index * 2.39996;
    node.x = mean((n) => n.x) + Math.cos(angle) * SEED_RADIUS;
    node.y = mean((n) => n.y) + Math.sin(angle) * SEED_RADIUS;
    node.z = mean((n) => n.z);
  });
}

/**
 * Kinship Links are reused by id, or by `source|target|type` while pending, so
 * the three.js objects keyed on them survive. Reuse stops at a replaced
 * endpoint: d3-force rewrites `source`/`target` into node objects in place and
 * never re-resolves one that is already an object, so a reused link would keep
 * pulling towards the Person this projection just discarded.
 */
function projectLinks(
  links: FamilyLink[],
  nodes: FamilyNode[],
  previous: FamilyGraph | null
): FamilyLink[] {
  const priorLinks = new Map<string, FamilyLink>();
  if (previous) for (const link of previous.links) priorLinks.set(linkKey(link), link);
  if (priorLinks.size === 0) return links.map((link) => ({ ...link }));

  const byId = new Map(nodes.map((node) => [node.id, node]));

  return links.map((next) => {
    const prior = priorLinks.get(linkKey(next));
    if (
      prior &&
      linkFactsEqual(prior, next) &&
      (typeof prior.source === 'string' || byId.get(prior.source.id) === prior.source) &&
      (typeof prior.target === 'string' || byId.get(prior.target.id) === prior.target)
    ) {
      return prior;
    }
    return { ...next };
  });
}

function linkFactsEqual(a: FamilyLink, b: FamilyLink): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    (a.parentRole ?? null) === (b.parentRole ?? null) &&
    getNodeId(a.source) === getNodeId(b.source) &&
    getNodeId(a.target) === getNodeId(b.target)
  );
}
