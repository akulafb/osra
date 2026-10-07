import type { FamilyNode, FamilyLink, LinkEndpoint, PersonGender, RelativeDirection } from '../types/graph';
import { formatNodeDisplayName } from '../utils/nodeDisplayName';
import { bloodLabel, eachWord } from './kinshipTerm';
export type { FamilyNode, FamilyLink, LinkEndpoint, RelativeDirection };

/**
 * Safely extracts a node ID from a string, a FamilyNode, a LiveNodePosition,
 * or any object containing an `id` property. Returns empty string if invalid.
 */
export function getNodeId(nodeOrEndpoint: unknown): string {
  if (!nodeOrEndpoint) return '';
  if (typeof nodeOrEndpoint === 'string') return nodeOrEndpoint;
  if (typeof nodeOrEndpoint === 'object' && nodeOrEndpoint !== null && 'id' in nodeOrEndpoint) {
    const idVal = (nodeOrEndpoint as { id?: unknown }).id;
    if (idVal === null || idVal === undefined) return '';
    return String(idVal);
  }
  return '';
}

/**
 * Normalizes link endpoints into resolved string IDs.
 */
export function getLinkEndpoints(link: FamilyLink): { sourceId: string; targetId: string } {
  return {
    sourceId: getNodeId(link?.source),
    targetId: getNodeId(link?.target),
  };
}

/**
 * Checks if two nodes are directly connected by a link of a given type (or any type if omitted).
 */
export function isDirectlyLinked(
  links: readonly FamilyLink[],
  aId: string,
  bId: string,
  type?: FamilyLink['type']
): boolean {
  if (!links || !Array.isArray(links) || !aId || !bId) return false;
  return links.some(link => {
    if (type !== undefined && link.type !== type) return false;
    const { sourceId, targetId } = getLinkEndpoints(link);
    return (sourceId === aId && targetId === bId) || (sourceId === bId && targetId === aId);
  });
}

/**
 * Returns the parent IDs for a given node.
 */
export function getParents(nodeId: string, links: readonly FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const parentIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'parent') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (targetId === nodeId && sourceId) {
        parentIds.add(sourceId);
      }
    }
  });
  return Array.from(parentIds);
}

/**
 * Returns the child IDs for a given node.
 */
export function getChildren(nodeId: string, links: readonly FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const childIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'parent') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (sourceId === nodeId && targetId) {
        childIds.add(targetId);
      }
    }
  });
  return Array.from(childIds);
}

/**
 * Returns the spouse IDs (marriage or divorce) for a given node.
 */
export function getSpouses(nodeId: string, links: readonly FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const spouseIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'marriage' || link.type === 'divorce') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (sourceId === nodeId && targetId && targetId !== nodeId) {
        spouseIds.add(targetId);
      } else if (targetId === nodeId && sourceId && sourceId !== nodeId) {
        spouseIds.add(sourceId);
      }
    }
  });
  return Array.from(spouseIds);
}

/**
 * Returns the sibling IDs (sharing at least one parent) for a given node.
 */
export function getSiblings(nodeId: string, links: readonly FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const parents = getParents(nodeId, links);
  const siblingIds = new Set<string>();
  parents.forEach(parentId => {
    const children = getChildren(parentId, links);
    children.forEach(childId => {
      if (childId !== nodeId) {
        siblingIds.add(childId);
      }
    });
  });
  return Array.from(siblingIds);
}

/** 1-Degree Kinship category for immediate network */
export type KinshipDegree1Category = RelativeDirection;

export interface Degree1Relative {
  nodeId: string;
  relationship: KinshipDegree1Category;
  /** True for blended family connections (stepparent, stepchild, co-parent) */
  isBlended?: boolean;
}

/**
 * Computes all 1-degree relatives for an anchor node:
 * - Direct parents and stepparents (parent's spouse) -> 'parent'
 * - Direct children and stepchildren (spouse's child) -> 'child'
 * - Direct spouses and co-parents (child's other parent) -> 'spouse'
 * - Siblings (shared parent) -> 'sibling'
 */
export function get1DegreeRelatives(
  anchorNodeId: string,
  links: readonly FamilyLink[]
): Degree1Relative[] {
  if (!anchorNodeId || !links || !Array.isArray(links)) return [];

  const relativesMap = new Map<string, Degree1Relative>();

  // 1. Direct parents
  const parents = getParents(anchorNodeId, links);
  parents.forEach(pId => {
    if (pId !== anchorNodeId) {
      relativesMap.set(pId, { nodeId: pId, relationship: 'parent', isBlended: false });
    }
  });

  // 2. Direct children
  const children = getChildren(anchorNodeId, links);
  children.forEach(cId => {
    if (cId !== anchorNodeId && !relativesMap.has(cId)) {
      relativesMap.set(cId, { nodeId: cId, relationship: 'child', isBlended: false });
    }
  });

  // 3. Direct spouses (marriage or divorce)
  const spouses = getSpouses(anchorNodeId, links);
  spouses.forEach(sId => {
    if (sId !== anchorNodeId && !relativesMap.has(sId)) {
      relativesMap.set(sId, { nodeId: sId, relationship: 'spouse', isBlended: false });
    }
  });

  // 4. Siblings (sharing at least one parent)
  const siblings = getSiblings(anchorNodeId, links);
  siblings.forEach(sibId => {
    if (sibId !== anchorNodeId && !relativesMap.has(sibId)) {
      relativesMap.set(sibId, { nodeId: sibId, relationship: 'sibling', isBlended: false });
    }
  });

  // 5. Stepparents (parent's spouse)
  parents.forEach(pId => {
    const parentSpouses = getSpouses(pId, links);
    parentSpouses.forEach(psId => {
      if (psId !== anchorNodeId && !relativesMap.has(psId)) {
        relativesMap.set(psId, { nodeId: psId, relationship: 'parent', isBlended: true });
      }
    });
  });

  // 6. Stepchildren (spouse's child)
  spouses.forEach(sId => {
    const spouseChildren = getChildren(sId, links);
    spouseChildren.forEach(scId => {
      if (scId !== anchorNodeId && !relativesMap.has(scId)) {
        relativesMap.set(scId, { nodeId: scId, relationship: 'child', isBlended: true });
      }
    });
  });

  // 7. Co-parents (child's other parent)
  children.forEach(cId => {
    const childParents = getParents(cId, links);
    childParents.forEach(cpId => {
      if (cpId !== anchorNodeId && !relativesMap.has(cpId)) {
        relativesMap.set(cpId, { nodeId: cpId, relationship: 'spouse', isBlended: true });
      }
    });
  });

  return Array.from(relativesMap.values());
}

