/**
 * Writes the gender list for existing Persons (LIN-76) to
 * /tmp/persons-gender-<dev|prod>.csv, with the columns id, display_name,
 * guessed_gender and source (parent_role | name | none). The owner corrects
 * the guessed_gender column, then runs to-migration.ts on the result.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/person-gender/list.ts dev
 *   SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/person-gender/list.ts prod
 *
 * Reads only: `GET /rest/v1/nodes` and `/rest/v1/links` through the Supabase
 * API. The key comes from $SUPABASE_SERVICE_ROLE_KEY (or .env.local, or
 * $ENV_FILE; scripts/readApiKey.mjs) and is never printed. It may be the
 * project's secret key (sb_secret_…) or a legacy service_role key. A signed-in
 * admin's access token works too: set SUPABASE_ACCESS_TOKEN and the project's
 * publishable key (or legacy anon key) as SUPABASE_ANON_KEY instead.
 */
import { writeFileSync } from 'node:fs';
import { readApiKey, supabaseKeyHeaders } from '../readApiKey.mjs';
import { guessPersonGenders, toCsv, type LinkRowForList, type NodeRowForList } from './personGender';

const PROJECTS = {
  dev: 'djwqamcfllqziqiyvyjj',
  prod: 'henhqxosjbrvwceuvtyk',
} as const;

const env = process.argv[2];
if (env !== 'dev' && env !== 'prod') {
  console.error('Usage: npx vite-node scripts/person-gender/list.ts <dev|prod>');
  process.exit(2);
}

const baseUrl = `https://${PROJECTS[env]}.supabase.co/rest/v1`;

function headers(): Record<string, string> {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return { apikey: readApiKey('SUPABASE_ANON_KEY'), Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` };
  }
  return supabaseKeyHeaders(readApiKey('SUPABASE_SERVICE_ROLE_KEY'));
}

const PAGE = 1000;

/** Every row of a table, a page at a time (PostgREST caps a response). */
async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${baseUrl}/${table}?select=${columns}&order=id.asc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Reading ${table} from ${env} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const nodes = await readAll<NodeRowForList>('nodes', 'id,first_name,paternal_family_cluster');
const links = await readAll<LinkRowForList>('links', 'source_node_id,type,parent_role');
if (nodes.length === 0) {
  throw new Error(`No Persons came back from ${env}. Is the key for this project, and allowed to read nodes?`);
}

const { rows, conflicts } = guessPersonGenders(nodes, links);
const out = `/tmp/persons-gender-${env}.csv`;
writeFileSync(out, toCsv(rows));

const count = (source: string) => rows.filter((r) => r.source === source).length;
console.log(`Wrote ${out}: ${rows.length} Persons from ${env} (${PROJECTS[env]}).`);
console.log(`  from parent_role: ${count('parent_role')}`);
console.log(`  from the name:    ${count('name')}  <- check these`);
console.log(`  blank:            ${count('none')}  <- fill in what you know; blank stays not recorded`);
if (conflicts.length) {
  console.log(`\n${conflicts.length} Persons are a mother on one Kinship Link and a father on another, so they are blank.`);
  console.log('Fix the wrong parent_role in the app before applying the list, or the migration will refuse them:');
  for (const id of conflicts) console.log(`  ${id}  ${rows.find((r) => r.id === id)?.display_name ?? ''}`);
}
