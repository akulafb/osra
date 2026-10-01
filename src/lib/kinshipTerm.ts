/**
 * The words of a Kinship Term (CONTEXT.md): the everyday word for what one
 * Person is to another. `nameKinshipPath` in `familyGraph.ts` reads the shape
 * of a Kinship Path and builds the neutral word here ("niece or nephew",
 * "great-grandparent"); `genderedLabel` turns it into the gendered word when
 * the Person's gender is recorded.
 */
import type { KinshipRelation, RecordedGender } from './familyGraph';

const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const TIMES_WORDS = ['once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times', 'eight times', 'nine times', 'ten times'];

/** "3rd", "11th", "22nd". */
function ordinalNumber(n: number): string {
  const lastTwo = n % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** "", "great-", "great-great-", then "3rd great-" as genealogists write it. */
function greats(n: number): string {
  if (n <= 0) return '';
  return n <= 2 ? 'great-'.repeat(n) : `${ordinalNumber(n)} great-`;
}

/** Applies `change` to each word of an "aunt or uncle" pair, or to the one word. */
export function eachWord(label: string, change: (word: string) => string): string {
  return label.split(' or ').map(change).join(' or ');
}

/** The cousin term for a degree (1 is first) and times removed. */
function cousinLabel(degree: number, removed: number): string {
  const ordinal = ORDINAL_WORDS[degree - 1] ?? ordinalNumber(degree);
  const times = removed === 0 ? '' : ` ${TIMES_WORDS[removed - 1] ?? `${removed} times`} removed`;
  return `${ordinal} cousin${times}`;
}

/**
 * The neutral Kinship Term for a blood relative reached `up` generations up
 * to a shared ancestor and `down` generations down from them. Half-siblings
 * are told apart by the caller, which can see the parents.
 */
export function bloodLabel(up: number, down: number): string {
  if (down === 0) return up === 1 ? 'parent' : `${greats(up - 2)}grandparent`;
  if (up === 0) return down === 1 ? 'child' : `${greats(down - 2)}grandchild`;
  if (up === 1 && down === 1) return 'sibling';
  if (down === 1) return eachWord('aunt or uncle', (word) => `${greats(up - 2)}${word}`);
  if (up === 1) {
    if (down === 2) return 'niece or nephew';
    return eachWord('niece or nephew', (word) => `${greats(down - 3)}grand${word}`);
  }
  return cousinLabel(Math.min(up, down) - 1, Math.abs(up - down));
}

const GENDERED_WORDS: Record<string, Record<RecordedGender, string>> = {
  grandparent: { female: 'grandmother', male: 'grandfather' },
  parent: { female: 'mother', male: 'father' },
  grandchild: { female: 'granddaughter', male: 'grandson' },
  child: { female: 'daughter', male: 'son' },
  sibling: { female: 'sister', male: 'brother' },
  spouse: { female: 'wife', male: 'husband' },
};

/** Step words English writes as one word: "stepmother", not "step-mother". */
const CLOSED_STEP_WORDS = /\bstep-(mother|father|son|daughter|brother|sister)\b/g;

/**
 * The gendered word for a neutral Kinship Term: "great-aunt or great-uncle" is
 * "great-aunt" for a woman, "parent-in-law" is "father-in-law" for a man. With
 * no recorded gender the neutral word is kept.
 */
export function genderedLabel(label: string, gender: RecordedGender | null): string {
  if (!gender) return label;
  return label
    .replace(/((?:\d+(?:st|nd|rd|th) )?\S*?)(aunt|niece)(\S*) or \1(uncle|nephew)\3/g, (_, before: string, female: string, after: string, male: string) =>
      `${before}${gender === 'female' ? female : male}${after}`,
    )
    .replace(/(?<!\p{L})(grandparent|parent|grandchild|child|sibling|spouse)(?!\p{L})/gu, (word: string) => GENDERED_WORDS[word][gender])
    .replace(CLOSED_STEP_WORDS, 'step$1');
}

/**
 * The Kinship Term as it is said: what `toId` is, in gendered words where the
 * gender is recorded. A relation no one word names is two terms joined by one
 * Person: "sister **May Badran**'s stepson", or, only when two do not fit,
 * more terms joined the same way. The side is not included.
 */
export function kinshipTermText(
  relation: KinshipRelation,
  toId: string,
  { genderOf, nameOf }: { genderOf: (personId: string) => RecordedGender | null; nameOf: (personId: string) => string },
): string {
  if (!relation.via) return genderedLabel(relation.label, genderOf(toId));
  const { personId, first, second } = relation.via;
  return `${genderedLabel(first.label, genderOf(personId))} ${nameOf(personId)}'s ${kinshipTermText(second, toId, { genderOf, nameOf })}`;
}
