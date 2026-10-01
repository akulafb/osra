/**
 * The chat test questions (LIN-74): 20 questions on the made-up test tree in
 * `kinshipFixtureTree.ts`, each with one answer that can be checked exactly.
 *
 * `scripts/chat-questions/run.ts` asks each one through the family chat with
 * the real services and checks the reply with `checkChatTestReply`. It is not
 * part of `npm test`; `chatTestQuestions.test.ts` is, and checks that every
 * expected answer here is what the tree says.
 *
 * The signed-in Person is Maya Khoury: "I", "me" and "my" mean her.
 */
import { FIXTURE_IDS } from './kinshipFixtureTree';

/** The Person the test account has claimed. */
export const CHAT_TEST_SPEAKER = { personId: FIXTURE_IDS.maya, displayName: 'Maya Khoury' } as const;

export type ChatTestGroup =
  | 'relatives'
  | 'count'
  | 'how_related'
  | 'married_cousins'
  | 'two_matches'
  | 'no_path'
  | 'arabic';

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
    id: 'my-paternal-cousins',
    group: 'relatives',
    question: "Who are my cousins on my dad's side?",
    expect: { names: ['Yusuf Haddad', 'Rima Haddad'] },
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
    expect: { number: 41 },
  },

  // How two Persons are related.
  {
    id: 'cousin',
    group: 'how_related',
    question: 'How is Tala Mansour related to Omar Haddad?',
    expect: {
      relations: [/first cousin/i],
      forbid: [/second cousin/i, /once removed/i],
      allow: ['Huda Mansour', 'Samir Mansour', 'Adel Mansour', 'Widad Sabbagh'],
    },
  },
  {
    id: 'in-law',
    group: 'how_related',
    question: 'How is Faris Khoury related to Dina Aziz?',
    expect: { relations: [/father[\s-]in[\s-]law|parent[\s-]in[\s-]law/i], allow: ['Nabil Khoury'] },
  },
  {
    id: 'step',
    group: 'how_related',
    question: 'How is Karim Qasim related to Jad Saleh?',
    expect: { relations: [/step[\s-]?(father|parent)/i], allow: ['Layla Haddad', 'Tarek Saleh'] },
  },
  {
    id: 'once-removed',
    group: 'how_related',
    question: 'How is Rima Haddad related to Sami Khoury?',
    expect: {
      relations: [/first cousin,? once removed/i],
      forbid: [/second cousin/i],
      allow: ['Sara Khoury', 'Faris Khoury', 'Mariam Haddad', 'Nabil Khoury', 'Hani Khoury', 'Omar Haddad'],
    },
  },

  // Two married cousins: the blood relation first, then the marriage.
  {
    id: 'married-cousins',
    group: 'married_cousins',
    question: 'How are Omar Haddad and Sara Khoury related?',
    expect: {
      relations: [/first cousin/i, /married|husband|wife|spouse/i],
      forbid: [/second cousin/i],
      allow: ['Yusuf Haddad', 'Mariam Haddad', 'Idris Haddad', 'Salma Darwish', 'Huda Mansour', 'Faris Khoury'],
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
    expect: { names: ['Sara Khoury'], allow: ['Nabil Khoury'] },
  },
  {
    id: 'jiddo-mama-side',
    group: 'arabic',
    question: "Who is my jiddo on my mama's side?",
    // The mother's father. Faris Khoury, the father's father, is a wrong name.
    expect: { names: ['Bashir Aziz'], allow: ['Dina Aziz'] },
  },
];
