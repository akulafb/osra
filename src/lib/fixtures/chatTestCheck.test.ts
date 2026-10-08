import { describe, expect, it } from 'vitest';
import { checkChatTestReply as checkReply } from './chatTestCheck';
import type { ChatTestQuestion } from './chatTestQuestions';

function question(
  expect: ChatTestQuestion['expect'],
  text = 'Who are my cousins on my dad\'s side?',
  group: ChatTestQuestion['group'] = 'relatives',
): ChatTestQuestion {
  return { id: 'q', group, question: text, expect };
}

/** A reply that cost a tenth of a cent, well under the cap. */
function checkChatTestReply(q: ChatTestQuestion, text: string, cost = 0.001) {
  return checkReply(q, { text, cost });
}

describe('checkChatTestReply', () => {
  it('passes a reply that names every expected Person and no other', () => {
    const q = question({ names: ['Rima Haddad', 'Yusuf Haddad'] });
    const result = checkChatTestReply(q, "Your cousins on your father's side:\n\n- **Rima Haddad**\n- **Yusuf Haddad**");
    expect(result).toEqual({ correct: true, problems: [] });
  });

  it('fails a reply that misses an expected Person', () => {
    const q = question({ names: ['Rima Haddad', 'Yusuf Haddad'] });
    const result = checkChatTestReply(q, 'Your cousin is **Rima Haddad**.');
    expect(result.correct).toBe(false);
    expect(result.problems).toEqual(['missing Yusuf Haddad']);
  });

  it('fails a reply that names a fixture Person not in the answer', () => {
    const q = question({ names: ['Rima Haddad'] });
    const result = checkChatTestReply(q, '- **Rima Haddad**\n- **Tala Mansour**');
    expect(result.problems).toEqual(['wrong name Tala Mansour']);
  });

  it('fails a reply that names a wrong Person by given name only, when no allowed Person has that name', () => {
    const q = question({ names: ['Sara Khoury'] }, 'Who is my amto?');
    expect(checkChatTestReply(q, 'Your aunts are **Sara** and **Walid**.').problems).toEqual(['missing Sara Khoury', 'wrong name Walid Aziz']);
    // "Yusuf" may be Rima's brother Yusuf Haddad, who is in the answer.
    const cousins = question({ names: ['Rima Haddad', 'Yusuf Haddad'] });
    expect(checkChatTestReply(cousins, '**Rima Haddad** and **Yusuf Haddad** (Yusuf is named for his grandfather).').correct).toBe(true);
  });

  it('allows the speaker, the Persons named in the question and the listed extras', () => {
    const q = question({ names: ['Jad Saleh', 'Nour Qasim'], allow: ['Karim Qasim'] }, "Who are Layla Haddad's children?");
    const reply = "**Layla Haddad**'s children: **Jad Saleh** and **Nour Qasim** (with **Karim Qasim**). Asked by **Maya Khoury**.";
    expect(checkChatTestReply(q, reply).correct).toBe(true);
  });

  it('reads names without case or bold, and not inside a longer word', () => {
    const q = question({ names: ['Hani Khoury'] });
    expect(checkChatTestReply(q, 'Your brother is hani khoury.').correct).toBe(true);
    expect(checkChatTestReply(q, 'Your brother is Hani Khourys.').correct).toBe(false);
  });

  it('checks a number as digits or as a word', () => {
    const q = question({ number: 4 }, 'How many grandchildren does Adel Mansour have?');
    expect(checkChatTestReply(q, 'Adel has **4** grandchildren.').correct).toBe(true);
    expect(checkChatTestReply(q, 'Adel has four grandchildren.').correct).toBe(true);
    expect(checkChatTestReply(q, 'Adel has 14 grandchildren.').problems).toEqual(['missing the number 4']);
  });

  it('checks relation words in the order given, and words that must not appear', () => {
    const q = question(
      { relations: [/first cousin/i, /married|husband|wife|spouse/i], forbid: [/second cousin/i] },
      'How are Omar Haddad and Sara Khoury related?',
    );
    expect(checkChatTestReply(q, 'Sara is his first cousin. Also related by marriage: his wife.').correct).toBe(true);
    expect(checkChatTestReply(q, 'Sara is his wife. She is also his first cousin.').problems).toEqual([
      'relation /married|husband|wife|spouse/i comes before /first cousin/i',
      'the Kinship Term does not come first: "wife" comes before it',
    ]);
    expect(checkChatTestReply(q, 'Sara is his second cousin, and his wife.').problems).toEqual([
      'missing relation /first cousin/i',
      'says /second cousin/i',
    ]);
  });

  it('checks that the reply asks which Person', () => {
    const q = question({ names: ['Omar Haddad', 'Omar Zaher'], asksWhich: true });
    expect(checkChatTestReply(q, 'Which Omar do you mean: **Omar Haddad** or **Omar Zaher**?').correct).toBe(true);
    expect(checkChatTestReply(q, '**Omar Haddad** and **Omar Zaher** both have children.').problems).toEqual([
      'does not ask which Person',
    ]);
  });

  it('checks that the reply says two Persons are not related', () => {
    const q = question({ notRelated: true }, 'How is Fuad Zaher related to Idris Haddad?');
    expect(checkChatTestReply(q, '**Fuad Zaher** and **Idris Haddad** are not related in the family tree.').correct).toBe(true);
    expect(checkChatTestReply(q, 'There is no Kinship Path between them.').correct).toBe(true);
    expect(checkChatTestReply(q, 'Fuad is his cousin.').problems).toEqual(['does not say they are not related']);
  });

  it('fails a reply that shows a Person id', () => {
    const q = question({ names: ['Hani Khoury'] });
    expect(checkChatTestReply(q, '**Hani Khoury** (fx-hani-khoury)').problems).toEqual(['shows a Person id']);
  });

  describe('the Kinship Term comes first', () => {
    const q = question({ relations: [/first cousin,? once removed/i] }, 'How is Rima Haddad related to Sami Khoury?', 'how_related');

    it('passes a reply that leads with the term', () => {
      expect(checkChatTestReply(q, "**Rima Haddad** is **Sami Khoury**'s first cousin once removed, on the father's side.").correct).toBe(true);
    });

    it('fails a reply that gives other kinship words before the term', () => {
      expect(checkChatTestReply(q, 'Through her mother, **Rima Haddad** is his first cousin once removed.').problems).toEqual([
        'the Kinship Term does not come first: "mother" comes before it',
      ]);
    });
  });

  describe('no Kinship Path spelled out', () => {
    const cousin = question({ relations: [/first cousin/i] }, 'How is Tala Mansour related to Omar Haddad?', 'how_related');

    it('passes a reply that gives only the term, with its side', () => {
      expect(checkChatTestReply(cousin, "**Tala Mansour** is **Omar Haddad**'s first cousin, on the mother's side.").correct).toBe(true);
    });

    it('fails a reply that chains kinship words step by step', () => {
      expect(checkChatTestReply(cousin, "**Tala Mansour** is **Omar Haddad**'s first cousin: his mother's brother's daughter.").problems).toEqual([
        'spells out the Kinship Path: "mother\'s brother"',
        'spells out the Kinship Path: "brother\'s daughter"',
      ]);
      expect(checkChatTestReply(cousin, '**Tala Mansour** is his first cousin, the daughter of his uncle.').problems).toEqual([
        'spells out the Kinship Path: "daughter of his uncle"',
      ]);
    });

    it('fails a reply that joins terms at a named Person when one term names the relation', () => {
      const nephew = question({ names: ['Sami Khoury'], allow: ['Hani Khoury'] }, 'Who are my nieces and nephews?');
      expect(checkChatTestReply(nephew, 'Your nephew is **Sami Khoury**, your brother **Hani Khoury**\'s son.').problems).toEqual([
        'spells out the Kinship Path: "brother Hani Khoury\'s son"',
      ]);
    });

    it('allows two Kinship Terms joined at one Person when the relation has no single term', () => {
      const twoTerms = question(
        { relations: [/first cousin,? once removed/i, /husband/i], allow: ['Layla Haddad'], joinedTerms: 2 },
        'How is Karim Qasim related to me?',
        'how_related',
      );
      expect(checkChatTestReply(twoTerms, "**Karim Qasim** is your first cousin once removed **Layla Haddad**'s husband.").correct).toBe(true);
      expect(
        checkChatTestReply(twoTerms, "**Karim Qasim** is your first cousin once removed **Layla Haddad**'s husband, your father's cousin.").problems,
      ).toEqual(['spells out the Kinship Path: "father\'s cousin"']);
    });

    it('allows more terms only as many as the relation needs, each joined at a named Person', () => {
      const joined = question(
        { relations: [/wife/i, /brother/i, /sister-in-law/i], allow: ['Rana Hakim', 'Samir Mansour'], joinedTerms: 3 },
        'How is Huda Mansour related to Samir Mansour?',
        'how_related',
      );
      const reply = "She is your wife **Rana Hakim**'s brother **Samir Mansour**'s sister-in-law.";
      expect(checkChatTestReply(joined, reply).correct).toBe(true);
      expect(checkChatTestReply({ ...joined, expect: { ...joined.expect, joinedTerms: 2 } }, reply).problems).toEqual([
        'spells out the Kinship Path: "brother Samir Mansour\'s sister-in-law"',
      ]);
    });
  });

  describe('no follow-up question or offer', () => {
    const q = question({ names: ['Hani Khoury'] }, 'Do I have a brother?');

    it('passes a reply that ends with the answer', () => {
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**.').correct).toBe(true);
    });

    it('fails a reply that asks a follow-up question or offers more', () => {
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**. Want to know about his children?').problems).toEqual([
        'asks a follow-up question',
      ]);
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**. Let me know if you need more.').problems).toEqual([
        'offers a follow-up: "Let me know"',
      ]);
    });

    it('allows a question when the reply must ask which Person', () => {
      const q = question({ names: ['Omar Haddad', 'Omar Zaher'], asksWhich: true }, "Who are Omar's children?");
      expect(checkChatTestReply(q, 'Which Omar do you mean: **Omar Haddad** or **Omar Zaher**?').correct).toBe(true);
    });
  });

  describe('length', () => {
    const q = question({ names: ['Hani Khoury'] }, 'Do I have a brother?');

    it('passes one or two lines, not counting a bulleted list', () => {
      const cousins = question({ names: ['Rima Haddad', 'Yusuf Haddad'] });
      expect(checkChatTestReply(cousins, "Your cousins on your father's side:\n\n- **Rima Haddad**\n- **Yusuf Haddad**\n\nThat is all the tree records.").correct).toBe(
        true,
      );
    });

    it('fails more than two lines for a question about a relative', () => {
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**.\n\nHe is older.\n\nHe has a son.').problems).toEqual([
        'is 3 lines; at most 2 for this question',
      ]);
    });

    it('allows an open question up to 150 words, and fails one longer', () => {
      const open = question({}, 'Tell me about the family', 'open');
      const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
      expect(checkChatTestReply(open, `${words(70)}.\n\n${words(70)}.\n\n${words(10)}.`).correct).toBe(true);
      expect(checkChatTestReply(open, `${words(100)}.\n\n${words(51)}.`).problems).toEqual(['is 151 words; at most 150 for an open question']);
    });
  });

  describe('cost', () => {
    const q = question({ names: ['Hani Khoury'] }, 'Do I have a brother?');

    it('passes a message that cost less than the cap, and fails one that cost the cap or more', () => {
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**.', 0.0099).correct).toBe(true);
      expect(checkChatTestReply(q, 'Your brother is **Hani Khoury**.', 0.01).problems).toEqual(['cost $0.01000, not under the cap of $0.01000']);
    });
  });
});
