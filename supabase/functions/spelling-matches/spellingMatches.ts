/**
 * The pure part of the spelling-match lookup: what a request must look like,
 * what is asked of TypeSafe Jev, and how its answer becomes one score per name.
 *
 * The question is "which given names in the Tree Record are the same name as the
 * typed name, with a different spelling or transliteration?" (LIN-67). The
 * wording lives here, on the server: the browser sends names, never questions,
 * so the key cannot be borrowed for other work.
 *
 * No threshold is applied. The caller treats a score of 0.5 or more as a spelling
 * match; that number was measured on the pinned model and belongs with the
 * Person Match code that uses it.
 */

export { TYPESAFE_URL } from '../_shared/typeSafe.ts';

/** Pinned, not `jev-latest`: the caller's threshold was measured on this version. */
export const TYPESAFE_MODEL = 'jev-1.13.0';

/** The Person Match minimum (`MIN_MATCH_QUERY_LENGTH` in src/lib/personMatch.ts). */
export const MIN_TYPED_NAME_LENGTH = 2;

/** 268 names is about 8,400 input tokens; the model limit is 64k for a request. */
export const MAX_NAMES = 1000;

/**
 * No given name is this long. The cap keeps 1,000 names inside the token limit
 * and leaves no room to smuggle a prompt in as a "name".
 */
export const MAX_NAME_LENGTH = 60;

export interface SpellingMatchRequest {
  typedName: string;
  /** Distinct, trimmed, in the order first seen. */
  names: string[];
}

export interface NameScore {
  name: string;
  /** Jev's probability, 0 to 1, that `name` is the typed name spelled differently. */
  score: number;
}

export interface SpellingMatchResponse {
  model: string;
  scores: NameScore[];
}

export type Validation =
  | { ok: true; request: SpellingMatchRequest }
  | { ok: false; code: string; message: string };

function refuse(code: string, message: string): Validation {
  return { ok: false, code, message };
}

/** Length as a person counts it: "محمد" is four, not the UTF-16 unit count. */
function characterCount(s: string): number {
  return [...s].length;
}

/** Checks a request body of the form `{ typedName: string, names: string[] }`. */
export function validateRequest(body: unknown): Validation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return refuse('invalid_body', 'Send a JSON object: { typedName, names }.');
  }
  const { typedName: rawTyped, names: rawNames } = body as Record<string, unknown>;

  if (typeof rawTyped !== 'string' || rawTyped.trim() === '') {
    return refuse('typed_name_empty', 'typedName must not be empty.');
  }
  const typedName = rawTyped.trim();
  if (characterCount(typedName) < MIN_TYPED_NAME_LENGTH) {
    return refuse(
      'typed_name_too_short',
      `typedName must be at least ${MIN_TYPED_NAME_LENGTH} characters.`,
    );
  }
  if (characterCount(typedName) > MAX_NAME_LENGTH) {
    return refuse('typed_name_too_long', `typedName must be at most ${MAX_NAME_LENGTH} characters.`);
  }

  if (!Array.isArray(rawNames)) {
    return refuse('names_invalid', 'names must be an array of strings.');
  }
  // Counted before de-duplication: the limit is on what was sent.
  if (rawNames.length > MAX_NAMES) {
    return refuse('too_many_names', `names must hold at most ${MAX_NAMES} names.`);
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawNames) {
    if (typeof raw !== 'string') {
      return refuse('names_invalid', 'names must be an array of strings.');
    }
    const name = raw.trim();
    if (name === '') return refuse('names_invalid', 'names must not hold an empty name.');
    if (characterCount(name) > MAX_NAME_LENGTH) {
      return refuse('name_too_long', `Each name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return { ok: true, request: { typedName, names } };
}

/**
 * A candidate is quoted inside the question. A double quote, a backtick (Jev's
 * state-path marker) or a control character would end the quote or change the
 * question, so they are left out of the wording. The score is still reported
 * under the full (trimmed) name.
 */
function quotable(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["`\u0000-\u001f\u007f]/g, '');
}

export function questionFor(candidate: string): { type: 'noul'; instructions: string } {
  return {
    type: 'noul',
    instructions: `Is \`typed_name\` the same given name as "${quotable(candidate)}", differing only in spelling or transliteration?`,
  };
}

/** Question ids are positions, so no name can collide with or forge a key. */
export function questionId(index: number): string {
  return `n${index}`;
}

export interface TypeSafeRequestBody {
  model: string;
  state: { typed_name: string };
  questions: Record<string, { type: 'noul'; instructions: string }>;
}

/** One request for a lookup: one Noul question for each distinct given name. */
export function buildTypeSafeRequest(request: SpellingMatchRequest): TypeSafeRequestBody {
  const questions: TypeSafeRequestBody['questions'] = {};
  request.names.forEach((name, i) => {
    questions[questionId(i)] = questionFor(name);
  });
  return { model: TYPESAFE_MODEL, state: { typed_name: request.typedName }, questions };
}

/**
 * Reads TypeSafe's answers back into one raw score per name, in request order.
 * Returns null when any name has no usable answer: a partial result would read
 * to the caller as "those names do not match".
 */
export function mapScores(names: readonly string[], typeSafeBody: unknown): NameScore[] | null {
  const answers = (typeSafeBody as { answers?: unknown } | null)?.answers;
  if (typeof answers !== 'object' || answers === null) return null;

  const scores: NameScore[] = [];
  for (let i = 0; i < names.length; i++) {
    const noul = (answers as Record<string, { noul?: unknown } | undefined>)[questionId(i)]?.noul;
    if (typeof noul !== 'number' || !Number.isFinite(noul) || noul < 0 || noul > 1) return null;
    scores.push({ name: names[i], score: noul });
  }
  return scores;
}
