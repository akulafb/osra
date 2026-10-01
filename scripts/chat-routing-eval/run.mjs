#!/usr/bin/env node
/**
 * Chat routing evaluation (LIN-73). Not part of `npm test`: it needs the
 * TypeSafe key and the network, and it costs a little (46 requests, about
 * $0.00005 each).
 *
 *   node scripts/chat-routing-eval/run.mjs
 *   node scripts/chat-routing-eval/run.mjs --all     # also list the messages Jev got right
 *
 * It sends each message in messages.json to TypeSafe Jev exactly as the
 * family-chat function's route operation does (it imports the function's own
 * request and answer reading), then checks the answers the code would use:
 * the relation always; the side only for grandparents, aunts and uncles, and
 * cousins; the gender for every kind but a spouse, how two Persons are related
 * and other; the subject for every kind but how related and other; and whether
 * a number is asked for. The same rules as src/lib/chatRouting.ts.
 *
 * It also reports where each message would go at the 0.5 confidence gate:
 * to code, or to the model. Names are not resolved here (that needs the
 * Working Record), so "to code" means Jev's part of the gate passed.
 *
 * The key is read from the environment, or from `TYPESAFE_API_KEY` in
 * `.env.local`, or in the file named by $ENV_FILE.
 *
 * Needs Node 22.18 or later (it imports the function's TypeScript directly).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApiKey } from '../readApiKey.mjs';
import { askQuestionKind, TYPESAFE_MODEL } from '../../supabase/functions/family-chat/questionKind.ts';

const here = dirname(fileURLToPath(import.meta.url));
const showAll = process.argv.includes('--all');

/** The same gate as MIN_CONFIDENCE in src/lib/chatRouting.ts. */
const MIN_CONFIDENCE = 0.5;
const USES_SIDE = new Set(['grandparents', 'aunts_uncles', 'cousins']);
const IGNORES_GENDER = new Set(['spouse', 'how_related', 'other']);
const IGNORES_SUBJECT = new Set(['how_related', 'other']);

const apiKey = readApiKey('TYPESAFE_API_KEY');

const set = JSON.parse(readFileSync(resolve(here, 'messages.json'), 'utf8'));
const cases = [
  ...set.tuned.map((row) => ({ group: 'tuned', row })),
  ...set.new.map((row) => ({ group: 'new', row })),
];

/** The answers the code uses for this relation, as [name, Jev's answer, expected]. */
function usedAnswers(kind, [, relation, side, gender, subject, wantsCount]) {
  const used = [['relation', kind.relation, relation]];
  if (USES_SIDE.has(relation)) used.push(['side', kind.side, side]);
  if (!IGNORES_GENDER.has(relation)) used.push(['gender', kind.gender, gender]);
  if (!IGNORES_SUBJECT.has(relation)) used.push(['subject', kind.subject, subject]);
  used.push(['wants_count', kind.wantsCount, wantsCount === 1]);
  return used;
}

/** Jev's part of the routing gate in src/lib/chatRouting.ts. */
function goesToCode(kind) {
  const relation = kind.relation.value;
  if (relation === 'other') return false;
  const confidences = [kind.relation.confidence];
  if (relation !== 'how_related') confidences.push(kind.subject.confidence, kind.wantsCount.confidence);
  if (USES_SIDE.has(relation)) {
    if (kind.side.value === 'family_name') return false;
    confidences.push(kind.side.confidence);
  }
  if (!IGNORES_GENDER.has(relation)) confidences.push(kind.gender.confidence);
  return confidences.every((c) => c >= MIN_CONFIDENCE);
}

const results = [];
const started = Date.now();
for (const { group, row } of cases) {
  const outcome = await askQuestionKind(row[0], apiKey, { retries: 3, attemptTimeoutMs: 10_000 });
  if (!outcome.ok) {
    throw new Error(`TypeSafe ${outcome.kind} ${outcome.status ?? ''} ${outcome.detail ?? ''} on "${row[0]}"`);
  }
  const kind = outcome.answer;
  const wrong = usedAnswers(kind, row).filter(([, answer, expected]) => answer.value !== expected);
  const shouldGoToCode = row[1] !== 'other' && !(USES_SIDE.has(row[1]) && row[2] === 'family_name');
  results.push({ group, row, kind, wrong, toCode: goesToCode(kind), shouldGoToCode });
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const fmt = (answer) =>
  `${answer.value} (${answer.confidence.toFixed(2)})`;
const routeText = (r) => (r.toCode ? 'code' : 'model');

console.log(`Chat routing evaluation — direct to TypeSafe, model ${TYPESAFE_MODEL}`);
console.log(`${results.length} messages, ${seconds}s`);
for (const group of ['tuned', 'new']) {
  const inGroup = results.filter((r) => r.group === group);
  const right = inGroup.filter((r) => r.wrong.length === 0).length;
  const safe = inGroup.filter((r) => r.wrong.length === 0 || !r.toCode).length;
  console.log(
    `${group.padEnd(5)}: ${right} of ${inGroup.length} right` +
      ` — ${safe} of ${inGroup.length} right or sent to the model by the gate`,
  );
}

const toCode = results.filter((r) => r.toCode);
const wrongToCode = toCode.filter((r) => r.wrong.length > 0 || !r.shouldGoToCode);
const missedCode = results.filter((r) => !r.toCode && r.shouldGoToCode && r.wrong.length === 0);
console.log('');
console.log(`To code:  ${toCode.length} of ${results.length} (a wrong answer among them: ${wrongToCode.length})`);
console.log(`To model: ${results.length - toCode.length} (right answers that the gate still sent to the model: ${missedCode.length})`);

console.log('\nMisses:');
for (const r of results.filter((x) => x.wrong.length > 0)) {
  const detail = r.wrong.map(([name, answer, expected]) => `${name} ${fmt(answer)}, expected ${expected}`).join('; ');
  console.log(`  [${r.group}] "${r.row[0]}" → ${routeText(r)}: ${detail}`);
}
if (results.every((r) => r.wrong.length === 0)) console.log('  (none)');

if (showAll) {
  console.log('\nAll:');
  for (const r of results) {
    const k = r.kind;
    console.log(
      `  [${r.group}] ${r.wrong.length === 0 ? 'ok  ' : 'MISS'} → ${routeText(r).padEnd(5)} "${r.row[0]}": ` +
        `${fmt(k.relation)}, side ${fmt(k.side)}, gender ${fmt(k.gender)}, subject ${fmt(k.subject)}, count ${fmt(k.wantsCount)}`,
    );
  }
}
