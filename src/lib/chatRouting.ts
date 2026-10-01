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
 *   as many Persons as the question needs;
 * - the code has a name for the relation (a Kinship Path no fixed rule names
 *   goes to the model, decision 10 of LIN-31).
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
  type KinshipPath,
  type KinshipRelation,
  type KinshipSide,
  type RecordedGender,
  type RelativeKind,
} from './familyGraph';
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
  | 'names_do_not_fit'
  | 'relation_unnamed';

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
    'teta sitto sitti jiddo jeddo seedo khalo khalos khalto khaltos khala ammo ammos amto amtos amme ' +
    'maternal paternal'
  ).split(' '),
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

  const reply = new Reply(record, speaker?.personId ?? null);

  if (relation === 'how_related') {
    // "How is A related to B": what A is to B. With one name, the other is the speaker.
    let pair: [from: string, to: string];
    if (persons.length === 2) pair = [persons[1], persons[0]];
    else if (persons.length === 1 && firstPerson) {
      if (!speaker) return { by: 'model', why: 'speaker_unknown' };
      pair = [speaker.personId, persons[0]];
    } else return { by: 'model', why: 'names_do_not_fit' };
    if (pair[0] === pair[1]) return { by: 'model', why: 'names_do_not_fit' };
    const answer = reply.howRelated(pair[0], pair[1], persons.length === 2);
    return answer === null ? { by: 'model', why: 'relation_unnamed' } : { by: 'code', answer };
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

/** Labels for a relation the code has named, by the recorded gender of the relative. */
const GENDERED: Partial<Record<string, Record<RecordedGender, string>>> = {
  parent: { male: 'father', female: 'mother' },
  child: { male: 'son', female: 'daughter' },
  sibling: { male: 'brother', female: 'sister' },
  'half-sibling': { male: 'half-brother', female: 'half-sister' },
  spouse: { male: 'husband', female: 'wife' },
  'former spouse': { male: 'former husband', female: 'former wife' },
  grandparent: { male: 'grandfather', female: 'grandmother' },
  grandchild: { male: 'grandson', female: 'granddaughter' },
  'aunt or uncle': { male: 'uncle', female: 'aunt' },
  'niece or nephew': { male: 'nephew', female: 'niece' },
  'step-parent': { male: 'stepfather', female: 'stepmother' },
  'step-child': { male: 'stepson', female: 'stepdaughter' },
  'parent-in-law': { male: 'father-in-law', female: 'mother-in-law' },
  'sibling-in-law': { male: 'brother-in-law', female: 'sister-in-law' },
  'child-in-law': { male: 'son-in-law', female: 'daughter-in-law' },
};

/** The reply text, in the model's style: bold names, a bulleted list, the total for a count. */
class Reply {
  private readonly names: Map<string, string>;
  private readonly record: ChatRecord;
  private readonly speakerId: string | null;

  constructor(record: ChatRecord, speakerId: string | null) {
    this.record = record;
    this.speakerId = speakerId;
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

  /** "first cousin" as "aunt" or "mother-in-law" when the record shows the relative's gender. */
  private label(relation: KinshipRelation, personId: string): string {
    const gender = getRecordedGender(personId, this.record.links, this.record.nodes);
    return (gender && GENDERED[relation.label]?.[gender]) ?? relation.label;
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
    const sideText = side ? ` on ${you ? 'your' : 'the'} ${side}'s side` : '';
    const [one, many] = inLaw ? IN_LAW_NOUNS[inLaw][gender] : NOUNS[relation][gender];
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
        if (relation) notes.set(id, this.label(relation, id));
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
   * What `toId` is to `fromId`, blood first, then "also related by marriage".
   * Null when the code has no name for a path: the model names it.
   */
  howRelated(fromId: string, toId: string, bothNamed: boolean): string | null {
    const paths = findKinshipPaths(fromId, toId, this.record.links);
    if (paths.length === 0) {
      const [first, second] = bothNamed ? [toId, fromId] : [fromId, toId];
      return this.isSpeaker(first)
        ? `You and ${this.bold(second)} are not related in the family tree.`
        : `${this.bold(first)} and ${this.bold(second)} are not related in the family tree.`;
    }
    const named: Array<{ kind: KinshipPath['kind']; relation: KinshipRelation }> = [];
    for (const path of paths) {
      if (!path.relation) return null;
      named.push({ kind: path.kind, relation: path.relation });
    }

    const you = this.isSpeaker(fromId);
    const owner = you ? 'your' : `${this.bold(fromId)}'s`;
    const sentence = (relation: KinshipRelation) => {
      const sideText = relation.side ? `, on ${you ? 'your' : 'the'} ${relation.side}'s side` : '';
      return `${this.bold(toId)} is ${owner} ${this.label(relation, toId)}${sideText}.`;
    };
    const [first, second] = named;
    const parts = [first.kind === 'marriage' ? `Related by marriage: ${sentence(first.relation)}` : sentence(first.relation)];
    if (second) parts.push(`Also related by marriage: ${sentence(second.relation)}`);
    return parts.join('\n\n');
  }
}
