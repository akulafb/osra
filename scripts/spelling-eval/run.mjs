#!/usr/bin/env node
/**
 * Spelling-match evaluation (LIN-67). Not part of `npm test`: it needs the
 * TypeSafe key and the network, and it costs a little (63 requests).
 *
 *   node scripts/spelling-eval/run.mjs                 # straight to TypeSafe
 *   node scripts/spelling-eval/run.mjs --threshold 0.7
 *   node scripts/spelling-eval/run.mjs --scores        # also list every hit
 *
 * Straight to TypeSafe, it sends the request the Edge Function sends: it
 * imports the function's own request builder, retry and score mapping. The key
 * is read from the environment, or from `TYPESAFE_API_KEY` in `.env.local`.
 *
 * To run it through a deployed function instead, give the function URL and a
 * signed-in user's access token:
 *
 *   SPELLING_MATCHES_URL=https://<ref>.supabase.co/functions/v1/spelling-matches \
 *   SUPABASE_USER_JWT=<access token> SUPABASE_ANON_KEY=<anon key> \
 *   node scripts/spelling-eval/run.mjs
 *
 * Needs Node 22.18 or later (it imports the function's TypeScript directly).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateNames } from './candidates.mjs';
import { TYPESAFE_MODEL } from '../../supabase/functions/spelling-matches/spellingMatches.ts';
import { scoreNames } from '../../supabase/functions/spelling-matches/typeSafe.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Reads one variable from a dotenv file. Tolerates spaces around `=` and quotes. */
function readEnvFile(path, name) {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] !== name) continue;
    return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

const threshold = Number(flag('threshold', '0.5'));
if (!(threshold >= 0 && threshold <= 1)) throw new Error('--threshold must be a number from 0 to 1.');
const xlsxPath = resolve(repoRoot, flag('xlsx', 'Family Tree Bulk Upload.xlsx'));
const showScores = process.argv.includes('--scores');
const functionUrl = process.env.SPELLING_MATCHES_URL;

const evalSet = JSON.parse(readFileSync(resolve(here, 'eval-set.json'), 'utf8'));
const candidates = candidateNames(xlsxPath);

/** typed name → [{ name, score }] for every candidate */
let lookup;
if (functionUrl) {
  const jwt = process.env.SUPABASE_USER_JWT;
  if (!jwt) throw new Error('SPELLING_MATCHES_URL is set, so SUPABASE_USER_JWT is needed too.');
  lookup = async (typedName) => {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(process.env.SUPABASE_ANON_KEY ? { apikey: process.env.SUPABASE_ANON_KEY } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ typedName, names: candidates }),
    });
    if (!res.ok) throw new Error(`function answered ${res.status}: ${await res.text()}`);
    return (await res.json()).scores;
  };
} else {
  const apiKey =
    process.env.TYPESAFE_API_KEY?.trim() ||
    readEnvFile(resolve(repoRoot, '.env.local'), 'TYPESAFE_API_KEY') ||
    (process.env.ENV_FILE && readEnvFile(resolve(process.env.ENV_FILE), 'TYPESAFE_API_KEY'));
  if (!apiKey) {
    throw new Error('No TYPESAFE_API_KEY in the environment, in .env.local, or in $ENV_FILE.');
  }
  lookup = async (typedName) => {
    const outcome = await scoreNames({ typedName, names: candidates }, apiKey);
    if (!outcome.ok) {
      throw new Error(`TypeSafe ${outcome.kind} ${outcome.status ?? ''} ${outcome.detail ?? ''}`);
    }
    return outcome.scores;
  };
}

const lookups = evalSet.cases.flatMap((c) =>
  c.typed.map((typed) => ({ typed, expected: c.expected, notScored: c.notScored ?? [] })),
);

// A few at a time: enough to be quick, few enough not to trip the rate limit.
const results = new Array(lookups.length);
let next = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < lookups.length) {
      const i = next++;
      results[i] = await lookup(lookups[i].typed);
    }
  }),
);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const found = [];
const missed = [];
const extras = [];
lookups.forEach(({ typed, expected, notScored }, i) => {
  const scoreOf = new Map(results[i].map((s) => [s.name, s.score]));
  for (const name of expected) {
    if (!scoreOf.has(name)) throw new Error(`Expected name "${name}" is not a candidate.`);
    (scoreOf.get(name) >= threshold ? found : missed).push({ typed, name, score: scoreOf.get(name) });
  }
  for (const [name, score] of scoreOf) {
    if (score >= threshold && !expected.includes(name) && !notScored.includes(name)) {
      extras.push({ typed, name, score });
    }
  }
});

const line = ({ typed, name, score }) => `  ${typed} → ${name}  (${score.toFixed(2)})`;
const total = found.length + missed.length;

console.log(`Spelling-match evaluation — ${functionUrl ? 'via Edge Function' : 'direct to TypeSafe'}`);
console.log(`model ${TYPESAFE_MODEL}, threshold ≥ ${threshold}`);
console.log(`${candidates.length} candidate names, ${lookups.length} typed names, ${seconds}s`);
console.log('');
console.log(`Found:        ${found.length} of ${total}`);
console.log(`Wrong extras: ${extras.length}`);
console.log(`Missed:       ${missed.length}`);
if (showScores) {
  console.log('\nFound:');
  found.forEach((f) => console.log(line(f)));
}
console.log('\nWrong extras:');
extras.forEach((e) => console.log(line(e)));
if (extras.length === 0) console.log('  (none)');
console.log('\nMissed:');
missed.forEach((m) => console.log(line(m)));
if (missed.length === 0) console.log('  (none)');
