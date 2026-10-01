/**
 * What kind of question a chat message is, as TypeSafe Jev reads it (LIN-73).
 *
 * One request, five questions, over `state = { message }`. The browser sends
 * only the message; the wording lives here, so the key cannot be borrowed for
 * other work. The answers come back raw, with their confidence: the browser
 * decides from them whether code can answer (`src/lib/chatRouting.ts`),
 * because only the browser has the Working Record to find the named Persons.
 *
 * The wording is the LIN-73 prototype's (31 of 32 on tuned messages, 12 of 14
 * on new ones), tuned for its misses: plural and less common Arabic kinship
 * words, and a side named by a family name. `scripts/chat-routing-eval`
 * measures it on those 46 messages.
 */

import { fetchWithRetry, RETRYABLE_STATUSES, type RetryOptions } from '../_shared/retry.ts';
import { isObject } from './request.ts';

/** The same endpoint the spelling-matches function calls. */
export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';

/** Pinned, not `jev-latest`: the routing gate was measured on this version. */
export const TYPESAFE_MODEL = 'jev-1.13.0';

export const RELATIONS = [
  'parents',
  'children',
  'siblings',
  'spouse',
  'grandparents',
  'grandchildren',
  'aunts_uncles',
  'cousins',
  'nieces_nephews',
  'in_laws',
  'how_related',
  'other',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** `family_name`: a side named by a family cluster ("the Haddad side"); code does not guess which parent. */
export const SIDES = ['maternal', 'paternal', 'both', 'family_name'] as const;
export type Side = (typeof SIDES)[number];

export const GENDERS = ['male', 'female', 'any'] as const;
export type Gender = (typeof GENDERS)[number];

export const SUBJECTS = ['speaker', 'named_person', 'nobody'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** One of Jev's answers, with how sure it is, from 0 to 1. */
export interface Judged<T> {
  value: T;
  confidence: number;
}

export interface QuestionKind {
  relation: Judged<Relation>;
  side: Judged<Side>;
  gender: Judged<Gender>;
  subject: Judged<Subject>;
  /** Whether the message asks for a number ("how many"). */
  wantsCount: Judged<boolean>;
}

const RELATION_CRITERIA: Record<Relation, string> = {
  parents: 'The parents (mother and/or father) of the subject.',
  children: 'The sons and daughters of the subject.',
  siblings: 'The brothers and sisters of the subject.',
  spouse: 'The husband or wife of the subject.',
  grandparents:
    'The grandmothers and grandfathers of the subject: parents of a parent. Arabic words: teta, sitto, sitti, sittos (grandmother); jiddo, jeddo, seedo, jiddos (grandfather).',
  grandchildren: 'The children of the children of the subject.',
  aunts_uncles:
    'The brothers and sisters of a parent of the subject, and their spouses. Arabic words, also in the plural: khalo, khalos, khal (brother of the mother), khalto, khaltos, khala (sister of the mother), ammo, ammos, amo (brother of the father), amto, amtos, amme (sister of the father).',
  cousins: 'The children of the aunts and uncles of the subject.',
  nieces_nephews: 'The children of the brothers and sisters of the subject.',
  in_laws: 'The family of the spouse of the subject: for example mother-in-law, brother-in-law.',
  how_related: 'The message names two people and asks how those two are related to each other.',
  other:
    'Anything else: greetings, questions about the whole tree, birthdays, or a request that is not about one kind of relative.',
};

const QUESTIONS = {
  relation: {
    type: 'choice',
    instructions:
      'Which kind of relative does `message` ask about? The subject is the person whose relatives are wanted.',
    criteria: RELATION_CRITERIA,
  },
  side: {
    type: 'choice',
    instructions:
      'Does `message` say which side of the family to search, the side of the mother or the side of the father? A message that only asks who the mother or the father of a person is does not name a side.',
    criteria: {
      maternal:
        'Only the side of the mother. Includes words such as "maternal", "on my mom\'s side", "mama\'s side", "khalo", "khalos", "khalto", "khaltos", "khala", "my mother\'s brother".',
      paternal:
        'Only the side of the father. Includes words such as "paternal", "on my dad\'s side", "baba\'s side", "ammo", "ammos", "amto", "amtos", "amme", "my father\'s sister".',
      both: 'The message does not name a side. Examples: "who are my cousins", "who is the father of Ali", "who are the sons of Ali".',
      family_name:
        'The message names a side by a family name instead of by the mother or the father, for example "the Haddad side" or "on the Mansour side".',
    } satisfies Record<Side, string>,
  },
  gender: {
    type: 'choice',
    instructions: 'Does `message` ask only for male relatives or only for female relatives?',
    criteria: {
      male: 'Only males: for example father, brother, son, uncle, grandfather, husband, nephew, and the Arabic words khalo, khalos, ammo, ammos, jiddo, jiddos, seedo, also in the plural.',
      female:
        'Only females: for example mother, sister, daughter, aunt, grandmother, wife, niece, and the Arabic words khalto, khaltos, khala, amto, amtos, amme, teta, sitto, sitti, sittos, also in the plural.',
      any: 'Both, or the message does not say.',
    } satisfies Record<Gender, string>,
  },
  subject: {
    type: 'choice',
    instructions: 'Whose relatives does `message` ask about?',
    criteria: {
      speaker:
        'The person who wrote the message. They use "I", "me", "my" or "mine" and name no other person as the subject.',
      named_person: 'A person named in the message, for example "Who are Hala\'s children?".',
      nobody: 'The message is not about the relatives of one person.',
    } satisfies Record<Subject, string>,
  },
  wants_count: {
    type: 'noul',
    instructions: 'Does `message` ask for a number, such as "how many"?',
  },
} as const;

export interface TypeSafeRequestBody {
  model: string;
  state: { message: string };
  questions: typeof QUESTIONS;
}

export function buildQuestionKindRequest(message: string): TypeSafeRequestBody {
  return { model: TYPESAFE_MODEL, state: { message }, questions: QUESTIONS };
}

function readChoice<T extends string>(answer: unknown, allowed: readonly T[]): Judged<T> | null {
  if (!isObject(answer)) return null;
  const { choice, confidence } = answer;
  if (typeof choice !== 'string' || !(allowed as readonly string[]).includes(choice)) return null;
  if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return null;
  return { value: choice as T, confidence };
}

/**
 * A Noul has no confidence of its own; its distance from 0.5 is used, so 0.5
 * is 0 (yes and no equally likely) and 0 or 1 is 1.
 */
function readNoul(answer: unknown): Judged<boolean> | null {
  const noul = isObject(answer) ? answer.noul : undefined;
  if (typeof noul !== 'number' || !(noul >= 0 && noul <= 1)) return null;
  return { value: noul >= 0.5, confidence: Math.round(Math.abs(2 * noul - 1) * 1e6) / 1e6 };
}

/** Jev's answers as a QuestionKind, or null when any one is missing or out of range. */
export function readQuestionKind(body: unknown): QuestionKind | null {
  const answers = isObject(body) && isObject(body.answers) ? body.answers : null;
  if (!answers) return null;
  const relation = readChoice(answers.relation, RELATIONS);
  const side = readChoice(answers.side, SIDES);
  const gender = readChoice(answers.gender, GENDERS);
  const subject = readChoice(answers.subject, SUBJECTS);
  const wantsCount = readNoul(answers.wants_count);
  if (!relation || !side || !gender || !subject || !wantsCount) return null;
  return { relation, side, gender, subject, wantsCount };
}

export type QuestionKindOutcome =
  | { ok: true; questionKind: QuestionKind }
  /** Still 429 or 529 after the retry. */
  | { ok: false; kind: 'busy'; status: number }
  /** Any other HTTP status, or an answer that is not five usable answers. */
  | { ok: false; kind: 'failed'; status: number; detail: string }
  /** No answer at all: network error or timeout. */
  | { ok: false; kind: 'unreachable'; detail: string };

/** The one call to Jev. Never throws; the caller sends the message to the model on any failure. */
export async function askQuestionKind(
  message: string,
  apiKey: string,
  retryOptions: RetryOptions = {},
): Promise<QuestionKindOutcome> {
  let res: Response;
  try {
    res = await fetchWithRetry(
      TYPESAFE_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuestionKindRequest(message)),
      },
      retryOptions,
    );
  } catch (err) {
    return { ok: false, kind: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (RETRYABLE_STATUSES.includes(res.status)) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, kind: 'busy', status: res.status };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    return { ok: false, kind: 'failed', status: res.status, detail };
  }
  const questionKind = readQuestionKind(await res.json().catch(() => null));
  if (!questionKind) {
    return { ok: false, kind: 'failed', status: res.status, detail: 'the answer did not hold all five answers' };
  }
  return { ok: true, questionKind };
}
