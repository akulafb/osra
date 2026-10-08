/**
 * Checks a family-chat reply to a chat test question (LIN-74, LIN-81). Two
 * kinds of check run on every reply, each named in `REPLY_CHECKS`:
 * - the answer: the names, number and relation words the question expects,
 *   or a bare "No." (LIN-88), and no fixture Person outside the answer;
 * - the shape: the Kinship Term first, no Kinship Path spelled out, no
 *   follow-up, the length, and the message's cost under the cap.
 * Each check reads only words, names and numbers, never the meaning of the prose.
 */
import { MAX_MESSAGE_COST_USD } from '../../../supabase/functions/family-chat/limits.ts';
import { formatNodeDisplayName } from '../../utils/nodeDisplayName';
import { CHAT_TEST_SPEAKER, type ChatTestQuestion } from './chatTestQuestions';
import { CHAT_TEST_IDS, CHAT_TEST_PERSONS } from './kinshipFixtureTree';

export interface ChatTestCheck {
  correct: boolean;
  /** Each way the reply is wrong, for the printed table. */
  problems: string[];
}

/** One message's reply and what it cost. */
export interface ChatTestReply {
  text: string;
  /** In US dollars: Jev and every model call for the message. */
  cost: number;
}

interface ReplyUnderCheck {
  question: ChatTestQuestion;
  plainText: string;
  cost: number;
}

/** Each fixture Person's display name with their given name. */
const PERSON_NAMES = CHAT_TEST_PERSONS.map((person) => ({
  displayName: formatNodeDisplayName(person),
  givenName: person.firstName ?? '',
}));

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

const NOT_RELATED =
  /\b(not|no|isn't|aren't|never)\b[^.\n]{0,60}\b(related|relation|relationship|connection|connected|kinship path|path|link)\b/i;

const ARABIC_KINSHIP_WORDS = 'khalo|khal|khalto|khala|ammo|amo|amto|amme|jiddo|jeddo|seedo|teta|sitto|sitti';

const KINSHIP_WORD = new RegExp(
  '(?<![\\p{L}-])(?:great-|grand|step-?|half-)*' +
    '(?:mother|father|mom|mum|dad|mama|baba|papa|grandma|grandpa|parent|son|daughter|child|children|kid|brother|sister|sibling|' +
    'wife|wives|husband|spouse|aunt|uncle|niece|nephew|cousin|' +
    ARABIC_KINSHIP_WORDS +
    ')s?(?:-in-laws?)?(?![\\p{L}-])',
  'giu',
);

const KINSHIP_MODIFIERS = String.raw`(?:(?:first|second|third|fourth|fifth|former|late|only|own|little|big|baby|elder|older|eldest|oldest|younger|youngest|paternal|maternal)\s+)*`;

const PATH_JOIN = new RegExp(String.raw`^(?:['’]s\s+|\s+of\s+(?:(?:the|your|his|her|their|my)\s+)?)${KINSHIP_MODIFIERS}$`, 'iu');
const PATH_JOIN_THROUGH_A_NAME = new RegExp(
  String.raw`^(?:,?\s+(?:once|twice|\w+ times) removed)?,?\s+(?:\p{Lu}[\p{L}\p{M}'’-]*\s+){0,2}\p{Lu}[\p{L}\p{M}-]*['’]s\s+${KINSHIP_MODIFIERS}$`,
  'u',
);

