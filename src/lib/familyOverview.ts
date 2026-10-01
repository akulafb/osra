/**
 * A family's overview as counts (LIN-80), for the family chat's open
 * questions: "Tell me about the family", "Explain the Haddad family".
 *
 * The model gets numbers and at most a few names, never a list of its Persons, so
 * an open question costs one short tool result and gets a short answer.
 *
 * A family is the Persons with one paternal family name (`familyCluster`);
 * with no name, it is the whole tree. Within it:
 * - generations: the most Persons in one line of parent and child;
 * - founders: Persons with no parent in the family who have a child in it,
 *   less those who married into it (married to a Person with a parent in it);
 * - branches: the founders' children in the family, each the start of a line.
 */
import type { FamilyLink, FamilyNode } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';
import { formatNodeDisplayName } from '../utils/nodeDisplayName';

export interface FamilyOverview {
  /** The family name as the tree writes it, or null for the whole tree. */
  family: string | null;
  persons: number;
  generations: number;
  /** `names` are the founders with the most descendants, at most `MAX_NAMES`. */
  founders: { total: number; names: string[] };
  branches: number;
  /** The whole tree only: how many family names it has. */
  families?: number;
  /** The whole tree only: the largest families, at most `MAX_NAMES + 2`. */
  largestFamilies?: Array<{ name: string; persons: number }>;
}

const MAX_NAMES = 3;

/**
 * The most a result takes as JSON, whatever the tree: the lists are capped,
 * and a name is cut to `MAX_NAME_CHARS`. A test holds it.
 */
export const MAX_FAMILY_OVERVIEW_CHARS = 800;
const MAX_NAME_CHARS = 60;

const capped = (name: string) => (name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name);

const familyOf = (node: FamilyNode) => (node.familyCluster ?? '').trim();

/** "the Haddad family", "Haddad" and "haddad" all name the Haddad family. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+family$/, '').trim();
}

/**
 * The overview of the family with `familyName`, or of the whole tree when
 * none is given. Null when no Person has that family name.
 */
export function familyOverview(
  record: { nodes: readonly FamilyNode[]; links: readonly FamilyLink[] },
  familyName?: string,
): FamilyOverview | null {
  let persons = record.nodes;
  let family: string | null = null;
  if (familyName !== undefined && normalize(familyName) !== '') {
    const wanted = normalize(familyName);
    const byName = (name: string) => record.nodes.filter((node) => familyOf(node).toLowerCase() === name);
    // "the Haddads" is the Haddad family.
    persons = byName(wanted);
    if (persons.length === 0 && wanted.endsWith('s')) persons = byName(wanted.slice(0, -1));
    if (persons.length === 0) return null;
    family = familyOf(persons[0]);
  }

  const inFamily = new Set(persons.map((node) => node.id));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const addTo = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const link of record.links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    if (!inFamily.has(sourceId) || !inFamily.has(targetId)) continue;
    if (link.type === 'parent') {
      addTo(parentsOf, targetId, sourceId);
      addTo(childrenOf, sourceId, targetId);
    } else {
      addTo(spousesOf, sourceId, targetId);
      addTo(spousesOf, targetId, sourceId);
    }
  }
  const hasParent = (id: string) => (parentsOf.get(id)?.length ?? 0) > 0;

  // The longest line down from each Person, counting the Person; a parent cycle is cut where it closes.
  const longest = new Map<string, number>();
  const longestLineDown = (id: string, onPath: Set<string>): number => {
    const known = longest.get(id);
    if (known !== undefined) return known;
    onPath.add(id);
    let below = 0;
    for (const child of childrenOf.get(id) ?? []) {
      if (!onPath.has(child)) below = Math.max(below, longestLineDown(child, onPath));
    }
    onPath.delete(id);
    longest.set(id, below + 1);
    return below + 1;
  };
  const generations = persons.reduce((most, node) => Math.max(most, longestLineDown(node.id, new Set())), 0);

  const descendants = (id: string): number => {
    const seen = new Set<string>([id]);
    const queue = [id];
    for (let i = 0; i < queue.length; i++) {
      for (const child of childrenOf.get(queue[i]) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }
    return seen.size - 1;
  };
  const founders = persons
    .filter((node) => !hasParent(node.id) && (childrenOf.get(node.id)?.length ?? 0) > 0)
    .filter((node) => !(spousesOf.get(node.id) ?? []).some(hasParent))
    .map((node) => ({ name: formatNodeDisplayName(node), descendants: descendants(node.id), id: node.id }))
    .sort((a, b) => b.descendants - a.descendants || a.name.localeCompare(b.name));
  const branches = new Set(founders.flatMap((founder) => childrenOf.get(founder.id) ?? []));

  const foundersSummary = { total: founders.length, names: founders.slice(0, MAX_NAMES).map((founder) => capped(founder.name)) };
  if (family !== null) {
    return { family, persons: persons.length, generations, founders: foundersSummary, branches: branches.size };
  }

  const sizes = new Map<string, number>();
  for (const node of persons) {
    const name = familyOf(node);
    if (name !== '') sizes.set(name, (sizes.get(name) ?? 0) + 1);
  }
  const largestFamilies = [...sizes]
    .sort(([nameA, sizeA], [nameB, sizeB]) => sizeB - sizeA || nameA.localeCompare(nameB))
    .slice(0, MAX_NAMES + 2)
    .map(([name, size]) => ({ name: capped(name), persons: size }));
  return {
    family: null,
    persons: persons.length,
    families: sizes.size,
    largestFamilies,
    generations,
    founders: foundersSummary,
    branches: branches.size,
  };
}
