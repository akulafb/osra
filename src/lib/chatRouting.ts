/**
 * Answers the common family-chat questions in code, with no model call
 * (LIN-73).
 *
 * TypeSafe Jev has read the message on the server (the family-chat `route`
 * operation) and said what kind of question it is. Here the code decides
 * whether it can answer, finds the named Persons on the Working Record, and
 * writes the reply in the same style as the model's replies. Every other
 * message goes to the model with tools (LIN-72).
 *
 * Code answers only when all of these hold:
 * - the relation is not `other`;
 * - each answer the code uses has a confidence of 0.5 or more (the side only
 *   for grandparents, aunts and uncles, and cousins; the gender for every kind
 *   but a spouse and how two Persons are related; the subject for every kind
 *   but how two Persons are related);
 * - each name in the message matches exactly one Person, and the message names
 *   as many Persons as the question needs.
 *
 * "How is A related to B" is always answered here once both are found: every
 * Kinship Path has a Kinship Term (LIN-77), so the model never names one.
 *
 * Jev never sees the Persons: the names are found here, with `findPersonsByName`.
 */
import type { Speaker } from '../../supabase/functions/family-chat/prompt.ts';
import type {
  Gender,
  QuestionKind,
  Relation,
} from '../../supabase/functions/family-chat/questionKind.ts';
import type { ChatRecord } from './chatTools';
import {
  findKinshipPaths,
  findPersonsByName,
  getFormerSpouses,
  getRecordedGender,
  getRelatives,
  type KinshipRelation,
  type KinshipSide,
  type RecordedGender,
  type RelativeKind,
} from './familyGraph';
import { kinshipTermText, termShowsMarriage } from './kinshipTerm';
import { formatNodeDisplayName } from '../utils/nodeDisplayName';

/** Below this, an answer the code would use sends the message to the model. */
export const MIN_CONFIDENCE = 0.5;

/** Why a message goes to the model, for tests and the evaluation script. */
export type ModelReason =
  | 'no_reading'
  | 'other'
  | 'low_confidence'
  | 'side_by_family_name'
  | 'speaker_unknown'
  | 'person_not_found'
  | 'person_ambiguous'
  | 'names_do_not_fit';

export type RouteDecision = { by: 'code'; answer: string } | { by: 'model'; why: ModelReason };

export interface RouteMessage {
  message: string;
  /** Null when TypeSafe gave no reading. */
  questionKind: QuestionKind | null;
  /** The signed-in user's Person, or null when the account has none. */
  speaker: Speaker | null;
  /** The Working Record, read at send time. */
  record: ChatRecord;
}

type ListRelation = Exclude<Relation, 'how_related' | 'other'>;

/** Which parent's side a list is limited to. */
type ParentSide = Exclude<KinshipSide, 'both'>;

/** What an in-law is without the marriage: `KinshipRelation.inLaw`. */
type InLawOf = NonNullable<KinshipRelation['inLaw']>;

const RELATIVE_KIND: Record<ListRelation, RelativeKind> = {
  parents: 'parents',
  children: 'children',
  siblings: 'siblings',
  spouse: 'spouses',
  grandparents: 'grandparents',
  grandchildren: 'grandchildren',
  aunts_uncles: 'auntsAndUncles',
  cousins: 'cousins',
  nieces_nephews: 'niecesAndNephews',
  in_laws: 'inLaws',
};

/** The relations whose side the code uses; the prototype measured Jev's side on these only. */
const USES_SIDE: ReadonlySet<Relation> = new Set(['grandparents', 'aunts_uncles', 'cousins']);

/** "Who is Hala married to?" came back `male`: a spouse's gender is not taken from Jev. */
const IGNORES_GENDER: ReadonlySet<Relation> = new Set(['spouse', 'how_related']);

