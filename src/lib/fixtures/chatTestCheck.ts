/**
 * Checks a family-chat reply to a chat test question (LIN-74, LIN-81). Two
 * kinds of check run on every reply, each named in `REPLY_CHECKS`:
 * - the answer: the names, number and relation words the question expects,
 *   and no fixture Person outside the answer;
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

/** The reply as the checks read it: Markdown emphasis taken out. */
interface ReplyUnderCheck {
  question: ChatTestQuestion;
  text: string;
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

/** A kinship word: "mother", "great-grandson", "stepdaughter", "sister-in-law", "khalo". */
const KINSHIP_WORD = new RegExp(
  '(?<![\\p{L}-])(?:great-|grand|step-?|half-)*' +
    '(?:mother|father|mom|dad|mama|baba|parent|son|daughter|child|children|kid|brother|sister|sibling|' +
    'wife|wives|husband|spouse|aunt|uncle|niece|nephew|cousin|' +
    ARABIC_KINSHIP_WORDS +
    ')s?(?:-in-laws?)?(?![\\p{L}-])',
  'giu',
);

/** Words between a possessive and the kinship word it owns: "Layla's former husband", "his first cousin". */
const MODIFIERS = String.raw`(?:(?:first|second|third|fourth|fifth|former|late|elder|older|younger|paternal|maternal)\s+)*`;

/**
 * How a kinship word is joined to the next one, when the reply walks a
 * Kinship Path: "mother's brother", "daughter of his uncle", or, through a
 * named Person, "brother **Hani Khoury**'s son".
 */
const UNNAMED_JOIN = new RegExp(String.raw`^(?:['’]s\s+|\s+of\s+(?:(?:the|your|his|her|their|my)\s+)?)${MODIFIERS}$`, 'iu');
const NAMED_JOIN = new RegExp(
  String.raw`^(?:,?\s+(?:once|twice|\w+ times) removed)?,?\s+(?:\p{Lu}[\p{L}\p{M}'’-]*\s+){0,2}\p{Lu}[\p{L}\p{M}-]*['’]s\s+${MODIFIERS}$`,
  'u',
);

/** A follow-up offered after the answer. */
const OFFER =
  /\b(let me know|would you like|do you want|want me to|i can also|feel free|ask me|if you(?:'d| would) like|happy to)\b/i;

/** At most this many words for an open question (LIN-80). */
const MAX_OPEN_WORDS = 150;
/** At most this many lines for any other question, not counting a bulleted list (LIN-80). */
const MAX_LINES = 2;

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
  return word !== undefined && new RegExp(`\\b${word}\\b`, 'i').test(text);
}

function kinshipWords(text: string): Array<{ word: string; start: number; end: number }> {
  return [...text.matchAll(KINSHIP_WORD)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

const dollars = (n: number) => `$${n.toFixed(5)}`;

function namesProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  return (expect.names ?? []).filter((name) => !mentions(text, name)).map((name) => `missing ${name}`);
}

/**
 * A Person counts as named by display name, or by given name alone when no
 * Person the reply may name has that given name ("Walid", but not "Yusuf"
 * when Yusuf Haddad is in the answer).
 */
function wrongNameProblems({ question: { question, expect }, text }: ReplyUnderCheck): string[] {
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

function numberProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  return expect.number !== undefined && !holdsNumber(text, expect.number) ? [`missing the number ${expect.number}`] : [];
}

/** Each relation word, first found after the one before. */
function relationProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
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

function forbiddenProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  return (expect.forbid ?? []).filter((word) => word.test(text)).map((word) => `says ${word}`);
}

function asksWhichProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  return expect.asksWhich && !(/\?/.test(text) || /\bwhich\b/i.test(text)) ? ['does not ask which Person'] : [];
}

function notRelatedProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  return expect.notRelated && !NOT_RELATED.test(text) ? ['does not say they are not related'] : [];
}

function idProblems({ text }: ReplyUnderCheck): string[] {
  return Object.values(CHAT_TEST_IDS).some((id) => text.includes(id)) ? ['shows a Person id'] : [];
}

/** No kinship word before the Kinship Term the question expects; a missing term is `relations`' to report. */
function termFirstProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  const term = expect.relations?.[0];
  if (!term) return [];
  const at = text.search(term);
  if (at === -1) return [];
  const before = kinshipWords(text).find((word) => word.start < at);
  return before ? [`the Kinship Term does not come first: "${before.word}" comes before it`] : [];
}

/**
 * No kinship word joined to the next one ("mother's brother", "daughter of
 * his uncle"). A Kinship Term that joins terms at named Persons ("your first
 * cousin once removed **Layla Haddad**'s husband") may have as many named
 * joins as it has terms less one, and no more.
 */
function spelledOutPathProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  let namedJoinsLeft = (expect.joinedTerms ?? 1) - 1;
  const words = kinshipWords(text);
  words.slice(1).forEach((next, i) => {
    const word = words[i];
    const between = text.slice(word.end, next.start);
    const joined = text.slice(word.start, next.end);
    if (UNNAMED_JOIN.test(between)) problems.push(`spells out the Kinship Path: "${joined}"`);
    else if (NAMED_JOIN.test(between) && namedJoinsLeft-- <= 0) problems.push(`spells out the Kinship Path: "${joined}"`);
  });
  return problems;
}

/** A question only when the reply must ask which Person; never an offer. */
function followUpProblems({ question: { expect }, text }: ReplyUnderCheck): string[] {
  const problems: string[] = [];
  if (!expect.asksWhich && text.includes('?')) problems.push('asks a follow-up question');
  const offer = text.match(OFFER);
  if (offer) problems.push(`offers a follow-up: "${offer[0]}"`);
  return problems;
}

function lengthProblems({ question, text }: ReplyUnderCheck): string[] {
  if (question.group === 'open') {
    const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
    return words > MAX_OPEN_WORDS ? [`is ${words} words; at most ${MAX_OPEN_WORDS} for an open question`] : [];
  }
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !BULLET.test(line)).length;
  return lines > MAX_LINES ? [`is ${lines} lines; at most ${MAX_LINES} for this question`] : [];
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
  'no Person ids': idProblems,
  'Kinship Term first': termFirstProblems,
  'no spelled-out Kinship Path': spelledOutPathProblems,
  'no follow-up': followUpProblems,
  length: lengthProblems,
  'cost under the cap': costProblems,
} satisfies Record<string, (reply: ReplyUnderCheck) => string[]>;

export function checkChatTestReply(question: ChatTestQuestion, { text, cost }: ChatTestReply): ChatTestCheck {
  const reply: ReplyUnderCheck = { question, text: text.replace(/[*_`]/g, ''), cost };
  const problems = Object.values(REPLY_CHECKS).flatMap((check) => check(reply));
  return { correct: problems.length === 0, problems };
}