/**
 * Returns the set of node IDs in the anchor's 1-degree network (including the anchor).
 */
export function get1DegreeNodeIds(
  anchorNodeId: string | null | undefined,
  links: readonly FamilyLink[]
): string[] {
  if (!anchorNodeId || !links || !Array.isArray(links)) return [];
  const relatives = get1DegreeRelatives(anchorNodeId, links);
  const ids = new Set<string>([anchorNodeId, ...relatives.map(r => r.nodeId)]);
  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Relatives beyond one hop, and the Kinship Path between two Persons.
//
// Everything below reads the Kinship Links once into an index (one pass), then
// walks the index. A call on a 1,000-Person Tree Record costs one pass over the
// links plus the walk, so it is fast enough to answer a chat message.
// ---------------------------------------------------------------------------

/** One hop from a Person along a Kinship Link, keeping the link it used. */
interface KinshipHop {
  personId: string;
  link: FamilyLink;
}

interface KinshipAdjacency {
  parents: KinshipHop[];
  children: KinshipHop[];
  /** Both `marriage` and `divorce` links; read `link.type` to tell them apart. */
  spouses: KinshipHop[];
}

type KinshipIndex = Map<string, KinshipAdjacency>;

const EMPTY_ADJACENCY: KinshipAdjacency = { parents: [], children: [], spouses: [] };

function buildKinshipIndex(links: readonly FamilyLink[]): KinshipIndex {
  const index: KinshipIndex = new Map();
  if (!links || !Array.isArray(links)) return index;
  const entry = (id: string): KinshipAdjacency => {
    let adjacency = index.get(id);
    if (!adjacency) {
      adjacency = { parents: [], children: [], spouses: [] };
      index.set(id, adjacency);
    }
    return adjacency;
  };
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (link.type === 'parent') {
      entry(sourceId).children.push({ personId: targetId, link });
      entry(targetId).parents.push({ personId: sourceId, link });
    } else if (link.type === 'marriage' || link.type === 'divorce') {
      entry(sourceId).spouses.push({ personId: targetId, link });
      entry(targetId).spouses.push({ personId: sourceId, link });
    }
  }
  return index;
}

function adjacencyOf(index: KinshipIndex, personId: string): KinshipAdjacency {
  return index.get(personId) ?? EMPTY_ADJACENCY;
}

/** Which parent a relative is reached through. `both` is the same as no filter. */
export type KinshipSide = 'mother' | 'father' | 'both';

/**
 * Gender as far as the Tree Record can tell: the Person's own gender, or else
 * `parent_role` on a Kinship Link where the Person is the parent.
 */
export type RecordedGender = PersonGender;

/** The Persons whose own gender is read first; only `id` and `gender` are used. */
export type GenderedPersons = readonly Pick<FamilyNode, 'id' | 'gender'>[];

export type RelativeKind =
  | 'parents'
  | 'children'
  | 'siblings'
  | 'spouses'
  | 'grandparents'
  | 'grandchildren'
  | 'auntsAndUncles'
  | 'cousins'
  | 'niecesAndNephews'
  | 'inLaws'
  | 'ancestors'
  | 'descendants';

export interface RelativeFilter {
  /**
   * Keep only relatives reached through the Person's mother or father. Applies
   * to the kinds that start with a step up to a parent (parents, siblings,
   * grandparents, aunts and uncles, cousins, nieces and nephews, ancestors).
   * The other kinds ignore it. A parent link with no `parent_role` is on
   * neither side.
   */
  side?: KinshipSide;
  /**
   * Keep only relatives the record shows as female or male. A Person whose
   * gender the record cannot tell is left out when this is set.
   */
  gender?: RecordedGender;
  /**
   * The Persons of the Tree Record, so `gender` reads each relative's own
   * gender before falling back to `parent_role`.
   */
  persons?: GenderedPersons;
}

function parentIds(index: KinshipIndex, personId: string, side?: KinshipSide): string[] {
  const hops = adjacencyOf(index, personId).parents;
  const kept = side && side !== 'both' ? hops.filter(h => h.link.parentRole === side) : hops;
  return kept.map(h => h.personId);
}

function childIds(index: KinshipIndex, personId: string): string[] {
  return adjacencyOf(index, personId).children.map(h => h.personId);
}

function currentSpouseIds(index: KinshipIndex, personId: string): string[] {
  return adjacencyOf(index, personId)
    .spouses.filter(h => h.link.type === 'marriage')
    .map(h => h.personId);
}

function siblingIds(index: KinshipIndex, personId: string, side?: KinshipSide): string[] {
  return parentIds(index, personId, side)
    .flatMap(parentId => childIds(index, parentId))
    .filter(id => id !== personId);
}