/** [one, many] for each relation and gender. */
const NOUNS: Record<ListRelation, Record<Gender, [string, string]>> = {
  parents: { any: ['parent', 'parents'], male: ['father', 'fathers'], female: ['mother', 'mothers'] },
  children: { any: ['child', 'children'], male: ['son', 'sons'], female: ['daughter', 'daughters'] },
  siblings: { any: ['sibling', 'siblings'], male: ['brother', 'brothers'], female: ['sister', 'sisters'] },
  spouse: { any: ['spouse', 'spouses'], male: ['spouse', 'spouses'], female: ['spouse', 'spouses'] },
  grandparents: {
    any: ['grandparent', 'grandparents'],
    male: ['grandfather', 'grandfathers'],
    female: ['grandmother', 'grandmothers'],
  },
  grandchildren: {
    any: ['grandchild', 'grandchildren'],
    male: ['grandson', 'grandsons'],
    female: ['granddaughter', 'granddaughters'],
  },
  aunts_uncles: { any: ['aunt or uncle', 'aunts and uncles'], male: ['uncle', 'uncles'], female: ['aunt', 'aunts'] },
  cousins: { any: ['cousin', 'cousins'], male: ['male cousin', 'male cousins'], female: ['female cousin', 'female cousins'] },
  nieces_nephews: {
    any: ['niece or nephew', 'nieces and nephews'],
    male: ['nephew', 'nephews'],
    female: ['niece', 'nieces'],
  },
  in_laws: { any: ['in-law', 'in-laws'], male: ['male in-law', 'male in-laws'], female: ['female in-law', 'female in-laws'] },
};

const IN_LAW_NOUNS: Record<InLawOf, Record<Gender, [string, string]>> = {
  parent: { any: ['parent-in-law', 'parents-in-law'], male: ['father-in-law', 'fathers-in-law'], female: ['mother-in-law', 'mothers-in-law'] },
  sibling: { any: ['sibling-in-law', 'siblings-in-law'], male: ['brother-in-law', 'brothers-in-law'], female: ['sister-in-law', 'sisters-in-law'] },
  child: { any: ['child-in-law', 'children-in-law'], male: ['son-in-law', 'sons-in-law'], female: ['daughter-in-law', 'daughters-in-law'] },
};

/** "mother in law" and the like, as written: which in-law, and its gender. */
const IN_LAW_WORDS: Record<string, { of: InLawOf; gender: Gender }> = {
  mother: { of: 'parent', gender: 'female' },
  mom: { of: 'parent', gender: 'female' },
  mum: { of: 'parent', gender: 'female' },
  father: { of: 'parent', gender: 'male' },
  dad: { of: 'parent', gender: 'male' },
  parent: { of: 'parent', gender: 'any' },
  brother: { of: 'sibling', gender: 'male' },
  sister: { of: 'sibling', gender: 'female' },
  sibling: { of: 'sibling', gender: 'any' },
  son: { of: 'child', gender: 'male' },
  daughter: { of: 'child', gender: 'female' },
  child: { of: 'child', gender: 'any' },
};

/**
 * Jev says only "in-laws" and a gender; "mother in law" also says which
 * in-law. Read from the words, so "female in-laws" does not list a sister-in-law
 * for "who is my mother in law". Null when the message names no one kind.
 */
function inLawAsked(message: string): { of: InLawOf; gender: Gender } | null {
  const asked = new Set(
    [...message.toLowerCase().matchAll(/\b(mother|mom|mum|father|dad|parent|brother|sister|sibling|son|daughter|child)s?[\s-]*in[\s-]*laws?\b/g)].map(
      (m) => m[1],
    ),
  );
  return asked.size === 1 ? IN_LAW_WORDS[[...asked][0]] : null;
}

/**
 * Arabic kinship words as the family writes them in English letters, and the
 * Kinship Term each one is. Jev reads the same words (`questionKind.ts`); here
 * they let a reply say back the word the question used. The plural adds an
 * "s": khalos, amtos, jiddos.
 */