const FOLLOW_UP_OFFER =
  /\b(let me know|would you like|do you want|want me to|i can (?:also )?(?:tell|show|list|look|find|give|help)|feel free|ask me|if you(?:'d| would)? (?:like|want)|happy to)\b/i;

const MAX_WORDS = 150;
const MAX_PROSE_LINES = 2;

const SIDE = /^['’]s side\b/i;

const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether `text` holds `name` as whole words, ignoring case and Markdown. */
function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(name)}(?![\\p{L}\\p{M}])`, 'iu').test(text);
}

function holdsNumber(text: string, n: number): boolean {
  if (new RegExp(`(?<![\\d.])${n}(?![\\d.]*\\d)`).test(text)) return true;
  const word = NUMBER_WORDS[n];
  return word !== undefined && new RegExp(`(?<![\\p{L}-])${word}(?![\\p{L}-])`, 'iu').test(text);
}

function kinshipWords(text: string): Array<{ word: string; start: number; end: number }> {
  return [...text.matchAll(KINSHIP_WORD)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

const dollars = (n: number) => `$${n.toFixed(5)}`;

function namesProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return (expect.names ?? []).filter((name) => !mentions(text, name)).map((name) => `missing ${name}`);
}

/**
 * A Person counts as named by display name, or by given name alone when no
 * Person the reply may name has that given name ("Walid", but not "Yusuf"
 * when Yusuf Haddad is in the answer).
 */
function wrongNameProblems({ question: { question, expect }, plainText: text }: ReplyUnderCheck): string[] {
  const allowed = new Set([CHAT_TEST_SPEAKER.displayName, ...(expect.names ?? []), ...(expect.allow ?? [])]);
  const mayName = PERSON_NAMES.filter(({ displayName }) => allowed.has(displayName) || mentions(question, displayName));
  const allowedGivenNames = new Set(mayName.map(({ givenName }) => givenName));
  const wrong = new Set<string>();
  for (const { displayName, givenName } of PERSON_NAMES) {
    if (mayName.some((person) => person.displayName === displayName)) continue;
    if (mentions(text, displayName) || (!allowedGivenNames.has(givenName) && mentions(text, givenName))) wrong.add(displayName);
  }
  return [...wrong].map((name) => `wrong name ${name}`);
}

function numberProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return expect.number !== undefined && !holdsNumber(text, expect.number) ? [`missing the number ${expect.number}`] : [];
}

function relationProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  let lastFoundAt = -1;
  let lastRelation: RegExp | null = null;
  for (const relation of expect.relations ?? []) {
    const at = text.search(relation);
    if (at === -1) problems.push(`missing relation ${relation}`);
    else if (lastRelation && at < lastFoundAt) problems.push(`relation ${relation} comes before ${lastRelation}`);
    else lastFoundAt = at;
    lastRelation = relation;
  }
  return problems;
}

function forbiddenProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return (expect.forbid ?? []).filter((word) => word.test(text)).map((word) => `says ${word}`);
}

function asksWhichProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return expect.asksWhich && !(/\?/.test(text) || /\bwhich\b/i.test(text)) ? ['does not ask which Person'] : [];
}

function notRelatedProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return expect.notRelated && !NOT_RELATED.test(text) ? ['does not say they are not related'] : [];
}

function answersNoProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  return expect.answersNo && text.trim() !== 'No.' ? ['does not answer "No." and nothing more'] : [];
}

function idProblems({ plainText: text }: ReplyUnderCheck): string[] {
  return Object.values(CHAT_TEST_IDS).some((id) => text.includes(id)) ? ['shows a Person id'] : [];
}

function termFirstProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  const term = expect.relations?.[0];
  if (!term) return [];
  const at = text.search(term);
  if (at === -1) return [];
  const before = kinshipWords(text).find((word) => word.start < at && !SIDE.test(text.slice(word.end)));
  return before ? [`the Kinship Term does not come first: "${before.word}" comes before it`] : [];
}

function spelledOutPathProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  const allowedNamedJoins = (expect.joinedTerms ?? 1) - 1;
  let namedJoins = 0;
  const words = kinshipWords(text);
  words.slice(1).forEach((next, i) => {
    const word = words[i];
    const between = text.slice(word.end, next.start);
    const joined = text.slice(word.start, next.end);
    const throughAName = PATH_JOIN_THROUGH_A_NAME.test(between) && ++namedJoins > allowedNamedJoins;
    if (PATH_JOIN.test(between) || throughAName) problems.push(`spells out the Kinship Path: "${joined}"`);
  });
  return problems;
}

function followUpProblems({ question: { expect }, plainText: text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  if (!expect.asksWhich && text.includes('?')) problems.push('asks a follow-up question');
  const offer = text.match(FOLLOW_UP_OFFER);
  if (offer) problems.push(`offers a follow-up: "${offer[0]}"`);
  return problems;
}

function lengthProblems({ question, plainText: text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  const open = question.group === 'open';
  const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (words > MAX_WORDS) problems.push(`is ${words} words; at most ${MAX_WORDS} for ${open ? 'an open question' : 'any reply'}`);
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !BULLET.test(line)).length;
  if (!open && lines > MAX_PROSE_LINES) problems.push(`is ${lines} lines; at most ${MAX_PROSE_LINES} for this question`);
  return problems;
}

function costProblems({ cost }: ReplyUnderCheck): string[] {
  return cost < MAX_MESSAGE_COST_USD ? [] : [`cost ${dollars(cost)}, not under the cap of ${dollars(MAX_MESSAGE_COST_USD)}`];
}

/** Every check, in the order its problems are listed. */
export const REPLY_CHECKS = {
  names: namesProblems,
  'no wrong names': wrongNameProblems,
  number: numberProblems,
  'relations in order': relationProblems,
  'no forbidden words': forbiddenProblems,
  'asks which Person': asksWhichProblems,
  'says not related': notRelatedProblems,
  'answers "No."': answersNoProblems,
  'no Person ids': idProblems,
  'Kinship Term first': termFirstProblems,
  'no spelled-out Kinship Path': spelledOutPathProblems,
  'no follow-up': followUpProblems,
  length: lengthProblems,
  'cost under the cap': costProblems,
} satisfies Record<string, (reply: ReplyUnderCheck) => string[]>;

export function checkChatTestReply(question: ChatTestQuestion, { text, cost }: ChatTestReply): ChatTestCheck {
  const reply: ReplyUnderCheck = { question, plainText: text.replace(/[*_`]/g, ''), cost };
  const problems = Object.values(REPLY_CHECKS).flatMap((check) => check(reply));
  return { correct: problems.length === 0, problems };
}