/** Every Person reached by repeating `next` from `startIds`, nearest first. */
function walkAll(startIds: string[], next: (personId: string) => string[]): string[] {
  const seen = new Set<string>(startIds);
  const queue = [...seen];
  for (let i = 0; i < queue.length; i++) {
    for (const id of next(queue[i])) {
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return queue;
}

function recordedGender(index: KinshipIndex, personId: string): RecordedGender | null {
  for (const hop of adjacencyOf(index, personId).children) {
    if (hop.link.parentRole === 'mother') return 'female';
    if (hop.link.parentRole === 'father') return 'male';
  }
  return null;
}

/** Reads each Person's own gender first, then `parent_role` where they are a parent. */
function genderReader(index: KinshipIndex, persons: GenderedPersons | undefined): (personId: string) => RecordedGender | null {
  const byId = new Map<string, RecordedGender>();
  for (const person of persons ?? []) {
    if (person.gender) byId.set(person.id, person.gender);
  }
  return personId => byId.get(personId) ?? recordedGender(index, personId);
}

/**
 * The gender of a Person as far as the Tree Record can tell: the Person's own
 * gender when `persons` has one, or else `parent_role` on a Kinship Link where
 * the Person is the parent (a Person recorded before genders were). Returns
 * `null` when neither says.
 */
export function getRecordedGender(
  personId: string,
  links: readonly FamilyLink[],
  persons?: GenderedPersons
): RecordedGender | null {
  return genderReader(buildKinshipIndex(links), persons)(personId);
}

/**
 * Lists the relatives of one Person, by kind. Returns Person ids with no
 * duplicates and never the Person themself; the order is not meaningful.
 *
 * - `spouses` are current marriages only (a `divorce` link is a former spouse).
 * - `siblings` share at least one parent, so half-siblings are included.
 * - `auntsAndUncles` are the siblings of a parent (not their spouses).
 * - `cousins` are first cousins: the children of aunts and uncles.
 * - `niecesAndNephews` are the children of siblings.
 * - `inLaws` are the parents and siblings of a current spouse, and the current
 *   spouses of siblings and of children.
 */
export function getRelatives(
  personId: string,
  kind: RelativeKind,
  links: readonly FamilyLink[],
  filter: RelativeFilter = {}
): string[] {
  if (!personId) return [];
  const index = buildKinshipIndex(links);
  const { side, gender, persons } = filter ?? {};
  const parents = (id: string) => parentIds(index, id);
  const children = (id: string) => childIds(index, id);
  const spouses = (id: string) => currentSpouseIds(index, id);

  // No `default` and no initial value: a RelativeKind with no case stops compiling.
  let found: string[];
  switch (kind) {
    case 'parents':
      found = parentIds(index, personId, side);
      break;
    case 'children':
      found = children(personId);
      break;
    case 'siblings':
      found = siblingIds(index, personId, side);
      break;
    case 'spouses':
      found = spouses(personId);
      break;
    case 'grandparents':
      found = parentIds(index, personId, side).flatMap(parents);
      break;
    case 'grandchildren':
      found = children(personId).flatMap(children);
      break;
    case 'auntsAndUncles':
    case 'cousins': {
      const ownParents = new Set(parents(personId));
      const auntsAndUncles = parentIds(index, personId, side)
        .flatMap(parentId => siblingIds(index, parentId))
        .filter(id => !ownParents.has(id));
      found = kind === 'cousins' ? auntsAndUncles.flatMap(children) : auntsAndUncles;
      break;
    }
    case 'niecesAndNephews':
      found = siblingIds(index, personId, side).flatMap(children);
      break;
    case 'inLaws': {
      const ownSpouses = spouses(personId);
      found = [
        ...ownSpouses.flatMap(parents),
        ...ownSpouses.flatMap(spouseId => siblingIds(index, spouseId)),
        ...siblingIds(index, personId).flatMap(spouses),
        ...children(personId).flatMap(spouses),
      ];
      break;
    }
    case 'ancestors':
      found = walkAll(parentIds(index, personId, side), parents);
      break;
    case 'descendants':
      found = walkAll(children(personId), children);
      break;
  }

  // `found` is unset only when a caller passes a kind the types do not allow.
  const unique = new Set(found ?? []);
  unique.delete(personId);
  const result = Array.from(unique);
  if (!gender) return result;
  const genderOf = genderReader(index, persons);
  return result.filter(id => genderOf(id) === gender);
}

/**
 * The former spouses of one Person: the other end of each `divorce` link.
 * `getRelatives(…, 'spouses')` lists current marriages only.
 */
export function getFormerSpouses(personId: string, links: readonly FamilyLink[]): string[] {
  if (!personId) return [];
  const former = adjacencyOf(buildKinshipIndex(links), personId)
    .spouses.filter(h => h.link.type === 'divorce')
    .map(h => h.personId);
  return Array.from(new Set(former)).filter(id => id !== personId);
}

// ---------------------------------------------------------------------------
// Kinship Path
// ---------------------------------------------------------------------------

/**
 * How one step of a Kinship Path moves: up to a parent, down to a child, or
 * across to a spouse (`marriage` link) or a former spouse (`divorce` link).
 */
export type KinshipStepKind = 'parent' | 'child' | 'spouse' | 'formerSpouse';

/** One Kinship Link of a Kinship Path, read in the direction of travel. */
export interface KinshipPathStep {
  fromId: string;
  toId: string;
  /** What `toId` is to `fromId`. */
  kind: KinshipStepKind;
  /** The Kinship Link itself, as it was passed in. */
  link: FamilyLink;
}

export type KinshipRelationName =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'half-sibling'
  | 'spouse'
  | 'former spouse'
  | 'grandparent'
  | 'grandchild'
  | 'aunt or uncle'
  | 'niece or nephew'
  | 'cousin'
  | 'in-law'
  | 'step-parent'
  | 'step-child'
  /** Any other step-relation: step-sibling, step-grandchild, step-nephew. */
  | 'step-relative'
  /** No one word fits: two Kinship Terms joined by one Person, in `via`. */
  | 'two terms'
  /**
   * The last resort when not even two terms fit: the fewest Kinship Terms
   * joined at Persons on the path ("wife Rana's brother Sami's sister-in-law").
   * `via.second` is itself joined terms or two terms.
   */
  | 'joined terms';

/**
 * The Kinship Term (GLOSSARY.md) for a Kinship Path: what the last Person is to
 * the first. `label` is the neutral word; `genderedLabel` in `kinshipTerm.ts`
 * gives the gendered one.
 */
export interface KinshipRelation {
  name: KinshipRelationName;
  /**
   * The neutral term in full, for example `great-aunt or great-uncle`,
   * `first cousin once removed` or `parent-in-law`. It does not include the
   * side.
   */
  label: string;
  /**
   * Set when the path starts through the first Person's mother or father, for
   * an ancestor, an aunt or uncle, a cousin or a half-sibling.
   */
  side?: 'mother' | 'father';
  /** For `cousin`: 1 is a first cousin, 2 a second cousin. */
  cousinDegree?: number;
  /** For `cousin`: 1 is "once removed". */
  timesRemoved?: number;
  /** For a parent-, sibling- or child-in-law: what the Person would be without the marriage in the chain. */
  inLaw?: 'parent' | 'sibling' | 'child';
  /**
   * For `two terms`: the Person the two terms meet at, what they are to the
   * first Person, and what the last Person is to them. "Issa is your sister
   * May's stepson" has May as `personId`, sibling `first` and step-child `second`.
   * For `joined terms`, `second` holds the rest of the terms the same way.
   */
  via?: { personId: string; first: KinshipRelation; second: KinshipRelation };
}

/**
 * - `blood`: up to a shared ancestor and down again, with no marriage.
 * - `marriage`: goes through at least one `marriage` or `divorce` link.
 * - `other`: neither; the two Persons are joined only through a shared child.
 */
export type KinshipPathKind = 'blood' | 'marriage' | 'other';

export interface KinshipPath {
  kind: KinshipPathKind;
  /** Every Person on the path, from the first to the last. */
  personIds: string[];
  /** The chain of Kinship Links, in order. `steps.length` is `personIds.length - 1`. */
  steps: KinshipPathStep[];
  /** The Kinship Term for the path, always set. */
  relation: KinshipRelation;
}

interface AncestorEntry {
  depth: number;
  /** The hop that reached this ancestor, from the Person one generation below. */
  via: { childId: string; link: FamilyLink } | null;
}

/** The Person and all their ancestors, nearest first, each with its depth. */
function ancestorsWithDepth(index: KinshipIndex, startId: string): Map<string, AncestorEntry> {
  const found = new Map<string, AncestorEntry>([[startId, { depth: 0, via: null }]]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i++) {
    const childId = queue[i];
    const depth = (found.get(childId) as AncestorEntry).depth + 1;
    for (const hop of adjacencyOf(index, childId).parents) {
      if (found.has(hop.personId)) continue;
      found.set(hop.personId, { depth, via: { childId, link: hop.link } });
      queue.push(hop.personId);
    }
  }
  return found;
}

/** The shortest chain up from `fromId` to a shared ancestor and down to `toId`. */
function findBloodSteps(index: KinshipIndex, fromId: string, toId: string): KinshipPathStep[] | null {
  const above = ancestorsWithDepth(index, fromId);
  const aboveTo = ancestorsWithDepth(index, toId);

  let sharedId: string | null = null;
  let shortest = Infinity;
  for (const [ancestorId, entry] of above) {
    const other = aboveTo.get(ancestorId);
    if (other && entry.depth + other.depth < shortest) {
      sharedId = ancestorId;
      shortest = entry.depth + other.depth;
    }
  }
  if (sharedId === null) return null;

  const up: KinshipPathStep[] = [];
  for (let id = sharedId, via = above.get(id)?.via; via; id = via.childId, via = above.get(id)?.via) {
    up.unshift({ fromId: via.childId, toId: id, kind: 'parent', link: via.link });
  }
  const down: KinshipPathStep[] = [];
  for (let id = sharedId, via = aboveTo.get(id)?.via; via; id = via.childId, via = aboveTo.get(id)?.via) {
    down.push({ fromId: id, toId: via.childId, kind: 'child', link: via.link });
  }
  return [...up, ...down];
}

/** One step along `link`, read from `fromId` to `toId`. */
function stepAlong(link: FamilyLink, fromId: string, toId: string): KinshipPathStep {
  let kind: KinshipStepKind;
  if (link.type === 'parent') kind = getLinkEndpoints(link).sourceId === toId ? 'parent' : 'child';
  else kind = link.type === 'divorce' ? 'formerSpouse' : 'spouse';
  return { fromId, toId, kind, link };
}

/**
 * The shortest chain from `fromId` to `toId` over `parent` links only, up and
 * down in any order. A plain breadth-first search is complete here: with no
 * rule beyond "follow a parent link", the shortest walk never repeats a Person.
 */
function findParentLinkSteps(index: KinshipIndex, fromId: string, toId: string): KinshipPathStep[] | null {
  const reachedBy = new Map<string, KinshipPathStep | null>([[fromId, null]]);
  const queue = [fromId];
  for (let i = 0; i < queue.length && !reachedBy.has(toId); i++) {
    const personId = queue[i];
    const adjacency = adjacencyOf(index, personId);
    for (const hop of [...adjacency.parents, ...adjacency.children]) {
      if (reachedBy.has(hop.personId)) continue;
      reachedBy.set(hop.personId, stepAlong(hop.link, personId, hop.personId));
      queue.push(hop.personId);
    }
  }
  if (!reachedBy.has(toId)) return null;
  const steps: KinshipPathStep[] = [];
  for (let step = reachedBy.get(toId); step; step = reachedBy.get(step.fromId)) steps.unshift(step);
  return steps;
}

/** How many Kinship Links, of any kind, each Person is from `startId`. */
function linkDistances(index: KinshipIndex, startId: string): Map<string, number> {
  const distance = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i++) {
    const adjacency = adjacencyOf(index, queue[i]);
    const next = (distance.get(queue[i]) as number) + 1;
    for (const hops of [adjacency.parents, adjacency.spouses, adjacency.children]) {
      for (const hop of hops) {
        if (distance.has(hop.personId)) continue;
        distance.set(hop.personId, next);
        queue.push(hop.personId);
      }
    }
  }
  return distance;
}

/**
 * Answers, for one `marriage` or `divorce` link at a time: what is the shortest
 * Kinship Path from `fromId` to `toId` that goes through this link?
 *
 * Such a path is two chains that share no Person: one from an end of the link
 * to `fromId`, and one from the other end of the link to `toId`. "Two chains
 * that share no Person, as short as possible together" is a minimum-cost flow
 * of two units where each Person can carry one unit, and that is solved
 * exactly by finding the cheapest augmenting chain twice. A search that marks
 * a Person as visited cannot do this: whether a walk may go on from a Person
 * depends on every Person already on the walk, not only on the Person.
 *
 * The network: Person `i` is node `2i` (in) and `2i + 1` (out), joined by an
 * arc that one unit can use. Every Kinship Link is an arc each way, at cost 1.
 * `fromId` and `toId` each lead to the sink. Arc `k` and arc `k ^ 1` are one
 * arc and its reverse.
 */
function pathThroughLinkFinder(
  index: KinshipIndex,
  fromId: string,
  toId: string
): (link: FamilyLink, aId: string, bId: string) => KinshipPathStep[] | null {
  const personIds = Array.from(index.keys());
  const numberOf = new Map(personIds.map((id, i) => [id, i] as const));
  const source = personIds.length * 2;
  const sink = source + 1;
  const arcsFrom: number[][] = Array.from({ length: sink + 1 }, () => []);
  const arcTo: number[] = [];
  const arcCost: number[] = [];
  const arcLink: Array<FamilyLink | null> = [];
  const addArc = (from: number, to: number, cost: number, link: FamilyLink | null): number => {
    arcsFrom[from].push(arcTo.length);
    arcTo.push(to);
    arcCost.push(cost);
    arcLink.push(link);
    arcsFrom[to].push(arcTo.length);
    arcTo.push(from);
    arcCost.push(-cost);
    arcLink.push(link);
    return arcTo.length - 2;
  };
  personIds.forEach((personId, i) => {
    addArc(2 * i, 2 * i + 1, 0, null);
    const adjacency = adjacencyOf(index, personId);
    for (const hops of [adjacency.parents, adjacency.spouses, adjacency.children]) {
      for (const hop of hops) addArc(2 * i + 1, 2 * (numberOf.get(hop.personId) as number), 1, hop.link);
    }
  });
  addArc(2 * (numberOf.get(fromId) as number) + 1, sink, 0, null);
  addArc(2 * (numberOf.get(toId) as number) + 1, sink, 0, null);
  // The source leads to the two ends of the link in question; set on each call.
  const sourceArcs = [addArc(source, 0, 0, null), addArc(source, 0, 0, null)];
  const room: number[] = new Array(arcTo.length);

  /** Sends one more unit from the source to the sink along the cheapest chain. */
  const sendOneUnit = (): boolean => {
    const cost: number[] = new Array(sink + 1).fill(Infinity);
    const arcInto: number[] = new Array(sink + 1).fill(-1);
    const queued: boolean[] = new Array(sink + 1).fill(false);
    cost[source] = 0;
    const queue = [source];
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      queued[node] = false;
      for (const arc of arcsFrom[node]) {
        const to = arcTo[arc];
        if (room[arc] === 0 || cost[node] + arcCost[arc] >= cost[to]) continue;
        cost[to] = cost[node] + arcCost[arc];
        arcInto[to] = arc;
        if (!queued[to]) {
          queued[to] = true;
          queue.push(to);
        }
      }
    }
    if (arcInto[sink] === -1) return false;
    for (let node = sink; node !== source; node = arcTo[arcInto[node] ^ 1]) {
      room[arcInto[node]] -= 1;
      room[arcInto[node] ^ 1] += 1;
    }
    return true;
  };

  /** The chain the flow takes from a Person until it leaves for the sink. */
  const chainFrom = (startId: string): KinshipPathStep[] => {
    const steps: KinshipPathStep[] = [];
    for (let personId = startId; ; ) {
      const out = 2 * (numberOf.get(personId) as number) + 1;
      // Even arcs are the forward ones; a forward arc with no room left is in use.
      const used = arcsFrom[out].find(arc => arc % 2 === 0 && room[arc] === 0);
      if (used === undefined || arcTo[used] === sink) return steps;
      const nextId = personIds[arcTo[used] >> 1];
      steps.push(stepAlong(arcLink[used] as FamilyLink, personId, nextId));
      personId = nextId;
    }
  };

  return (link, aId, bId) => {
    for (let arc = 0; arc < room.length; arc++) room[arc] = arc % 2 === 0 ? 1 : 0;
    [aId, bId].forEach((endId, n) => {
      const into = 2 * (numberOf.get(endId) as number);
      // Move the source arc, and its reverse, onto this end of the link.
      const old = arcTo[sourceArcs[n]];
      arcsFrom[old].splice(arcsFrom[old].indexOf(sourceArcs[n] ^ 1), 1);
      arcsFrom[into].push(sourceArcs[n] ^ 1);
      arcTo[sourceArcs[n]] = into;
    });
    if (!sendOneUnit() || !sendOneUnit()) return null;

    const fromA = chainFrom(aId);
    const fromB = chainFrom(bId);
    const endOfA = fromA.length > 0 ? fromA[fromA.length - 1].toId : aId;
    // One chain ends at `fromId`: walk it backwards, cross the link, walk the other.
    const [toStart, startEndId, otherEndId, toEnd] =
      endOfA === fromId ? [fromA, aId, bId, fromB] : [fromB, bId, aId, fromA];
    return [
      ...toStart.map(step => stepAlong(step.link, step.toId, step.fromId)).reverse(),
      stepAlong(link, startEndId, otherEndId),
      ...toEnd,
    ];
  };
}