const ARABIC_KINSHIP_WORDS: Record<string, { label: 'aunt or uncle' | 'grandparent'; gender: RecordedGender; side?: ParentSide }> = {
  khalo: { label: 'aunt or uncle', gender: 'male', side: 'mother' },
  khal: { label: 'aunt or uncle', gender: 'male', side: 'mother' },
  khalto: { label: 'aunt or uncle', gender: 'female', side: 'mother' },
  khala: { label: 'aunt or uncle', gender: 'female', side: 'mother' },
  ammo: { label: 'aunt or uncle', gender: 'male', side: 'father' },
  amo: { label: 'aunt or uncle', gender: 'male', side: 'father' },
  amto: { label: 'aunt or uncle', gender: 'female', side: 'father' },
  amme: { label: 'aunt or uncle', gender: 'female', side: 'father' },
  jiddo: { label: 'grandparent', gender: 'male' },
  jeddo: { label: 'grandparent', gender: 'male' },
  seedo: { label: 'grandparent', gender: 'male' },
  teta: { label: 'grandparent', gender: 'female' },
  sitto: { label: 'grandparent', gender: 'female' },
  sitti: { label: 'grandparent', gender: 'female' },
};

type ArabicWord = keyof typeof ARABIC_KINSHIP_WORDS;

/** The Arabic kinship words a message uses, each in the singular. */
function arabicWordsIn(message: string): ArabicWord[] {
  return words(message)
    .map((word) => word.replace(/[^\p{L}]+/gu, ''))
    .map((word) => (word in ARABIC_KINSHIP_WORDS ? word : word.endsWith('s') ? word.slice(0, -1) : ''))
    .filter((word): word is ArabicWord => word in ARABIC_KINSHIP_WORDS);
}

/**
 * Words that are never read as part of a name, even when a Person has them as
 * a given name or cluster: they are how the question is asked. A Person
 * named by one of them is not found here, and the message goes to the model.
 */
const NOT_NAMES: ReadonlySet<string> = new Set(
  (
    'a an the and or of to in on at for from by with is are was were be been do does did have has had ' +
    'who whom whose what which where when how many much any some all name names called ' +
    'i me my mine myself you your yours he him his she her hers they them their we us our it its ' +
    'related relation relationship relationships between side family tree list show tell please married marry ' +
    'mother mothers mom moms mum mums mama father fathers dad dads baba parent parents ' +
    'son sons daughter daughters child children kid kids brother brothers sister sisters sibling siblings ' +
    'wife wives husband husbands spouse spouses uncle uncles aunt aunts cousin cousins ' +
    'niece nieces nephew nephews grandfather grandfathers grandmother grandmothers grandparent grandparents ' +
    'grandchild grandchildren grandkid grandkids grandson grandsons granddaughter granddaughters law laws ' +
    'maternal paternal'
  )
    .split(' ')
    .concat(Object.keys(ARABIC_KINSHIP_WORDS).flatMap((word) => [word, `${word}s`])),
);

const FIRST_PERSON: ReadonlySet<string> = new Set(['i', "i'm", 'i’m', 'me', 'my', 'mine', 'myself']);

function words(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean);
}

interface MessageWords {
  /** Runs of adjacent words that could be a name, in the order written. */
  names: string[];
  /** The message speaks of the writer ("I", "me", "my"). */
  firstPerson: boolean;
}

/**
 * The names written in a message: each run of adjacent words that are words
 * of some Person's display name. A possessive ("Omar's"), punctuation or any
 * other word ends a run, so "Omar Haddad" is one name and "Omar and Sara" two.
 */
