// Seeded generator for made-up Persons and Kinship Links, in the row shape of
// `public.nodes` and `public.links`. Names and family names are invented.

export interface NodeRow {
  id: string;
  first_name: string;
  paternal_family_cluster: string | null;
  maternal_family_cluster: string | null;
  gender: 'male' | 'female' | null;
  created_by_user_id: null;
  created_at: string;
}

export interface LinkRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  type: 'parent' | 'marriage';
  parent_role: 'mother' | 'father' | null;
  created_by_user_id: null;
  created_at: string;
}

export interface GeneratedTree {
  nodes: NodeRow[];
  links: LinkRow[];
  generations: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ra', 'ten', 'vu', 'sol', 'dar', 'nel', 'pi', 'zo', 'ber', 'ha', 'qui', 'wen', 'jor'];

export function generateTree(count: number, seed: number, families: number): GeneratedTree {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const clusters = Array.from({ length: families }, (_, i) => `Family ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`);
  const nodes: NodeRow[] = [];
  const links: LinkRow[] = [];
  const started = Date.UTC(2020, 0, 1);
  let serial = 0;

  const uuid = () => {
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
    return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  };
  const makePerson = (gender: 'male' | 'female', paternal: string, maternal: string | null): NodeRow => {
    const name = pick(SYLLABLES) + pick(SYLLABLES) + pick(SYLLABLES);
    const row: NodeRow = {
      id: uuid(),
      first_name: name[0].toUpperCase() + name.slice(1),
      paternal_family_cluster: paternal,
      maternal_family_cluster: maternal,
      gender,
      created_by_user_id: null,
      created_at: new Date(started + serial++ * 1000).toISOString(),
    };
    nodes.push(row);
    return row;
  };
  const link = (source: NodeRow, target: NodeRow, type: 'parent' | 'marriage', parentRole: 'mother' | 'father' | null = null) => {
    links.push({
      id: uuid(),
      source_node_id: source.id,
      target_node_id: target.id,
      type,
      parent_role: parentRole,
      created_by_user_id: null,
      created_at: new Date(started + serial++ * 1000).toISOString(),
    });
  };

  // One founding couple per family; each couple's children marry a Person from
  // another family, so families link up across generations.
  type Couple = { father: NodeRow; mother: NodeRow };
  let couples: Couple[] = clusters.map((cluster, i) => {
    const other = clusters[(i + 1) % families];
    const father = makePerson('male', cluster, null);
    const mother = makePerson('female', other, null);
    link(father, mother, 'marriage');
    return { father, mother };
  });

  let generations = 1;
  while (nodes.length < count && couples.length > 0) {
    const next: Couple[] = [];
    for (const { father, mother } of couples) {
      const kids = 1 + Math.floor(rand() * 4); // 1 to 4 children
      for (let k = 0; k < kids && nodes.length < count; k++) {
        const gender = rand() < 0.5 ? 'male' : 'female';
        const child = makePerson(gender, father.paternal_family_cluster!, mother.paternal_family_cluster);
        link(father, child, 'parent', 'father');
        link(mother, child, 'parent', 'mother');
        if (rand() < 0.85 && nodes.length < count) {
          const spouseCluster = families === 1 ? clusters[0] : pick(clusters.filter((c) => c !== child.paternal_family_cluster));
          const spouse = makePerson(gender === 'male' ? 'female' : 'male', spouseCluster, null);
          link(gender === 'male' ? child : spouse, gender === 'male' ? spouse : child, 'marriage');
          next.push(gender === 'male' ? { father: child, mother: spouse } : { father: spouse, mother: child });
        }
      }
    }
    couples = next;
    generations++;
  }
  return { nodes, links, generations };
}

/** Who a 2D family preset draws: the Persons whose paternal or maternal cluster is the preset (src/lib/filterGraphData.ts). */
export function largestCluster(nodes: readonly NodeRow[]): { name: string; size: number } {
  const sizes = new Map<string, number>();
  for (const n of nodes) {
    const seen = new Set([n.paternal_family_cluster, n.maternal_family_cluster].filter(Boolean) as string[]);
    for (const c of seen) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  }
  const [name, size] = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ['', 0];
  return { name, size };
}
