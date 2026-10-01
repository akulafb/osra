import { describe, expect, it } from 'vitest';
import type {
  Gender,
  QuestionKind,
  Relation,
  Side,
  Subject,
} from '../../supabase/functions/family-chat/questionKind.ts';
import { routeMessage } from './chatRouting';
import { FIXTURE_IDS as P, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';

/** The signed-in user in these tests: Omar Haddad of the fixture tree. */
const OMAR = { personId: P.omar, displayName: 'Omar Haddad' };

interface Reading {
  relation: Relation;
  side?: Side;
  gender?: Gender;
  subject?: Subject;
  wantsCount?: boolean;
  /** Every answer's confidence, unless one is given below. */
  confidence?: number;
  lowConfidence?: Array<keyof QuestionKind>;
}

/** Jev's reading of a message, every answer at 0.9 unless named in `lowConfidence` (0.4). */
function reading({
  relation,
  side = 'both',
  gender = 'any',
  subject = 'speaker',
  wantsCount = false,
  confidence = 0.9,
  lowConfidence = [],
}: Reading): QuestionKind {
  const c = (key: keyof QuestionKind) => (lowConfidence.includes(key) ? 0.4 : confidence);
  return {
    relation: { value: relation, confidence: c('relation') },
    side: { value: side, confidence: c('side') },
    gender: { value: gender, confidence: c('gender') },
    subject: { value: subject, confidence: c('subject') },
    wantsCount: { value: wantsCount, confidence: c('wantsCount') },
  };
}

function route(message: string, questionKind: QuestionKind | null, speaker: typeof OMAR | null = OMAR) {
  return routeMessage({ message, questionKind, speaker, record: KINSHIP_FIXTURE_TREE });
}

describe('routeMessage: code answers the common kinds, with no model call', () => {
  it('parents: "Who is Rima\'s dad?"', () => {
    expect(route("Who is Rima's dad?", reading({ relation: 'parents', gender: 'male', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Rima Haddad**'s father is **Omar Haddad**.",
    });
  });

  it('children: "Who are Nabil\'s kids?"', () => {
    expect(route("Who are Nabil's kids?", reading({ relation: 'children', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Nabil Khoury**'s children:\n\n- **Hani Khoury**\n- **Maya Khoury**",
    });
  });

  it('siblings: "do I have a sister?"', () => {
    expect(route('do I have a sister?', reading({ relation: 'siblings', gender: 'female' }))).toEqual({
      by: 'code',
      answer: 'Your sister is **Layla Haddad**.',
    });
  });

  it('spouse: "Who is Karim married to?", ignoring a gender answer for the spouse', () => {
    expect(
      route('Who is Karim married to?', reading({ relation: 'spouse', gender: 'male', subject: 'named_person' })),
    ).toEqual({ by: 'code', answer: "**Karim Qasim**'s spouse is **Layla Haddad**." });
  });

  it('spouse: a former spouse comes after the current one', () => {
    expect(route('who did Tarek marry', reading({ relation: 'spouse', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: '**Tarek Saleh** has no current spouse in the tree.\n\nFormerly married to **Layla Haddad**.',
    });
  });

  it('grandparents: "my teta from my mother\'s side"', () => {
    expect(
      route("my teta from my mother's side - what is her name?", reading({ relation: 'grandparents', side: 'maternal', gender: 'female' })),
    ).toEqual({ by: 'code', answer: "Your teta on your mother's side is **Widad Sabbagh**." });
  });

  it('grandchildren: "how many grandkids does Idris have", with the total', () => {
    expect(
      route('how many grandkids does Idris have', reading({ relation: 'grandchildren', subject: 'named_person', wantsCount: true })),
    ).toEqual({
      by: 'code',
      answer:
        '**Idris Haddad** has **4** grandchildren:\n\n- **Layla Haddad**\n- **Nabil Khoury**\n- **Omar Haddad**\n- **Sara Khoury**',
    });
  });

  it('aunts and uncles: "who are my khalos", naming a relative whose gender the tree does not record', () => {
    expect(route('who are my khalos', reading({ relation: 'aunts_uncles', side: 'maternal', gender: 'male' }))).toEqual({
      by: 'code',
      answer:
        'Your khalo is **Samir Mansour**.\n\n' +
        'The tree does not record whether **Amal Mansour** is male or female, so they are not counted here.',
    });
  });

  it("reads a Person's recorded gender, so a childless aunt is counted", () => {
    const record = {
      ...KINSHIP_FIXTURE_TREE,
      nodes: KINSHIP_FIXTURE_TREE.nodes.map((node) => (node.id === P.amal ? { ...node, gender: 'female' as const } : node)),
    };
    const reply = (gender: Gender) =>
      routeMessage({
        message: 'who are my aunts on my mom side',
        questionKind: reading({ relation: 'aunts_uncles', side: 'maternal', gender }),
        speaker: OMAR,
        record,
      });
    expect(reply('female')).toEqual({ by: 'code', answer: "Your aunt on your mother's side is **Amal Mansour**." });
    expect(reply('male')).toEqual({ by: 'code', answer: "Your uncle on your mother's side is **Samir Mansour**." });
  });

  it("names a childless relative's Kinship Term from their recorded gender", () => {
    const record = {
      ...KINSHIP_FIXTURE_TREE,
      nodes: KINSHIP_FIXTURE_TREE.nodes.map((node) => (node.id === P.nour ? { ...node, gender: 'female' as const } : node)),
    };
    const reply = (tree: typeof record) =>
      routeMessage({ message: 'how am I related to Nour Qasim?', questionKind: reading({ relation: 'how_related' }), speaker: OMAR, record: tree });
    expect(reply(KINSHIP_FIXTURE_TREE)).toEqual({ by: 'code', answer: '**Nour Qasim** is your niece or nephew.' });
    expect(reply(record)).toEqual({ by: 'code', answer: '**Nour Qasim** is your niece.' });
  });

  it('aunts and uncles on both sides say which side each one is on', () => {
    expect(route('who are my aunts and uncles', reading({ relation: 'aunts_uncles' }))).toEqual({
      by: 'code',
      answer:
        "Your aunts and uncles:\n\n- **Amal Mansour** (mother's side)\n- **Khalil Haddad** (father's side)\n" +
        "- **Mariam Haddad** (father's side)\n- **Samir Mansour** (mother's side)",
    });
  });

  it('cousins: "how many cousins do I have on my mom\'s side?"', () => {
    expect(
      route("how many cousins do I have on my mom's side?", reading({ relation: 'cousins', side: 'maternal', wantsCount: true })),
    ).toEqual({
      by: 'code',
      answer: "You have **2** cousins on your mother's side:\n\n- **Tala Mansour**\n- **Ziad Mansour**",
    });
  });

  it('nieces and nephews: "who are my nieces and nephews"', () => {
    expect(route('who are my nieces and nephews', reading({ relation: 'nieces_nephews' }))).toEqual({
      by: 'code',
      answer: 'Your nieces and nephews:\n\n- **Jad Saleh**\n- **Nour Qasim**',
    });
  });

  it('in-laws: "who is my mother in law"', () => {
    expect(route('who is my mother in law', reading({ relation: 'in_laws', gender: 'female' }))).toEqual({
      by: 'code',
      answer: 'Your mother-in-law is **Mariam Haddad**.',
    });
  });

  it('in-laws: "who is Nabil\'s father in law" lists the father-in-law only, not every male in-law', () => {
    expect(route("who is Nabil's father in law", reading({ relation: 'in_laws', gender: 'male', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Nabil Khoury**'s father-in-law is **Bashir Aziz**.",
    });
  });

  it('in-laws of every kind say what each in-law is', () => {
    expect(route('who are my in-laws', reading({ relation: 'in_laws' }))).toEqual({
      by: 'code',
      answer:
        'Your in-laws:\n\n- **Faris Khoury** (father-in-law)\n- **Karim Qasim** (brother-in-law)\n' +
        '- **Mariam Haddad** (mother-in-law)\n- **Nabil Khoury** (brother-in-law)',
    });
  });

  it('how related: the blood relation first, then "also related by marriage"', () => {
    expect(
      // No speaker: Omar Haddad is the speaker elsewhere in these tests, and would be "your".
      route('How is Sara related to Omar Haddad?', reading({ relation: 'how_related', subject: 'named_person', gender: 'male' }), null),
    ).toEqual({
      by: 'code',
      answer:
        "**Sara Khoury** is **Omar Haddad**'s first cousin, on the father's side.\n\n" +
        "Also related by marriage: **Sara Khoury** is **Omar Haddad**'s wife.",
    });
  });

  it('how related to the speaker: "how am I related to Nabil?"', () => {
    expect(route('how am I related to Nabil?', reading({ relation: 'how_related' }))).toEqual({
      by: 'code',
      answer:
        "**Nabil Khoury** is your first cousin, on your father's side.\n\n" +
        'Also related by marriage: **Nabil Khoury** is your brother-in-law.',
    });
  });

  it('how related, at depth: a great-grandparent', () => {
    expect(route('How is Idris related to Rima?', reading({ relation: 'how_related', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Idris Haddad** is **Rima Haddad**'s great-grandfather, on the father's side.",
    });
  });

  it('how related, when no one word fits: two terms joined at a marriage, with no "Related by marriage:" before them', () => {
    expect(route('How is Nour related to Tarek?', reading({ relation: 'how_related', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Nour Qasim** is **Tarek Saleh**'s former wife **Layla Haddad**'s child.",
    });
  });

  it('how related through a marriage: a step-relation says so itself, with no "Related by marriage:"', () => {
    expect(route('How is Karim related to Jad?', reading({ relation: 'how_related', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: "**Karim Qasim** is **Jad Saleh**'s stepfather, on the mother's side.",
    });
  });

  it('how related through a marriage: an in-law says so itself, with no "Related by marriage:"', () => {
    expect(route('how am I related to Faris?', reading({ relation: 'how_related' }))).toEqual({
      by: 'code',
      answer: '**Faris Khoury** is your father-in-law.',
    });
  });

  it('how related, with the Arabic word the question used', () => {
    expect(route('how am I related to Samir, is he my khalo?', reading({ relation: 'how_related' }))).toEqual({
      by: 'code',
      answer: '**Samir Mansour** is your khalo.',
    });
    expect(route('how am I related to Idris, is he my jiddo?', reading({ relation: 'how_related' }))).toEqual({
      by: 'code',
      answer: "**Idris Haddad** is your jiddo, on your father's side.",
    });
    // Mariam is the father's sister: "khalto" (the mother's sister) does not fit, so the reply is in English.
    expect(route('how am I related to Mariam, my khalto?', reading({ relation: 'how_related' }))).toEqual({
      by: 'code',
      answer: "**Mariam Haddad** is your aunt, on your father's side.\n\nAlso related by marriage: **Mariam Haddad** is your mother-in-law.",
    });
  });

  it('a list with the Arabic word the question used: "who is my amto"', () => {
    expect(route('who is my amto', reading({ relation: 'aunts_uncles', side: 'paternal', gender: 'female' }))).toEqual({
      by: 'code',
      answer:
        'Your amto is **Mariam Haddad**.\n\n' +
        'The tree does not record whether **Khalil Haddad** is male or female, so they are not counted here.',
    });
  });

  it('how related: two Persons with no Kinship Path', () => {
    expect(route('is Hana related to Rima', reading({ relation: 'how_related', subject: 'named_person' }))).toEqual({
      by: 'code',
      answer: '**Hana Rahhal** and **Rima Haddad** are not related in the family tree.',
    });
  });

  it('a relative kind with none recorded', () => {
    expect(route('who are my grandchildren', reading({ relation: 'grandchildren' }))).toEqual({
      by: 'code',
      answer: 'The tree has no grandchildren recorded for you.',
    });
  });
});

describe('routeMessage: everything else goes to the model with tools', () => {
  it('a message Jev marks other', () => {
    expect(route('hello!', reading({ relation: 'other', subject: 'nobody' }))).toEqual({ by: 'model', why: 'other' });
  });

  it('no reading at all (TypeSafe off or failing)', () => {
    expect(route('who are my cousins', null)).toEqual({ by: 'model', why: 'no_reading' });
  });

  it('an answer the code uses below the 0.5 gate', () => {
    for (const low of ['relation', 'subject', 'side', 'gender', 'wantsCount'] as const) {
      expect(route('who are my cousins', reading({ relation: 'cousins', gender: 'male', lowConfidence: [low] }))).toEqual({
        by: 'model',
        why: 'low_confidence',
      });
    }
  });

  it('a low answer the code does not use for this kind does not matter', () => {
    // Side is not used for children; gender is not used for a spouse.
    expect(route("Who are Nabil's kids?", reading({ relation: 'children', subject: 'named_person', lowConfidence: ['side'] })).by).toBe('code');
    expect(route('Who is Karim married to?', reading({ relation: 'spouse', subject: 'named_person', lowConfidence: ['gender'] })).by).toBe('code');
  });

  it('a name with two matches, so the model asks which one', () => {
    expect(route("Who are Layla's children?", reading({ relation: 'children', subject: 'named_person' }))).toEqual({
      by: 'model',
      why: 'person_ambiguous',
    });
  });

  it('two Persons with the same display name', () => {
    expect(route("Who are Yusuf Haddad's kids?", reading({ relation: 'children', subject: 'named_person' }))).toEqual({
      by: 'model',
      why: 'person_ambiguous',
    });
  });

  it('a name with no match', () => {
    expect(route("Who are Basel's kids?", reading({ relation: 'children', subject: 'named_person' }))).toEqual({
      by: 'model',
      why: 'person_not_found',
    });
  });

  it('a side named by a family name ("the Mansour side")', () => {
    expect(
      route("who are Rima's aunts on the Pharoan side", reading({ relation: 'aunts_uncles', side: 'family_name', gender: 'female', subject: 'named_person' })),
    ).toEqual({ by: 'model', why: 'side_by_family_name' });
    // Named by a cluster in the tree, the cluster is a second name, and Jev's side is not trusted.
    expect(
      route("who are Rima's aunts on the Mansour side", reading({ relation: 'aunts_uncles', side: 'maternal', gender: 'female', subject: 'named_person' })).by,
    ).toBe('model');
  });

  it('a question about "me" from an account with no Person', () => {
    expect(route('who are my cousins', reading({ relation: 'cousins' }), null)).toEqual({ by: 'model', why: 'speaker_unknown' });
  });

  it('a question about "me" that also names someone ("is Nabil my cousin?")', () => {
    expect(route('is Nabil my cousin?', reading({ relation: 'cousins' })).by).toBe('model');
  });

  it('subject nobody with a relative kind', () => {
    expect(route('who are the cousins', reading({ relation: 'cousins', subject: 'nobody' })).by).toBe('model');
  });
});
