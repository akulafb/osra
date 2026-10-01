/**
 * The one-time fill-in that links each child to both parents (LIN-78, ADR
 * 0012). Calls `fill_in_both_parent_links` (migration 20261001140000, which
 * must be pushed to the project first).
 *
 * Dry run (changes nothing):
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/both-parents/fill-in.ts dev
 *
 * writes two files:
 *
 * - /tmp/both-parents-<env>-will-link.csv: every link the apply would write.
 *   Review it.
 * - /tmp/both-parents-<env>-list.csv: every child linked to one parent that
 *   the fill-in will not guess for (more than one spouse, a divorce, a spouse
 *   with no gender, no spouse), with the linked parent's spouses. Put the other
 *   parent's id in `named_parent_id` where you know it; leave the rest blank.
 *   Then run the dry run again with `--names` to check your answers:
 *
 *   … fill-in.ts dev --names /tmp/both-parents-dev-list.csv
 *
 * Apply (writes the links in /tmp/both-parents-<env>-will-link.csv, exactly):
 *
 *   … fill-in.ts dev --apply [--names /tmp/both-parents-dev-list.csv]
 *
 * The apply runs the dry run again first and stops, writing nothing, unless it
 * would write the same links as the will-link file from your last dry run. So
 * always run the dry run with the same `--names` just before the apply.
 *
 * The key comes from $SUPABASE_SERVICE_ROLE_KEY (or .env.local, or $ENV_FILE;
 * scripts/readApiKey.mjs) and is never printed. A signed-in admin's access token
 * works too: set SUPABASE_ACCESS_TOKEN and the project's anon key as
 * SUPABASE_ANON_KEY instead.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readApiKey } from '../readApiKey.mjs';
import {
  listCsv,
  parseNamesCsv,
  parseWillLinkCsv,
  planDifferences,
  willLinkCsv,
  type FillInResult,
  type ParentChoice,
} from './bothParents';

const PROJECTS = {
  dev: 'djwqamcfllqziqiyvyjj',
  prod: 'henhqxosjbrvwceuvtyk',
} as const;

const USAGE = 'Usage: npx vite-node scripts/both-parents/fill-in.ts <dev|prod> [--apply] [--names <list.csv>]';

const args = process.argv.slice(2);
const env = args[0];
if (env !== 'dev' && env !== 'prod') {
  console.error(USAGE);
  process.exit(2);
}
const project = PROJECTS[env];
const apply = args.includes('--apply');
const namesAt = args.indexOf('--names');
const namesFile = namesAt >= 0 ? args[namesAt + 1] : undefined;
if (namesAt >= 0 && !namesFile) {
  console.error(USAGE);
  process.exit(2);
}

const willLinkFile = `/tmp/both-parents-${env}-will-link.csv`;
const listFile = `/tmp/both-parents-${env}-list.csv`;
const url = `https://${project}.supabase.co/rest/v1/rpc/fill_in_both_parent_links`;

function headers(): Record<string, string> {
  const base = { 'Content-Type': 'application/json' };
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return { ...base, apikey: readApiKey('SUPABASE_ANON_KEY'), Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` };
  }
  const key = readApiKey('SUPABASE_SERVICE_ROLE_KEY');
  return { ...base, apikey: key, Authorization: `Bearer ${key}` };
}

async function fillIn(pApply: boolean, named: ParentChoice[]): Promise<FillInResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_apply: pApply, p_named: named }),
  });
  if (!res.ok) {
    throw new Error(`fill_in_both_parent_links on ${env} failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }
  return (await res.json()) as FillInResult;
}

function report(result: FillInResult): void {
  const { counts } = result;
  console.log(`${env} (${project}):`);
  console.log(`  links to write:          ${counts.will_link}`);
  console.log(`  children on the list:    ${counts.needs_a_name}`);
  console.log(`  children with 2 parents: ${counts.children_with_two_or_more_parents}`);
  if (counts.refused_names > 0) {
    console.log(`\n${counts.refused_names} of your named parents were refused; fix them in ${namesFile}:`);
    for (const row of result.refused_names) {
      console.log(`  ${row.child_name || row.child_id} -> ${row.other_parent_name || row.other_parent_id}: ${row.reason}`);
    }
  }
}

const named = namesFile ? parseNamesCsv(readFileSync(namesFile, 'utf8'), namesFile) : [];
const plan = await fillIn(false, named);

if (!apply) {
  writeFileSync(willLinkFile, willLinkCsv(plan.will_link));
  // A dry run with --names reads the owner's answers from the list file, so it
  // must not overwrite them; the apply reads the same file again.
  if (!namesFile || resolve(namesFile) !== resolve(listFile)) {
    writeFileSync(listFile, listCsv(plan.needs_a_name));
  }
  report(plan);
  console.log(`\nDry run: nothing was written to the Tree Record.`);
  console.log(`  Review:  ${willLinkFile}`);
  console.log(`  Answer:  ${listFile}  (named_parent_id; blank stays one parent)`);
  process.exit(plan.counts.refused_names > 0 ? 1 : 0);
}

if (!existsSync(willLinkFile)) {
  console.error(`No ${willLinkFile}: run the dry run first and review it.`);
  process.exit(1);
}
if (plan.counts.refused_names > 0) {
  report(plan);
  console.error('\nNothing was written.');
  process.exit(1);
}
const differences = planDifferences(parseWillLinkCsv(readFileSync(willLinkFile, 'utf8'), willLinkFile), plan);
if (differences.length > 0) {
  console.error(`The apply would not write what ${willLinkFile} says, so nothing was written:`);
  for (const line of differences) console.error(`  ${line}`);
  console.error('Run the dry run again (with the same --names) and review it.');
  process.exit(1);
}

const result = await fillIn(true, named);
report(result);
console.log(`\nWrote ${result.inserted_link_ids.length} parent Kinship Links to ${env}.`);
