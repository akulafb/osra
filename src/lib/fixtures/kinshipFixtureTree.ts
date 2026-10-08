/**
 * A made-up Tree Record of 41 Persons, used by the Kinship Path tests and by
 * the chat test questions. No Person here is real.
 *
 * Main tree (Haddad / Khoury / Mansour), oldest generation first:
 *
 *   Idris Haddad + Salma Darwish
 *   ├─ Yusuf Haddad + Huda Mansour
 *   │  ├─ Omar Haddad   (married to his cousin Sara Khoury)
 *   │  │  ├─ Yusuf Haddad  (same display name as his grandfather)
 *   │  │  └─ Rima Haddad
 *   │  └─ Layla Haddad
 *   │     ├─ with Tarek Saleh (divorced): Jad Saleh
 *   │     │     └─ Lina Saleh  (only her father Jad is recorded)
 *   │     │  (Tarek's parent Majed Saleh is recorded with no parent_role)
 *   │     └─ with Karim Qasim (married):  Nour Qasim
 *   ├─ Mariam Haddad + Faris Khoury   (Faris: son of Jamil Khoury + Nadia Tabbara)
 *   │  ├─ Sara Khoury   (married to her cousin Omar Haddad)
 *   │  └─ Nabil Khoury + Dina Aziz    (Dina: only her father Bashir Aziz is recorded)
 *   │     ├─ Hani Khoury
 *   │     │  └─ Sami Khoury  (only his father is recorded)
 *   │     └─ Maya Khoury
 *   └─ Khalil Haddad   (no spouse, no children)
 *
 *   Adel Mansour + Widad Sabbagh
 *   ├─ Huda Mansour   (above)
 *   ├─ Samir Mansour + Rana Hakim
 *   │  ├─ Tala Mansour
 *   │  └─ Ziad Mansour
 *   └─ Amal Mansour   (no spouse, no children)
 *
 *   Bashir Aziz
 *   ├─ Dina Aziz   (above)
 *   └─ Walid Aziz
 *
 * Island (no Kinship Path to the main tree):
 *
 *   Fuad Zaher
 *   └─ Munir Zaher + Ghada Najjar
 *      ├─ Omar Zaher + Dalia Farah   (same given name as Omar Haddad)
 *      └─ Layla Zaher                (same given name as Layla Haddad)
 *
 * Alone (no Kinship Link at all): Hana Rahhal
 *
 * Hard cases and where they are:
 * - Cousin marriage, two Kinship Paths: Omar Haddad and Sara Khoury.
 * - Divorce and second marriage with children from both: Layla Haddad.
 * - Same given name, different clusters: Omar (Haddad, Zaher), Layla (Haddad, Zaher).
 * - Same display name: the two Yusuf Haddad.
 * - Four generations in one line: Idris, Yusuf, Omar, Yusuf (five through Mariam to Sami).
 * - One parent recorded: Dina Aziz, Walid Aziz, Sami Khoury, Lina Saleh, Munir Zaher.
 * - No parents recorded: Idris Haddad, Karim Qasim, Hana Rahhal and others.
 * - No Kinship Path to a second Person: anyone on the island, or Hana Rahhal.
 */
import type { FamilyGraph, FamilyLink, FamilyNode, PersonGender } from '../../types/graph';

function person(id: string, firstName: string, familyCluster: string): FamilyNode {
  return { id, firstName, familyCluster };
}

/** Ids of the fixture Persons, by a readable key. */
export const FIXTURE_IDS = {
  idris: 'fx-idris-haddad',
  salma: 'fx-salma-darwish',
  yusuf: 'fx-yusuf-haddad-elder',
  mariam: 'fx-mariam-haddad',
  khalil: 'fx-khalil-haddad',
  huda: 'fx-huda-mansour',
  faris: 'fx-faris-khoury',
  omar: 'fx-omar-haddad',
  layla: 'fx-layla-haddad',
  sara: 'fx-sara-khoury',
  nabil: 'fx-nabil-khoury',
  yusufJr: 'fx-yusuf-haddad-younger',
  rima: 'fx-rima-haddad',
  tarek: 'fx-tarek-saleh',
  jad: 'fx-jad-saleh',
  karim: 'fx-karim-qasim',
  nour: 'fx-nour-qasim',
  adel: 'fx-adel-mansour',
  widad: 'fx-widad-sabbagh',
  samir: 'fx-samir-mansour',
  amal: 'fx-amal-mansour',
  rana: 'fx-rana-hakim',
  tala: 'fx-tala-mansour',
  ziad: 'fx-ziad-mansour',
  dina: 'fx-dina-aziz',
  bashir: 'fx-bashir-aziz',
  walid: 'fx-walid-aziz',
  hani: 'fx-hani-khoury',
  maya: 'fx-maya-khoury',
  sami: 'fx-sami-khoury',
  jamil: 'fx-jamil-khoury',
  nadia: 'fx-nadia-tabbara',
  fuad: 'fx-fuad-zaher',
  munir: 'fx-munir-zaher',
  ghada: 'fx-ghada-najjar',
  omarZaher: 'fx-omar-zaher',
  laylaZaher: 'fx-layla-zaher',
  dalia: 'fx-dalia-farah',
  hana: 'fx-hana-rahhal',
  majed: 'fx-majed-saleh',
  lina: 'fx-lina-saleh',
} as const;

