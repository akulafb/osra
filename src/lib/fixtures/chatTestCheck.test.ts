import { describe, expect, it } from 'vitest';
import { checkChatTestReply } from './chatTestCheck';
import type { ChatTestQuestion } from './chatTestQuestions';

function question(expect: ChatTestQuestion['expect'], text = 'Who are my cousins on my dad\'s side?'): ChatTestQuestion {
  return { id: 'q', group: 'relatives', question: text, expect };
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
});
