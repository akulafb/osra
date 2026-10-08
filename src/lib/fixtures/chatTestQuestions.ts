/**
 * The chat test questions (LIN-74, LIN-81): questions on the made-up chat
 * test tree (`CHAT_TEST_TREE` in `kinshipFixtureTree.ts`), each with one
 * answer that can be checked exactly.
 *
 * `scripts/chat-questions/run.ts` asks each one through the family chat with
 * the real services and checks the reply with `checkChatTestReply`. It is not
 * part of `npm test`; `chatTestQuestions.test.ts` is, and checks that every
 * expected answer here is what the tree says.
 *
 * The signed-in Person is Maya Khoury: "I", "me" and "my" mean her.
 */
import { CHAT_TEST_IDS } from './kinshipFixtureTree';

/** The Person the test account has claimed. */
export const CHAT_TEST_SPEAKER = { personId: CHAT_TEST_IDS.maya, displayName: 'Maya Khoury' } as const;

export type ChatTestGroup =
  | 'relatives'
  | 'count'
  | 'how_related'
  | 'married_cousins'
  | 'two_matches'
  | 'no_path'
  | 'arabic'
  /** "Tell me about the family": up to 150 words, where every other reply is one or two lines. */
  | 'open';

/**
 * What a correct reply holds. Every check given must pass. Names are display
 * names ("Given name Cluster"). A reply may name the speaker, the Persons the
 * question names, `names` and `allow`; any other fixture Person is a wrong name.
 */
export interface ChatTestExpect {
  /** Persons the reply must name. */
  names?: string[];
  /** Persons the reply may name besides those, such as the Persons on a Kinship Path. */
  allow?: string[];
  /** A number the reply must give, as digits or as a word. */
  number?: number;
  /** Relation words the reply must hold, each first found after the one before. */
  relations?: RegExp[];
  /** Words a correct reply does not hold, such as a wrong relation. */
  forbid?: RegExp[];
  /** The reply asks which Person the user means. */
  asksWhich?: true;
  /** The reply says the two Persons are not related. */
  notRelated?: true;
  /**
   * The reply is "No." and nothing more: no other Kinship Term, and no list of
   * the Persons the word does fit (LIN-88).
   */
  answersNo?: true;
  /**
   * How many Kinship Terms the expected term joins at named Persons, when no
   * one term names the relation: 2 for "your first cousin once removed
   * **Layla Haddad**'s husband". One when not given.
   */
  joinedTerms?: number;
}

export interface ChatTestQuestion {
  /** Short and unique, for the printed table. */
  id: string;
  group: ChatTestGroup;
  question: string;
  expect: ChatTestExpect;
}