const P = FIXTURE_IDS;

export const FIXTURE_PERSONS: FamilyNode[] = [
  person(P.idris, 'Idris', 'Haddad'),
  person(P.salma, 'Salma', 'Darwish'),
  person(P.yusuf, 'Yusuf', 'Haddad'),
  person(P.mariam, 'Mariam', 'Haddad'),
  person(P.khalil, 'Khalil', 'Haddad'),
  person(P.huda, 'Huda', 'Mansour'),
  person(P.faris, 'Faris', 'Khoury'),
  person(P.omar, 'Omar', 'Haddad'),
  person(P.layla, 'Layla', 'Haddad'),
  person(P.sara, 'Sara', 'Khoury'),
  person(P.nabil, 'Nabil', 'Khoury'),
  person(P.yusufJr, 'Yusuf', 'Haddad'),
  person(P.rima, 'Rima', 'Haddad'),
  person(P.tarek, 'Tarek', 'Saleh'),
  person(P.jad, 'Jad', 'Saleh'),
  person(P.karim, 'Karim', 'Qasim'),
  person(P.nour, 'Nour', 'Qasim'),
  person(P.adel, 'Adel', 'Mansour'),
  person(P.widad, 'Widad', 'Sabbagh'),
  person(P.samir, 'Samir', 'Mansour'),
  person(P.amal, 'Amal', 'Mansour'),
  person(P.rana, 'Rana', 'Hakim'),
  person(P.tala, 'Tala', 'Mansour'),
  person(P.ziad, 'Ziad', 'Mansour'),
  person(P.dina, 'Dina', 'Aziz'),
  person(P.bashir, 'Bashir', 'Aziz'),
  person(P.walid, 'Walid', 'Aziz'),
  person(P.hani, 'Hani', 'Khoury'),
  person(P.maya, 'Maya', 'Khoury'),
  person(P.sami, 'Sami', 'Khoury'),
  person(P.jamil, 'Jamil', 'Khoury'),
  person(P.nadia, 'Nadia', 'Tabbara'),
  person(P.fuad, 'Fuad', 'Zaher'),
  person(P.munir, 'Munir', 'Zaher'),
  person(P.ghada, 'Ghada', 'Najjar'),
  person(P.omarZaher, 'Omar', 'Zaher'),
  person(P.laylaZaher, 'Layla', 'Zaher'),
  person(P.dalia, 'Dalia', 'Farah'),
  person(P.hana, 'Hana', 'Rahhal'),
  person(P.majed, 'Majed', 'Saleh'),
  person(P.lina, 'Lina', 'Saleh'),
];

function childOf(child: string, father: string | null, mother: string | null): FamilyLink[] {
  const links: FamilyLink[] = [];
  if (father) links.push({ source: father, target: child, type: 'parent', parentRole: 'father' });
  if (mother) links.push({ source: mother, target: child, type: 'parent', parentRole: 'mother' });
  return links;
}

function married(a: string, b: string): FamilyLink {
  return { source: a, target: b, type: 'marriage' };
}

function divorced(a: string, b: string): FamilyLink {
  return { source: a, target: b, type: 'divorce' };
}