/**
 * The shortest Kinship Path from `fromId` to `toId` that goes through at least
 * one `marriage` or `divorce` link and is no longer than `maxLength`, or `null`.
 *
 * Every marriage or divorce link is a candidate for the path to go through.
 * Each gets a floor first: no path through it can be shorter than the shortest
 * walks to and from its two ends. The candidates are then solved exactly,
 * lowest floor first, and the search stops as soon as the best path found is
 * no longer than the next floor. So the result is the shortest for every shape
 * of tree, and in the usual tree only one candidate is solved.
 */
function findMarriageSteps(
  index: KinshipIndex,
  fromId: string,
  toId: string,
  maxLength: number
): KinshipPathStep[] | null {
  const fromStart = linkDistances(index, fromId);
  if (!fromStart.has(toId)) return null;
  const fromEnd = linkDistances(index, toId);

  const candidates: Array<{ link: FamilyLink; aId: string; bId: string; floor: number }> = [];
  for (const [aId, adjacency] of index) {
    const aFromStart = fromStart.get(aId);
    const aFromEnd = fromEnd.get(aId);
    if (aFromStart === undefined || aFromEnd === undefined) continue;
    for (const hop of adjacency.spouses) {
      // Each link is in the index twice, once for each end; take it once.
      if (getLinkEndpoints(hop.link).sourceId !== aId) continue;
      const bId = hop.personId;
      const floor =
        1 +
        Math.min(
          aFromStart + (fromEnd.get(bId) as number),
          (fromStart.get(bId) as number) + aFromEnd
        );
      if (floor <= maxLength) candidates.push({ link: hop.link, aId, bId, floor });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.floor - y.floor);

  const pathThrough = pathThroughLinkFinder(index, fromId, toId);
  let best: KinshipPathStep[] | null = null;
  for (const { link, aId, bId, floor } of candidates) {
    if (best && best.length <= floor) break;
    const steps = pathThrough(link, aId, bId);
    if (steps && steps.length <= maxLength && (!best || steps.length < best.length)) best = steps;
  }
  return best;
}

/** How many steps up to a parent, then down to a child: a blood shape. `null` for any other order. */
function bloodShape(steps: readonly KinshipPathStep[]): { up: number; down: number } | null {
  let up = 0;
  while (up < steps.length && steps[up].kind === 'parent') up++;
  for (let i = up; i < steps.length; i++) if (steps[i].kind !== 'child') return null;
  return { up, down: steps.length - up };
}

/** Ancestors, aunts and uncles and cousins have a side; siblings, nieces and descendants do not. */
const takesSide = (up: number, down: number) => up >= 1 && (down === 0 || up >= 2);

const isAcross = (step: KinshipPathStep) => step.kind === 'spouse' || step.kind === 'formerSpouse';

function bloodName(up: number, down: number): KinshipRelationName {
  if (down === 0) return up === 1 ? 'parent' : 'grandparent';
  if (up === 0) return down === 1 ? 'child' : 'grandchild';
  if (up === 1) return down === 1 ? 'sibling' : 'niece or nephew';
  return down === 1 ? 'aunt or uncle' : 'cousin';
}

function bloodTerm(index: KinshipIndex, steps: readonly KinshipPathStep[], up: number, down: number): KinshipRelation {
  if (up === 1 && down === 1) {
    // Half-siblings only when the record shows a second, different parent for each.
    const fromParents = Array.from(new Set(parentIds(index, steps[0].fromId)));
    const toParents = new Set(parentIds(index, steps[1].toId));
    const shared = fromParents.filter(id => toParents.has(id)).length;
    const isHalf = shared === 1 && fromParents.length >= 2 && toParents.size >= 2;
    return isHalf ? { name: 'half-sibling', label: 'half-sibling' } : { name: 'sibling', label: 'sibling' };
  }
  const name = bloodName(up, down);
  const label = bloodLabel(up, down);
  if (name !== 'cousin') return { name, label };
  return { name, label, cousinDegree: Math.min(up, down) - 1, timesRemoved: Math.abs(up - down) };
}

/**
 * A step-relation: the chain goes through a marriage to a spouse's child who
 * is not one's own child (a step-child), or to a parent's spouse who is not
 * one's own parent (a step-parent). Counting that step as a child or a parent
 * leaves a blood shape, which names the term: a sibling's spouse's child is a
 * step-nephew, a spouse's grandchild a step-grandchild.
 */
function stepTerm(
  index: KinshipIndex,
  before: readonly KinshipPathStep[],
  marriage: KinshipPathStep,
  after: readonly KinshipPathStep[]
): { up: number; down: number; relation: KinshipRelation } | null {
  const beforeShape = bloodShape(before);
  const afterShape = bloodShape(after);
  if (!beforeShape || !afterShape) return null;
  let up: number;
  let down: number;
  if (after.length > 0 && afterShape.up === 0 && !childIds(index, marriage.fromId).includes(after[0].toId)) {
    up = beforeShape.up;
    down = beforeShape.down + afterShape.down;
  } else if (
    before.length > 0 &&
    beforeShape.down === 0 &&
    !parentIds(index, before[before.length - 1].fromId).includes(marriage.toId)
  ) {
    up = beforeShape.up + afterShape.up;
    down = afterShape.down;
  } else {
    return null;
  }
  // Past a first cousin, "step-" is not said.
  if (up >= 2 && down >= 2 && (up > 2 || down > 2)) return null;
  const blood = up === 2 && down === 2 ? 'cousin' : bloodLabel(up, down);
  const name: KinshipRelationName =
    up === 1 && down === 0 ? 'step-parent' : up === 0 && down === 1 ? 'step-child' : 'step-relative';
  return { up, down, relation: { name, label: eachWord(blood, word => `step-${word}`) } };
}

/**
 * An in-law: a spouse's blood relative (mother-in-law, brother-in-law), or a
 * blood relative's spouse (son-in-law, sister-in-law, "aunt by marriage").
 */
function inLawTerm(
  before: readonly KinshipPathStep[],
  after: readonly KinshipPathStep[]
): { up: number; down: number; relation: KinshipRelation } | null {
  // The marriage is at one end of the chain, and the rest is blood.
  if (before.length > 0 && after.length > 0) return null;
  const spouseFirst = before.length === 0;
  const shape = bloodShape(spouseFirst ? after : before);
  if (!shape) return null;
  const { up, down } = shape;
  // A spouse's descendant is a step-relation, an ancestor's spouse too: not in-laws.
  if (spouseFirst ? up === 0 : down === 0) return null;
  const inLaw = (label: string, of?: KinshipRelation['inLaw']): KinshipRelation =>
    of ? { name: 'in-law', label, inLaw: of } : { name: 'in-law', label };

  let relation: KinshipRelation;
  if (up >= 2 && down >= 2) {
    // "cousin-in-law" for a first cousin; past that, no one word.
    if (up !== 2 || down !== 2) return null;
    relation = inLaw('cousin-in-law');
  } else if (!spouseFirst && up >= 2 && down === 1) {
    relation = inLaw(`${bloodLabel(up, down)} by marriage`);
  } else {
    const of = up === 1 && down === 0 ? 'parent' : up === 1 && down === 1 ? 'sibling' : up === 0 && down === 1 ? 'child' : undefined;
    relation = inLaw(eachWord(bloodLabel(up, down), word => `${word}-in-law`), of);
  }
  // A spouse's relative is on no side of one's own family.
  return spouseFirst ? { up: 0, down: 0, relation } : { up, down, relation };
}

/** One Kinship Term for the whole chain, or `null` when no one word fits. */
function oneTerm(index: KinshipIndex, steps: readonly KinshipPathStep[]): KinshipRelation | null {
  const first = steps[0];
  const firstRole = first.kind === 'parent' ? first.link.parentRole : null;
  const withSide = (relation: KinshipRelation, applies: boolean): KinshipRelation =>
    firstRole && applies ? { ...relation, side: firstRole } : relation;

  const across = steps.findIndex(isAcross);
  if (across === -1) {
    const shape = bloodShape(steps);
    if (!shape) return null;
    const relation = bloodTerm(index, steps, shape.up, shape.down);
    return withSide(relation, relation.name === 'half-sibling' || takesSide(shape.up, shape.down));
  }
  if (steps.length === 1) {
    return first.kind === 'spouse' ? { name: 'spouse', label: 'spouse' } : { name: 'former spouse', label: 'former spouse' };
  }
  // A spouse's sibling's spouse is said to be a sibling-in-law too.
  if (steps.map(step => step.kind).join() === 'spouse,parent,child,spouse') {
    return { name: 'in-law', label: 'sibling-in-law' };
  }
  // Past a divorce, or across two marriages, no one word fits.
  if (steps[across].kind === 'formerSpouse' || steps.slice(across + 1).some(isAcross)) return null;

  const before = steps.slice(0, across);
  const after = steps.slice(across + 1);
  const named = stepTerm(index, before, steps[across], after) ?? inLawTerm(before, after);
  return named && withSide(named.relation, takesSide(named.up, named.down));
}

/**
 * Two Kinship Terms joined by one Person, split at the marriage when there is
 * one: "Issa is your sister May's stepson".
 */
function twoTerms(index: KinshipIndex, steps: readonly KinshipPathStep[]): KinshipRelation | null {
  const across = steps.findIndex(isAcross);
  const splits = new Set([across, across + 1, ...steps.keys()].filter(k => k > 0 && k < steps.length));
  for (const k of splits) {
    const first = oneTerm(index, steps.slice(0, k));
    const second = first && oneTerm(index, steps.slice(k));
    if (first && second) {
      return { name: 'two terms', label: `${first.label}'s ${second.label}`, via: { personId: steps[k].fromId, first, second } };
    }
  }
  return null;
}

/**
 * The fewest Kinship Terms joined at Persons on the chain, for a chain that
 * neither one term nor two fit. Every single step has a term, so this always
 * finds one.
 */
function joinedTerms(index: KinshipIndex, steps: readonly KinshipPathStep[]): KinshipRelation {
  const fewest = new Map<number, { relation: KinshipRelation; count: number }>();
  const from = (start: number): { relation: KinshipRelation; count: number } => {
    const known = fewest.get(start);
    if (known) return known;
    const whole = oneTerm(index, steps.slice(start));
    let best: { relation: KinshipRelation; count: number } | null = whole && { relation: whole, count: 1 };
    for (let k = start + 1; k < steps.length && (!best || best.count > 2); k++) {
      const first = oneTerm(index, steps.slice(start, k));
      if (!first) continue;
      const rest = from(k);
      if (best && rest.count + 1 >= best.count) continue;
      const second = rest.relation;
      best = {
        relation: {
          name: rest.count === 1 ? 'two terms' : 'joined terms',
          label: `${first.label}'s ${second.label}`,
          via: { personId: steps[k].fromId, first, second },
        },
        count: rest.count + 1,
      };
    }
    fewest.set(start, best!);
    return best!;
  };
  return from(0).relation;
}

/** The Kinship Term for a chain of one or more steps. Never `null`. */
function nameSteps(index: KinshipIndex, steps: readonly KinshipPathStep[]): KinshipRelation {
  return oneTerm(index, steps) ?? twoTerms(index, steps) ?? joinedTerms(index, steps);
}

/**
 * Builds the Kinship Term for a Kinship Path: what the last Person is to the
 * first. Blood terms at any depth (great-aunt, third cousin twice removed),
 * in-laws at either end (mother-in-law, son-in-law), step-relations
 * (stepmother, step-grandson, step-nephew); when no one word fits, two terms
 * joined by one Person. Returns `null` only for a path with no steps.
 */
export function nameKinshipPath(
  path: Pick<KinshipPath, 'steps'>,
  links: readonly FamilyLink[]
): KinshipRelation | null {
  return path.steps.length === 0 ? null : nameSteps(buildKinshipIndex(links), path.steps);
}

/**
 * Finds the Kinship Paths from one Person to another. Each path is named as
 * what `toId` is to `fromId`.
 *
 * The result holds, in this order:
 * 1. the shortest blood path, when there is one;
 * 2. the shortest path through a marriage, when there is one and it is not
 *    longer than the blood path (a longer one is only a way round it).
 *
 * When neither exists but the two Persons are still joined (they share a child
 * and no marriage is recorded), the result is that one path, with kind `other`.
 *
 * An empty list means "no path": the two Persons are not connected, one of
 * them is not in the Tree Record, or they are the same Person. It never throws.
 */
export function findKinshipPaths(
  fromId: string,
  toId: string,
  links: readonly FamilyLink[]
): KinshipPath[] {
  if (!fromId || !toId || fromId === toId) return [];
  const index = buildKinshipIndex(links);
  if (!index.has(fromId) || !index.has(toId)) return [];

  const toPath = (kind: KinshipPathKind, steps: KinshipPathStep[]): KinshipPath => ({
    kind,
    personIds: [fromId, ...steps.map(s => s.toId)],
    steps,
    relation: nameSteps(index, steps),
  });

  const paths: KinshipPath[] = [];
  const blood = findBloodSteps(index, fromId, toId);
  if (blood) paths.push(toPath('blood', blood));

  const throughMarriage = findMarriageSteps(index, fromId, toId, blood ? blood.length : Infinity);
  if (throughMarriage) paths.push(toPath('marriage', throughMarriage));

  if (paths.length === 0) {
    const withoutMarriage = findParentLinkSteps(index, fromId, toId);
    if (withoutMarriage) paths.push(toPath('other', withoutMarriage));
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Find a Person by name
// ---------------------------------------------------------------------------

/** One Person a name could mean, with enough to tell them from the others. */
export interface PersonNameMatch {
  personId: string;
  /** "Given name Cluster", as shown on the Tree Node. */
  displayName: string;
  /** The parent recorded with `parent_role` father, or `null` when there is none. */
  fatherId: string | null;
  /**
   * The father's display name, or `null` when no father is recorded (or the
   * father is not among the Persons passed in).
   */
  fatherName: string | null;
}

function nameWords(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Finds every Person a name could mean. A Person matches when each word of
 * `name` is a whole word of their display name (given name and paternal
 * cluster); case and extra spaces do not matter. So `Omar` matches every Omar
 * and `Omar Haddad` only those in the Haddad cluster.
 *
 * Matches come back in the order of `persons`. Each one carries the father's
 * name, so the caller can ask "which one?" when there is more than one.
 */
export function findPersonsByName(
  name: string,
  persons: readonly FamilyNode[],
  links: readonly FamilyLink[]
): PersonNameMatch[] {
  const wanted = nameWords(name ?? '');
  if (wanted.length === 0 || !persons || !Array.isArray(persons)) return [];

  const matches = persons.filter(person => {
    if (!person) return false;
    const words = new Set(nameWords(`${person.firstName ?? ''} ${person.familyCluster ?? ''}`));
    return wanted.every(word => words.has(word));
  });
  if (matches.length === 0) return [];

  const index = buildKinshipIndex(links);
  const byId = new Map(persons.filter(Boolean).map(person => [person.id, person] as const));
  return matches.map(person => {
    const fatherId = parentIds(index, person.id, 'father')[0] ?? null;
    const father = fatherId ? byId.get(fatherId) : undefined;
    return {
      personId: person.id,
      displayName: formatNodeDisplayName(person),
      fatherId,
      fatherName: father ? formatNodeDisplayName(father) : null,
    };
  });
}
