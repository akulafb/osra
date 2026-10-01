/**
 * Chat test questions (LIN-74). Not part of `npm test`: it needs the keys and
 * the network, and it costs a little (about $0.03 for a full run).
 *
 *   npx vite-node scripts/chat-questions/run.ts
 *   npx vite-node scripts/chat-questions/run.ts --replies          # also print each reply
 *   npx vite-node scripts/chat-questions/run.ts --only amto,no-path
 *
 * Asks each question in src/lib/fixtures/chatTestQuestions.ts through the
 * family chat, on the made-up test tree, with the real TypeSafe Jev and
 * OpenRouter (src/lib/fixtures/chatTestHarness.ts runs the family-chat
 * function's handler in this process; no Supabase project is called). Prints,
 * for each question, correct or wrong, where it went (code or the model), the
 * number of model calls and the cost, then the totals. Exits 1 when fewer than
 * 18 of 20 are correct.
 *
 * Keys: `OPENROUTER_API_KEY` and `TYPESAFE_API_KEY`, from the environment, or
 * from `.env.local`, or from the file named by $ENV_FILE.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChatTestReply, type ChatTestCheck } from '../../src/lib/fixtures/chatTestCheck';
import { createChatTestRunner, type ChatTestAnswer } from '../../src/lib/fixtures/chatTestHarness';
import { CHAT_TEST_QUESTIONS } from '../../src/lib/fixtures/chatTestQuestions';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const showReplies = args.includes('--replies');
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : new Set(args[onlyAt + 1]?.split(','));

const PASS_MARK = 18;

/** Reads one variable from a dotenv file. Tolerates spaces around `=` and quotes. */
function readEnvFile(path: string, name: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m?.[1] === name) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

function key(name: string): string {
  const value =
    process.env[name] ||
    readEnvFile(resolve(repoRoot, '.env.local'), name) ||
    (process.env.ENV_FILE && readEnvFile(resolve(process.env.ENV_FILE), name));
  if (!value) throw new Error(`No ${name} in the environment, in .env.local, or in $ENV_FILE.`);
  return value;
}

const runner = createChatTestRunner({
  openRouterApiKey: key('OPENROUTER_API_KEY'),
  typeSafeApiKey: key('TYPESAFE_API_KEY'),
});

const questions = CHAT_TEST_QUESTIONS.filter((q) => !only || only.has(q.id));
const rows: Array<{ id: string; question: string; answer: ChatTestAnswer; check: ChatTestCheck }> = [];
const started = Date.now();

for (const q of questions) {
  const answer = await runner.ask(q.question);
  const check: ChatTestCheck = answer.outcome.ok
    ? checkChatTestReply(q, answer.outcome.answer)
    : { correct: false, problems: [`no answer: ${answer.outcome.cause}`] };
  rows.push({ id: q.id, question: q.question, answer, check });
  process.stderr.write(check.correct ? '.' : 'x');
}
process.stderr.write('\n');

const dollars = (n: number) => `$${n.toFixed(5)}`;
const routeOf = ({ outcome }: ChatTestAnswer) => (outcome.ok ? outcome.answeredBy : 'failed');

console.log(`Chat test questions: ${rows.length} on the test tree, speaker Maya Khoury, ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
console.log(`${'#'.padStart(2)}  ${'id'.padEnd(26)} ${'result'.padEnd(7)} ${'route'.padEnd(6)} ${'calls'.padStart(5)}  ${'cost'.padStart(8)}`);
rows.forEach(({ id, answer, check }, i) => {
  console.log(
    `${String(i + 1).padStart(2)}  ${id.padEnd(26)} ${(check.correct ? 'ok' : 'WRONG').padEnd(7)} ${routeOf(answer).padEnd(6)} ` +
      `${String(answer.cost.modelCalls).padStart(5)}  ${dollars(answer.cost.total).padStart(8)}`,
  );
  for (const problem of check.problems) console.log(`      - ${problem}`);
  for (const line of answer.log) console.log(`      ! ${line}`);
  if (answer.uncosted > 0) console.log(`      ! ${answer.uncosted} model call(s) came back with no cost`);
});

const costs = rows.map((r) => r.answer.cost.total);
const correct = rows.filter((r) => r.check.correct).length;
const toCode = rows.filter((r) => routeOf(r.answer) === 'code').length;
const sum = costs.reduce((a, b) => a + b, 0);
console.log('');
console.log(`Correct:       ${correct} of ${rows.length}`);
console.log(`Routed to code: ${toCode} of ${rows.length} (no model call)`);
console.log(`Model calls:   ${rows.reduce((n, r) => n + r.answer.cost.modelCalls, 0)}`);
console.log(`Mean cost:     ${dollars(sum / Math.max(rows.length, 1))}`);
console.log(`Highest cost:  ${dollars(Math.max(0, ...costs))}`);
console.log(`Total cost:    ${dollars(sum)}`);

if (showReplies) {
  console.log('\nReplies:');
  for (const { id, question, answer } of rows) {
    const text = answer.outcome.ok ? answer.outcome.answer : answer.outcome.line;
    console.log(`\n[${id}] ${question}\n${text.replace(/^/gm, '  ')}`);
  }
}

if (!only && correct < PASS_MARK) process.exitCode = 1;