function readMessage(message: string, record: ChatRecord): MessageWords {
  const nameWords = new Set(
    record.nodes.flatMap((node) => words(`${node.firstName ?? ''} ${node.familyCluster ?? ''}`)),
  );
  const names: string[] = [];
  let run: string[] = [];
  let firstPerson = false;
  const endRun = () => {
    if (run.length > 0) names.push(run.join(' '));
    run = [];
  };

  for (const raw of words(message)) {
    const lead = raw.replace(/^[^\p{L}\p{M}]+/u, '');
    // Punctuation after the word ends a run; an apostrophe may be a possessive.
    const core = lead.replace(/[^\p{L}\p{M}'’]+$/u, '');
    const endsClause = core.length < lead.length;
    const possessive = /['’]s?$/u.test(core);
    const word = core.replace(/['’]s?$/u, '');
    if (FIRST_PERSON.has(word)) firstPerson = true;
    if (word !== '' && nameWords.has(word) && !NOT_NAMES.has(word)) {
      run.push(word);
      if (possessive || endsClause) endRun();
    } else {
      endRun();
    }
  }
  endRun();
  return { names, firstPerson };
}

type Found = { ok: true; personId: string } | { ok: false; why: ModelReason };

function findOne(name: string, record: ChatRecord): Found {
  const matches = findPersonsByName(name, record.nodes, record.links);
  if (matches.length === 0) return { ok: false, why: 'person_not_found' };
  if (matches.length > 1) return { ok: false, why: 'person_ambiguous' };
  return { ok: true, personId: matches[0].personId };
}

/** Whether every answer the code will use is sure enough. */
function confident(kind: QuestionKind): boolean {
  const relation = kind.relation.value;
  const used = [kind.relation.confidence];
  if (relation !== 'how_related') used.push(kind.subject.confidence, kind.wantsCount.confidence);
  if (USES_SIDE.has(relation)) used.push(kind.side.confidence);
  if (!IGNORES_GENDER.has(relation)) used.push(kind.gender.confidence);
  return used.every((confidence) => confidence >= MIN_CONFIDENCE);
}

export function routeMessage({ message, questionKind: kind, speaker, record }: RouteMessage): RouteDecision {
  if (!kind) return { by: 'model', why: 'no_reading' };
  const relation = kind.relation.value;
  if (relation === 'other') return { by: 'model', why: 'other' };
  if (!confident(kind)) return { by: 'model', why: 'low_confidence' };
  if (USES_SIDE.has(relation) && kind.side.value === 'family_name') {
    return { by: 'model', why: 'side_by_family_name' };
  }

  const { names, firstPerson } = readMessage(message, record);
  const persons: string[] = [];
  for (const name of names) {
    const found = findOne(name, record);
    if (!found.ok) return { by: 'model', why: found.why };
    persons.push(found.personId);
  }

  const reply = new Reply(record, speaker?.personId ?? null, arabicWordsIn(message));

  if (relation === 'how_related') {
    // "How is A related to B": what A is to B. With one name, the other is the speaker.
    let pair: [from: string, to: string];
    if (persons.length === 2) pair = [persons[1], persons[0]];
    else if (persons.length === 1 && firstPerson) {
      if (!speaker) return { by: 'model', why: 'speaker_unknown' };
      pair = [speaker.personId, persons[0]];
    } else return { by: 'model', why: 'names_do_not_fit' };
    if (pair[0] === pair[1]) return { by: 'model', why: 'names_do_not_fit' };
    return { by: 'code', answer: reply.howRelated(pair[0], pair[1], persons.length === 2) };
  }

  let subjectId: string;
  switch (kind.subject.value) {
    case 'speaker':
      if (!speaker) return { by: 'model', why: 'speaker_unknown' };
      if (persons.length !== 0) return { by: 'model', why: 'names_do_not_fit' };
      subjectId = speaker.personId;
      break;
    case 'named_person':
      if (persons.length === 0) return { by: 'model', why: 'person_not_found' };
      if (persons.length !== 1) return { by: 'model', why: 'names_do_not_fit' };
      subjectId = persons[0];
      break;
    case 'nobody':
      return { by: 'model', why: 'names_do_not_fit' };
  }

  const inLaw = relation === 'in_laws' ? inLawAsked(message) : null;
  // The words of the message, when they give a gender, over Jev's reading of them.
  const gender = IGNORES_GENDER.has(relation) ? 'any' : inLaw && inLaw.gender !== 'any' ? inLaw.gender : kind.gender.value;
  return {
    by: 'code',
    answer: reply.relatives(subjectId, relation, {
      gender,
      side: USES_SIDE.has(relation) ? PARENT_SIDE[kind.side.value] : null,
      wantsCount: kind.wantsCount.value,
      inLaw: inLaw?.of ?? null,
    }),
  };
}

const PARENT_SIDE: Record<QuestionKind['side']['value'], ParentSide | null> = {
  maternal: 'mother',
  paternal: 'father',
  both: null,
  family_name: null,
};

/** The Kinship Term each list relation is, for an Arabic word the question used. */
const LIST_LABEL: Partial<Record<ListRelation, 'aunt or uncle' | 'grandparent'>> = {
  aunts_uncles: 'aunt or uncle',
  grandparents: 'grandparent',
};

/** The reply text, in the model's style: bold names, a bulleted list, the total for a count. */
class Reply {
  private readonly names: Map<string, string>;
  private readonly record: ChatRecord;
  private readonly speakerId: string | null;
  /** The Arabic kinship words the question used: the reply says them back where they fit. */
  private readonly arabic: ArabicWord[];

  constructor(record: ChatRecord, speakerId: string | null, arabic: ArabicWord[]) {
    this.record = record;
    this.speakerId = speakerId;
    this.arabic = arabic;
    this.names = new Map(record.nodes.map((node) => [node.id, formatNodeDisplayName(node)] as const));
  }

  private bold(personId: string): string {
    return `**${this.names.get(personId) ?? 'Unknown'}**`;
  }

  private byName(ids: Iterable<string>): string[] {
    return [...ids].sort((a, b) => (this.names.get(a) ?? '').localeCompare(this.names.get(b) ?? ''));
  }

  private isSpeaker(personId: string): boolean {
    return personId === this.speakerId;
  }

  /** The Kinship Term for `personId`, gendered when the record shows their gender. */
  private term(relation: KinshipRelation, personId: string): string {
    return kinshipTermText(relation, personId, {
      genderOf: (id) => getRecordedGender(id, this.record.links, this.record.nodes),
      nameOf: (id) => this.bold(id),
    });
  }

  /**
   * The Arabic word the question used, when it is the Kinship Term with this
   * label, gender and side: "khalo" for an uncle on the mother's side.
   */
  private arabicWord(label: string, gender: Gender | RecordedGender | null, side: ParentSide | null | undefined): ArabicWord | null {
    return (
      this.arabic.find((word) => {
        const meaning = ARABIC_KINSHIP_WORDS[word];
        return meaning.label === label && meaning.gender === gender && (!meaning.side || meaning.side === side);
      }) ?? null
    );
  }

  /** What `personId` is to `subjectId` through a marriage, when it is an in-law. */
  private inLawOf(subjectId: string, personId: string): KinshipRelation | null {
    const throughMarriage = findKinshipPaths(subjectId, personId, this.record.links).find((path) => path.kind === 'marriage');
    return throughMarriage?.relation?.inLaw ? throughMarriage.relation : null;
  }

  relatives(
    subjectId: string,
    relation: ListRelation,
    {
      gender,
      side,
      wantsCount,
      inLaw,
    }: { gender: Gender; side: ParentSide | null; wantsCount: boolean; inLaw: InLawOf | null },
  ): string {
    const { links, nodes } = this.record;
    const kind = RELATIVE_KIND[relation];
    const all = getRelatives(subjectId, kind, links, { side: side ?? undefined }).filter(
      (id) => !inLaw || this.inLawOf(subjectId, id)?.inLaw === inLaw,
    );
    const found = gender === 'any' ? all : this.byName(all.filter((id) => getRecordedGender(id, links, nodes) === gender));
    const unknownGender = gender === 'any' ? [] : this.byName(all.filter((id) => getRecordedGender(id, links, nodes) === null));
    const ids = this.byName(found);

    const you = this.isSpeaker(subjectId);
    const owner = you ? 'Your' : `${this.bold(subjectId)}'s`;
    const label = LIST_LABEL[relation];
    const arabic = label ? this.arabicWord(label, gender, side) : null;
    // "khalo" says the side itself.
    const sideText = side && !(arabic && ARABIC_KINSHIP_WORDS[arabic].side) ? ` on ${you ? 'your' : 'the'} ${side}'s side` : '';
    const [one, many] = arabic ? [arabic, `${arabic}s`] : inLaw ? IN_LAW_NOUNS[inLaw][gender] : NOUNS[relation][gender];
    const noun = ids.length === 1 ? one : many;

    const parts: string[] = [];
    if (ids.length === 0) {
      parts.push(`The tree has no ${many}${sideText} recorded for ${you ? 'you' : this.bold(subjectId)}.`);
    } else {
      const notes = inLaw ? new Map<string, string>() : this.notes(subjectId, relation, side, ids);
      const item = (id: string) => `${this.bold(id)}${notes.get(id) ? ` (${notes.get(id)})` : ''}`;
      const list = ids.map((id) => `- ${item(id)}`).join('\n');
      if (wantsCount) {
        const has = you ? 'You have' : `${this.bold(subjectId)} has`;
        parts.push(ids.length === 1 ? `${has} **1** ${noun}${sideText}: ${item(ids[0])}.` : `${has} **${ids.length}** ${noun}${sideText}:\n\n${list}`);
      } else {
        parts.push(ids.length === 1 ? `${owner} ${noun}${sideText} is ${item(ids[0])}.` : `${owner} ${noun}${sideText}:\n\n${list}`);
      }
    }

    if (relation === 'spouse') {
      const former = this.byName(getFormerSpouses(subjectId, links));
      if (ids.length === 0 && former.length > 0) {
        parts[0] = `${you ? 'You have' : `${this.bold(subjectId)} has`} no current spouse in the tree.`;
      }
      if (former.length > 0) parts.push(`Formerly married to ${former.map((id) => this.bold(id)).join(', ')}.`);
    }
    if (unknownGender.length > 0) {
      const who = unknownGender.map((id) => this.bold(id));
      const listed = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`;
      parts.push(`The tree does not record whether ${listed} ${who.length === 1 ? 'is' : 'are'} male or female, so they are not counted here.`);
    }
    return parts.join('\n\n');
  }

  /**
   * A note after each name where the kind alone does not say enough: which
   * side, for a list over both sides; what each in-law is.
   */
  private notes(subjectId: string, relation: ListRelation, side: ParentSide | null, ids: string[]): Map<string, string> {
    const notes = new Map<string, string>();
    const { links } = this.record;
    if (relation === 'in_laws') {
      for (const id of ids) {
        const relation = this.inLawOf(subjectId, id);
        if (relation) notes.set(id, this.term(relation, id));
      }
    } else if (USES_SIDE.has(relation) && side === null) {
      const kind = RELATIVE_KIND[relation];
      const mothers = new Set(getRelatives(subjectId, kind, links, { side: 'mother' }));
      const fathers = new Set(getRelatives(subjectId, kind, links, { side: 'father' }));
      for (const id of ids) {
        if (mothers.has(id) && fathers.has(id)) notes.set(id, 'both sides');
        else if (mothers.has(id)) notes.set(id, "mother's side");
        else if (fathers.has(id)) notes.set(id, "father's side");
      }
    }
    return notes;
  }

  /**
   * What `toId` is to `fromId` as a Kinship Term, blood first, then "also
   * related by marriage". Every path has a term, so this always answers.
   * A marriage path alone is "Related by marriage:" only when its term does
   * not already show the marriage (LIN-80).
   */
  howRelated(fromId: string, toId: string, bothNamed: boolean): string {
    const paths = findKinshipPaths(fromId, toId, this.record.links);
    if (paths.length === 0) {
      const [first, second] = bothNamed ? [toId, fromId] : [fromId, toId];
      return this.isSpeaker(first)
        ? `You and ${this.bold(second)} are not related in the family tree.`
        : `${this.bold(first)} and ${this.bold(second)} are not related in the family tree.`;
    }
    const you = this.isSpeaker(fromId);
    const owner = you ? 'your' : `${this.bold(fromId)}'s`;
    const sentence = (relation: KinshipRelation) => {
      const gender = getRecordedGender(toId, this.record.links, this.record.nodes);
      const arabic = relation.via ? null : this.arabicWord(relation.label, gender, relation.side);
      if (arabic && ARABIC_KINSHIP_WORDS[arabic].side) return `${this.bold(toId)} is ${owner} ${arabic}.`;
      const sideText = relation.side ? `, on ${you ? 'your' : 'the'} ${relation.side}'s side` : '';
      return `${this.bold(toId)} is ${owner} ${arabic ?? this.term(relation, toId)}${sideText}.`;
    };
    const [first, second] = paths;
    // A term that already says "step-", "-in-law" or the like needs no "Related by marriage:".
    const prefixed = first.kind === 'marriage' && !termShowsMarriage(first.relation);
    const parts = [prefixed ? `Related by marriage: ${sentence(first.relation)}` : sentence(first.relation)];
    if (second) parts.push(`Also related by marriage: ${sentence(second.relation)}`);
    return parts.join('\n\n');
  }
}
