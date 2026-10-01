/**
 * Checks a family-chat reply against a chat test question's known answer
 * (LIN-74). It reads only names, numbers and relation words, never the prose:
 * a reply is correct when it holds every expected one and names no fixture
 * Person outside the answer.
 */
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { CHAT_TEST_SPEAKER, type ChatTestQuestion } from './chatTestQuestions';
import { FIXTURE_IDS, FIXTURE_PERSONS } from './kinshipFixtureTree';

export interface ChatTestCheck {
  correct: boolean;
  /** Each way the reply is wrong, for the printed table. */
  problems: string[];
}

const DISPLAY_NAMES = [...new Set(FIXTURE_PERSONS.map((person) => formatNodeDisplayName(person)))];

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

const NOT_RELATED =
  /\b(not|no|isn't|aren't|never)\b[^.\n]{0,60}\b(related|relation|relationship|connection|connected|kinship path|path|link)\b/i;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether `text` holds `name` as whole words, ignoring case and Markdown. */
function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{M}])${escape(name)}(?![\\p{L}\\p{M}])`, 'iu').test(text);
}

function holdsNumber(text: string, n: number): boolean {
  if (new RegExp(`(?<![\\d.])${n}(?![\\d.]*\\d)`).test(text)) return true;
  const word = NUMBER_WORDS[n];
  return word !== undefined && new RegExp(`\\b${word}\\b`, 'i').test(text);
}

export function checkChatTestReply({ question, expect }: ChatTestQuestion, reply: string): ChatTestCheck {
  const text = reply.replace(/[*_`]/g, '');
  const problems: string[] = [];

  for (const name of expect.names ?? []) {
    if (!mentions(text, name)) problems.push(`missing ${name}`);
  }

  const allowed = new Set([CHAT_TEST_SPEAKER.displayName, ...(expect.names ?? []), ...(expect.allow ?? [])]);
  for (const name of DISPLAY_NAMES) {
    if (!allowed.has(name) && !mentions(question, name) && mentions(text, name)) problems.push(`wrong name ${name}`);
  }

  if (expect.number !== undefined && !holdsNumber(text, expect.number)) {
    problems.push(`missing the number ${expect.number}`);
  }

  let after = -1;
  let previous: RegExp | null = null;
  for (const relation of expect.relations ?? []) {
    const at = text.search(relation);
    if (at === -1) problems.push(`missing relation ${relation}`);
    else if (previous && at < after) problems.push(`relation ${relation} comes before ${previous}`);
    else after = at;
    previous = relation;
  }

  for (const word of expect.forbid ?? []) {
    if (word.test(text)) problems.push(`says ${word}`);
  }

  if (expect.asksWhich && !(/\?/.test(text) || /\bwhich\b/i.test(text))) problems.push('does not ask which Person');
  if (expect.notRelated && !NOT_RELATED.test(text)) problems.push('does not say they are not related');

  if (Object.values(FIXTURE_IDS).some((id) => text.includes(id))) problems.push('shows a Person id');

  return { correct: problems.length === 0, problems };
}