export const FIXTURE_LINKS: FamilyLink[] = [
  // Haddad line
  married(P.idris, P.salma),
  ...childOf(P.yusuf, P.idris, P.salma),
  ...childOf(P.mariam, P.idris, P.salma),
  ...childOf(P.khalil, P.idris, P.salma),

  married(P.yusuf, P.huda),
  ...childOf(P.omar, P.yusuf, P.huda),
  ...childOf(P.layla, P.yusuf, P.huda),

  // Khoury line
  married(P.jamil, P.nadia),
  ...childOf(P.faris, P.jamil, P.nadia),
  married(P.faris, P.mariam),
  ...childOf(P.sara, P.faris, P.mariam),
  ...childOf(P.nabil, P.faris, P.mariam),

  // Cousin marriage
  married(P.omar, P.sara),
  ...childOf(P.yusufJr, P.omar, P.sara),
  ...childOf(P.rima, P.omar, P.sara),

  // Divorce, then a second marriage, with a child from each
  divorced(P.tarek, P.layla),
  ...childOf(P.jad, P.tarek, P.layla),
  married(P.karim, P.layla),
  ...childOf(P.nour, P.karim, P.layla),
  ...childOf(P.lina, P.jad, null),

  // Nabil's family; Dina and Walid have only their father recorded
  ...childOf(P.dina, P.bashir, null),
  ...childOf(P.walid, P.bashir, null),
  married(P.nabil, P.dina),
  ...childOf(P.hani, P.nabil, P.dina),
  ...childOf(P.maya, P.nabil, P.dina),
  ...childOf(P.sami, P.hani, null),

  // Mansour line (Omar and Layla Haddad's mother's side)
  married(P.adel, P.widad),
  ...childOf(P.huda, P.adel, P.widad),
  ...childOf(P.samir, P.adel, P.widad),
  ...childOf(P.amal, P.adel, P.widad),
  married(P.samir, P.rana),
  ...childOf(P.tala, P.samir, P.rana),
  ...childOf(P.ziad, P.samir, P.rana),

  // A parent link with no parent_role: Majed is Tarek's parent, role unknown.
  { source: P.majed, target: P.tarek, type: 'parent', parentRole: null },

  // Island
  ...childOf(P.munir, P.fuad, null),
  married(P.munir, P.ghada),
  ...childOf(P.omarZaher, P.munir, P.ghada),
  ...childOf(P.laylaZaher, P.munir, P.ghada),
  married(P.omarZaher, P.dalia),
];

/** The fixture as one Tree Record. */
export const KINSHIP_FIXTURE_TREE: FamilyGraph = {
  nodes: FIXTURE_PERSONS,
  links: FIXTURE_LINKS,
};

/**
 * The chat test tree (LIN-81): the fixture above, with each Person's gender,
 * as every Person in the Tree Record has one since LIN-76, except Ziad
 * Mansour's, left not recorded. It adds Hani Khoury's wife Joumana Saab and
 * their daughter Lara Khoury, a sibling's child linked through both parents.
 * The Kinship Path tests keep the fixture without genders.
 */
export const CHAT_TEST_IDS = {
  ...FIXTURE_IDS,
  joumana: 'fx-joumana-saab',
  lara: 'fx-lara-khoury',
} as const;

const GENDERS: Record<keyof typeof CHAT_TEST_IDS, PersonGender | null> = {
  idris: 'male',
  salma: 'female',
  yusuf: 'male',
  mariam: 'female',
  khalil: 'male',
  huda: 'female',
  faris: 'male',
  omar: 'male',
  layla: 'female',
  sara: 'female',
  nabil: 'male',
  yusufJr: 'male',
  rima: 'female',
  tarek: 'male',
  jad: 'male',
  karim: 'male',
  nour: 'female',
  adel: 'male',
  widad: 'female',
  samir: 'male',
  amal: 'female',
  rana: 'female',
  tala: 'female',
  ziad: null,
  dina: 'female',
  bashir: 'male',
  walid: 'male',
  hani: 'male',
  maya: 'female',
  sami: 'male',
  jamil: 'male',
  nadia: 'female',
  fuad: 'male',
  munir: 'male',
  ghada: 'female',
  omarZaher: 'male',
  laylaZaher: 'female',
  dalia: 'female',
  hana: 'female',
  majed: 'male',
  lina: 'female',
  joumana: 'female',
  lara: 'female',
};

const C = CHAT_TEST_IDS;
const genderById = new Map<string, PersonGender | null>(Object.entries(GENDERS).map(([key, gender]) => [C[key as keyof typeof C], gender]));

export const CHAT_TEST_PERSONS: FamilyNode[] = [
  ...FIXTURE_PERSONS,
  person(C.joumana, 'Joumana', 'Saab'),
  person(C.lara, 'Lara', 'Khoury'),
].map((node) => ({ ...node, gender: genderById.get(node.id) ?? null }));

export const CHAT_TEST_TREE: FamilyGraph = {
  nodes: CHAT_TEST_PERSONS,
  links: [...FIXTURE_LINKS, married(C.hani, C.joumana), ...childOf(C.lara, C.hani, C.joumana)],
};