export const CHAT_TEST_QUESTIONS: readonly ChatTestQuestion[] = [
  // Each relative kind, with side and gender.
  {
    id: 'my-parents',
    group: 'relatives',
    question: 'Who are my parents?',
    expect: { names: ['Nabil Khoury', 'Dina Aziz'] },
  },
  {
    id: 'my-brother',
    group: 'relatives',
    question: 'Do I have a brother?',
    expect: { names: ['Hani Khoury'] },
  },
  {
    id: 'my-nieces-nephews',
    group: 'relatives',
    question: 'Who are my nieces and nephews?',
    expect: { names: ['Lara Khoury', 'Sami Khoury'], allow: ['Hani Khoury', 'Joumana Saab'] },
  },
  {
    id: 'my-paternal-grandparents',
    group: 'relatives',
    question: "Who are my grandparents on my father's side?",
    expect: { names: ['Faris Khoury', 'Mariam Haddad'] },
  },
  {
    id: 'layla-children',
    group: 'relatives',
    question: "Who are Layla Haddad's children?",
    // Jad is from her divorced marriage to Tarek, Nour from her marriage to Karim.
    expect: { names: ['Jad Saleh', 'Nour Qasim'], allow: ['Tarek Saleh', 'Karim Qasim'] },
  },
  {
    id: 'idris-granddaughters',
    group: 'relatives',
    question: "Who are Idris Haddad's granddaughters?",
    // The grandsons Omar Haddad and Nabil Khoury are wrong names.
    expect: { names: ['Layla Haddad', 'Sara Khoury'], allow: ['Yusuf Haddad', 'Mariam Haddad'] },
  },
  {
    id: 'tala-paternal-cousins',
    group: 'relatives',
    question: "Who are Tala Mansour's cousins on her father's side?",
    expect: { names: ['Omar Haddad', 'Layla Haddad'], allow: ['Samir Mansour', 'Huda Mansour'] },
  },
  {
    id: 'karim-spouse',
    group: 'relatives',
    question: 'Who is Karim Qasim married to?',
    expect: { names: ['Layla Haddad'] },
  },

  // Counts.
  {
    id: 'adel-grandchildren-count',
    group: 'count',
    question: 'How many grandchildren does Adel Mansour have?',
    expect: {
      number: 4,
      names: ['Omar Haddad', 'Layla Haddad', 'Tala Mansour', 'Ziad Mansour'],
      allow: ['Huda Mansour', 'Samir Mansour'],
    },
  },
  {
    id: 'my-cousins-count',
    group: 'count',
    question: 'How many cousins do I have?',
    // Both on the father's side; Walid Aziz, the mother's brother, has no children.
    expect: { number: 2, names: ['Yusuf Haddad', 'Rima Haddad'], allow: ['Sara Khoury', 'Walid Aziz'] },
  },
  {
    id: 'tree-size',
    group: 'count',
    question: 'How many people are in the family tree?',
    expect: { number: 43 },
  },

  // How two Persons are related.
  {
    id: 'cousin',
    group: 'how_related',
    question: 'How is Tala Mansour related to Omar Haddad?',
    expect: {
      relations: [/first cousin/i],
      forbid: [/second cousin/i, /once removed/i],
    },
  },
  {
    id: 'in-law',
    group: 'how_related',
    question: 'How is Faris Khoury related to Dina Aziz?',
    expect: { relations: [/father[\s-]in[\s-]law/i] },
  },
  {
    id: 'step',
    group: 'how_related',
    question: 'How is Karim Qasim related to Jad Saleh?',
    expect: { relations: [/step[\s-]?father/i] },
  },
  {
    id: 'once-removed',
    group: 'how_related',
    question: 'How is Rima Haddad related to Sami Khoury?',
    expect: {
      relations: [/first cousin,? once removed/i],
      forbid: [/second cousin/i],
    },
  },

  {
    id: 'niece-both-parents',
    group: 'how_related',
    question: 'How is Lara Khoury related to me?',
    expect: { relations: [/\bniece\b/i], forbid: [/nephew/i, /in[\s-]law/i, /\bstep/i] },
  },
  {
    id: 'great-grandparent',
    group: 'how_related',
    question: 'How is Idris Haddad related to me?',
    expect: { relations: [/great[\s-]grandfather/i], forbid: [/great[\s-]great/i, /grandparent/i] },
  },
  {
    id: 'great-aunt',
    group: 'how_related',
    question: 'How is Amal Mansour related to Rima Haddad?',
    expect: { relations: [/great[\s-]aunt/i], forbid: [/great[\s-]uncle/i, /great[\s-]great/i] },
  },
  {
    id: 'third-cousin',
    group: 'how_related',
    question: 'How is Lina Saleh related to Sami Khoury?',
    expect: { relations: [/third cousin/i], forbid: [/removed/i, /second cousin/i] },
  },
  {
    id: 'step-grandchild',
    group: 'how_related',
    question: 'How is Lina Saleh related to Karim Qasim?',
    expect: { relations: [/step[\s-]?granddaughter/i], forbid: [/grandson/i, /grandchild/i] },
  },
  {
    id: 'son-in-law',
    group: 'how_related',
    question: 'How is Karim Qasim related to Huda Mansour?',
    expect: { relations: [/son[\s-]in[\s-]law/i], forbid: [/\bstep/i] },
  },
  {
    id: 'two-terms',
    group: 'how_related',
    question: 'How is Karim Qasim related to me?',
    expect: { relations: [/first cousin,? once removed/i, /husband/i], allow: ['Layla Haddad'], joinedTerms: 2 },
  },
  {
    id: 'no-gender',
    group: 'how_related',
    question: 'How is Ziad Mansour related to Samir Mansour?',
    expect: { relations: [/\bchild\b/i], forbid: [/\bson\b/i, /\bdaughter\b/i] },
  },

  // Two married cousins: the blood relation first, then the marriage.
  {
    id: 'married-cousins',
    group: 'married_cousins',
    question: 'How are Omar Haddad and Sara Khoury related?',
    expect: {
      relations: [/first cousin/i, /married|husband|wife|spouse/i],
      forbid: [/second cousin/i],
    },
  },

  // A name with two matches: the chat asks which Person.
  {
    id: 'two-omars',
    group: 'two_matches',
    question: "Who are Omar's children?",
    // Each Omar may be shown with his father's name. Rima Haddad, Omar Haddad's daughter, is a wrong name.
    expect: { names: ['Omar Haddad', 'Omar Zaher'], asksWhich: true, allow: ['Yusuf Haddad', 'Munir Zaher'] },
  },

  // Two Persons with no Kinship Path.
  {
    id: 'no-path',
    group: 'no_path',
    question: 'How is Fuad Zaher related to Idris Haddad?',
    expect: { notRelated: true },
  },

  // Arabic kinship words.
  {
    id: 'amto',
    group: 'arabic',
    question: 'Who is my amto?',
    // The father's sister. Walid Aziz, the mother's brother, is a wrong name.
    expect: { names: ['Sara Khoury'], relations: [/\bamto\b/i], allow: ['Nabil Khoury'] },
  },
  {
    id: 'jiddo-mama-side',
    group: 'arabic',
    question: "Who is my jiddo on my mama's side?",
    // The mother's father. Faris Khoury, the father's father, is a wrong name.
    expect: { names: ['Bashir Aziz'], relations: [/\bjiddo\b/i], allow: ['Dina Aziz'] },
  },
  {
    id: 'is-he-my-khalo',
    group: 'arabic',
    question: 'Is Walid Aziz my khalo?',
    expect: { relations: [/\bkhalo\b/i] },
  },
  {
    id: 'fathers-sister-as-khalto',
    group: 'arabic',
    question: 'Is Sara Khoury my khalto?',
    expect: { answersNo: true },
  },

  {
    id: 'about-the-family',
    group: 'open',
    question: 'Tell me about the family',
    expect: { number: 43, allow: ['Idris Haddad', 'Salma Darwish', 'Adel Mansour'] },
  },
  {
    id: 'haddad-family',
    group: 'open',
    question: 'Explain the Haddad family',
    expect: { number: 8, allow: ['Idris Haddad'] },
  },
];
