/**
 * The gender list for existing Persons (LIN-76): the pure part of the two
 * scripts beside this file, kept free of the network and the file system so it
 * can be tested.
 *
 * - `guessPersonGenders` reads each Person's gender from `parent_role` on the
 *   Kinship Links where they are the parent, or else from their given name.
 * - `toCsv` / `parseCsv` write and read the list the owner corrects.
 * - `genderMigrationSql` and `genderDryRunSql` turn corrected lists into the
 *   migration that stores them and a read-only preview of what it would do.
 */
import type { PersonGender } from '../../src/types/graph';
import { formatNodeDisplayName } from '../../src/utils/nodeDisplayName';

export type GuessSource = 'parent_role' | 'name' | 'none';

/** One line of the list: `guessed_gender` is blank when nothing says. */
export interface PersonGenderRow {
  id: string;
  display_name: string;
  guessed_gender: PersonGender | '';
  source: GuessSource;
}

/** The `public.nodes` columns the list reads. */
export interface NodeRowForList {
  id: string;
  first_name: string | null;
  paternal_family_cluster: string | null;
}

/** The `public.links` columns the list reads. */
export interface LinkRowForList {
  source_node_id: string;
  type: string;
  parent_role: 'mother' | 'father' | null;
}

export const CSV_COLUMNS = ['id', 'display_name', 'guessed_gender', 'source'] as const;

// -----------------------------------------------------------------------------
// Given names
// -----------------------------------------------------------------------------

/**
 * Common given names that are one gender in the family's usage: Arabic (as
 * usually transliterated, and in Arabic script) and English. Names that could
 * be either, such as Nour, Jude, Farah, Iman or Sam, are left out on purpose,
 * so their Persons are left blank for the owner. Lowercase, no diacritics.
 */
const MALE_NAMES = `
  mohamed mohammed muhammad mohammad mohamad muhammed ahmed ahmad mahmoud mahmud
  mustafa moustafa mostafa omar umar ali hassan hasan hussein husein hussain
  hossam husam ibrahim ismail youssef yusuf yousef yousif joseph khaled khalid
  walid waleed tarek tariq tarik karim kareem samir sameer sami fadi rami ramy
  hani hany nabil nabeel majed majid maged bassam ziad ziyad adel adil amr amir
  ameer anas bilal faisal fahd fahad hamza hamzah idris jamal jamil khalil
  marwan mazen munir mounir nasser naser nader osama usama qasim kassem rashid
  saeed said saleh salah sultan tamer wael yahya yasser yaser zaid zayd zakaria
  badr hatem hisham hesham ayman emad imad ehab ihab fouad fuad ghassan haitham
  raed riad riyad seif saif sherif shadi jad issa isa musa moussa elias ilyas
  yaqub yacoub suleiman sulaiman talal tawfiq tawfik nizar maher wissam
  john james david michael robert william richard thomas daniel paul mark
  george peter adam edward henry jack matthew andrew anthony charles steven
  kevin brian ryan jacob noah liam ethan lucas oliver benjamin samuel
  محمد أحمد احمد علي عمر حسن حسين خالد يوسف ابراهيم إبراهيم مصطفى محمود طارق
  كريم سامي فادي وليد ماجد زياد عادل
`;

const FEMALE_NAMES = `
  fatima fatma fatimah fatemah aisha aysha aicha khadija khadijah maryam mariam
  miriam zainab zeinab zaynab layla leila laila leyla huda hoda salma sara sarah
  amal amira ameera asma dalia dina ghada hala hana hanan heba hiba jamila lama
  lina lubna maha manal mona muna nadia nadya najwa nada nawal nisreen nesreen
  noha rana rania ranya rasha reem rima reema ruba rula sahar samar samira sana
  sawsan souad suad suha tala wafa widad yasmin yasmine yasmeen yara zahra zeina
  zina ebtisam ibtisam inas enas abeer abir afaf alia aliya aya bushra basma
  lamis majida maysa nermin raghad razan sumaya sumayya tasneem duaa doaa hadeel
  jana maram malak mayar nourhan shahd lujain salwa nahla mai randa hayat
  mary elizabeth jennifer linda patricia susan jessica emily emma olivia
  sophia sophie grace hannah anna anne maria laura rachel rebecca julia lucy
  chloe zoe isabella ava mia charlotte amelia ella lily natalie nicole
  catherine katherine victoria christina diana helen margaret rose
  فاطمة عائشة مريم زينب ليلى سارة هدى سلمى خديجة أمل امل هالة رنا ريم دينا
`;

function nameSet(list: string): Set<string> {
  return new Set(list.split(/\s+/).filter(Boolean).map(normalizeName));
}

/** Lowercase, no Latin diacritics, no Arabic short vowels, one form of alef. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase()
    .trim();
}

const MALE = nameSet(MALE_NAMES);
const FEMALE = nameSet(FEMALE_NAMES);

/** For the tests: every listed name, by gender. */
export const GIVEN_NAMES: Readonly<Record<PersonGender, ReadonlySet<string>>> = { male: MALE, female: FEMALE };

/**
 * The gender a given name usually has, or `null` when the name is not listed
 * or could be either. Reads the first word ("Mohamed Ali" is Mohamed), then its
 * first part ("Mary-Anne" is Mary). "Abd"/"Abdul"/"Abdel"/"Abdallah" names
 * ("servant of") are always male; so is "عبد".
 */
export function guessGenderFromName(firstName: string | null | undefined): PersonGender | null {
  const word = normalizeName(firstName ?? '').split(/\s+/)[0] ?? '';
  if (!word) return null;
  for (const candidate of [word, word.split('-')[0]]) {
    if (MALE.has(candidate)) return 'male';
    if (FEMALE.has(candidate)) return 'female';
  }
  if ((word.startsWith('abd') && word.length > 3) || word.startsWith('عبد')) return 'male';
  return null;
}

// -----------------------------------------------------------------------------
// The list
// -----------------------------------------------------------------------------

export interface GuessResult {
  rows: PersonGenderRow[];
  /** Persons who are recorded as a mother on one link and a father on another. */
  conflicts: string[];
}

/**
 * One row per Person, in display-name order. `parent_role` wins over the
 * name, because it is what the family already recorded. A Person recorded as
 * both a mother and a father is left blank and reported in `conflicts`.
 */
export function guessPersonGenders(
  nodes: readonly NodeRowForList[],
  links: readonly LinkRowForList[]
): GuessResult {
  const roles = new Map<string, Set<'mother' | 'father'>>();
  for (const link of links) {
    if (link.type !== 'parent' || !link.parent_role) continue;
    const set = roles.get(link.source_node_id) ?? new Set();
    set.add(link.parent_role);
    roles.set(link.source_node_id, set);
  }

  const conflicts: string[] = [];
  const rows = nodes.map((node): PersonGenderRow => {
    const display_name = formatNodeDisplayName({
      firstName: node.first_name ?? '',
      familyCluster: node.paternal_family_cluster ?? undefined,
    });
    const recorded = roles.get(node.id);
    if (recorded && recorded.size > 1) {
      conflicts.push(node.id);
      return { id: node.id, display_name, guessed_gender: '', source: 'none' };
    }
    if (recorded && recorded.size === 1) {
      const role = [...recorded][0];
      return { id: node.id, display_name, guessed_gender: role === 'father' ? 'male' : 'female', source: 'parent_role' };
    }
    const fromName = guessGenderFromName(node.first_name);
    return fromName
      ? { id: node.id, display_name, guessed_gender: fromName, source: 'name' }
      : { id: node.id, display_name, guessed_gender: '', source: 'none' };
  });

  rows.sort((a, b) => a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id));
  return { rows, conflicts };
}

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly PersonGenderRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvField(row[column])).join(','));
  return lines.join('\n') + '\n';
}

/** RFC 4180 records: quoted fields may hold commas, quotes and newlines. */
export function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((value) => value.trim() !== ''));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A corrected gender cell: blank is not recorded; m/f and any case are accepted. */
function readGender(cell: string): PersonGender | '' | null {
  const value = cell.trim().toLowerCase();
  if (value === '') return '';
  if (value === 'male' || value === 'm') return 'male';
  if (value === 'female' || value === 'f') return 'female';
  return null;
}

/**
 * Reads a corrected list. Throws, naming every bad line, when a header is
 * missing, an id is not a uuid or appears twice, or a gender is not male,
 * female (m/f) or blank. Extra columns are ignored.
 */
export function parseCsv(text: string, file = 'the list'): PersonGenderRow[] {
  const [header, ...records] = csvRecords(text.replace(/^\uFEFF/, ''));
  if (!header) throw new Error(`${file} is empty.`);
  const at = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const columns = { id: at('id'), name: at('display_name'), gender: at('guessed_gender'), source: at('source') };
  if (columns.id < 0 || columns.gender < 0) {
    throw new Error(`${file} needs the columns id and guessed_gender (found: ${header.join(', ')}).`);
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const rows: PersonGenderRow[] = [];
  records.forEach((record, i) => {
    const line = i + 2;
    const id = (record[columns.id] ?? '').trim().toLowerCase();
    const gender = readGender(record[columns.gender] ?? '');
    if (!UUID.test(id)) problems.push(`line ${line}: id "${id}" is not a uuid`);
    else if (seen.has(id)) problems.push(`line ${line}: id ${id} appears twice`);
    if (gender === null) problems.push(`line ${line}: gender "${record[columns.gender]}" is not male, female or blank`);
    seen.add(id);
    const source = (record[columns.source] ?? '').trim();
    rows.push({
      id,
      display_name: columns.name >= 0 ? (record[columns.name] ?? '').trim() : '',
      guessed_gender: gender ?? '',
      source: source === 'parent_role' || source === 'name' ? source : 'none',
    });
  });
  if (problems.length) throw new Error(`${file} has problems:\n  ${problems.join('\n  ')}`);
  return rows;
}

// -----------------------------------------------------------------------------
// SQL
// -----------------------------------------------------------------------------

export interface GenderEntry {
  id: string;
  gender: PersonGender;
  display_name: string;
}

/**
 * The Persons the corrected lists give a gender, merged by id. Lists for dev
 * and prod can go into one migration: an id one database lacks updates nothing
 * there. Throws when two lists give one id different genders.
 */
export function mergeGenderLists(lists: readonly (readonly PersonGenderRow[])[]): GenderEntry[] {
  const byId = new Map<string, GenderEntry>();
  const clashes: string[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (!row.guessed_gender) continue;
      const known = byId.get(row.id);
      if (known && known.gender !== row.guessed_gender) {
        clashes.push(`${row.id} (${row.display_name}): ${known.gender} in one list, ${row.guessed_gender} in another`);
        continue;
      }
      if (!known) byId.set(row.id, { id: row.id, gender: row.guessed_gender, display_name: row.display_name });
    }
  }
  if (clashes.length) throw new Error(`The lists disagree:\n  ${clashes.join('\n  ')}`);
  return [...byId.values()].sort((a, b) => a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id));
}

/** A display name made safe for a `--` comment: one line, nothing else. */
function commentText(name: string): string {
  return name.replace(/[\r\n]+/g, ' ').trim() || '(no name)';
}

function valuesList(entries: readonly GenderEntry[]): string {
  // Ids are checked uuids and genders one of two words, so nothing here is
  // user text except the comment.
  return entries
    .map((e, i) => `    ('${e.id}'::uuid, '${e.gender}')${i < entries.length - 1 ? ',' : ' '} -- ${commentText(e.display_name)}`)
    .join('\n');
}

/**
 * The migration that stores the corrected list, then fills every parent
 * Kinship Link with no role from its parent's gender. It never overwrites a
 * gender already recorded (someone may have set one in the app since the list
 * was made), and the triggers from 20261001130000_lin76_person_gender.sql
 * refuse a gender that disagrees with a recorded role, which fails the whole
 * migration with the Person's name.
 */
export function genderMigrationSql(entries: readonly GenderEntry[], { sources }: { sources: readonly string[] }): string {
  if (entries.length === 0) throw new Error('The lists give no Person a gender, so there is nothing to store.');
  const male = entries.filter((e) => e.gender === 'male').length;
  return `-- =============================================================================
-- LIN-76: the gender of each existing Person, from the owner's corrected list.
--
-- Generated by scripts/person-gender/to-migration.ts from:
${sources.map((s) => `--   ${s}`).join('\n')}
-- ${entries.length} Persons: ${male} male, ${entries.length - male} female. Persons left blank
-- in the list are not here and stay not recorded.
--
-- 1. Stores each gender, never overwriting one already recorded. An id this
--    database does not have updates nothing, so one file serves dev and prod.
--    A gender that disagrees with a recorded parent_role is refused by
--    trg_nodes_gender_agrees_with_parent_roles, and the whole migration fails.
-- 2. Fills every parent Kinship Link with no parent_role from the parent's
--    gender (the backfill: it must come after the genders, never before).
-- 3. Fails if any parent link still disagrees with its parent's gender.
--
-- Preview first with the read-only dry run the same script wrote.
-- =============================================================================

-- 1. The genders
WITH list(id, gender) AS (
  VALUES
${valuesList(entries)}
)
UPDATE public.nodes AS n
SET gender = list.gender
FROM list
WHERE n.id = list.id
  AND n.gender IS NULL;

-- 2. The backfill: empty parent_role values from the parent's gender
UPDATE public.links AS l
SET parent_role = public.parent_role_for_gender(n.gender)
FROM public.nodes AS n
WHERE l.type = 'parent'
  AND l.source_node_id = n.id
  AND l.parent_role IS NULL
  AND n.gender IS NOT NULL;

-- 3. Every parent link from a Person with a gender has the matching role
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.links l
  JOIN public.nodes n ON n.id = l.source_node_id
  WHERE l.type = 'parent'
    AND n.gender IS NOT NULL
    AND l.parent_role IS DISTINCT FROM public.parent_role_for_gender(n.gender);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% parent Kinship Links disagree with their parent''s gender', v_bad;
  END IF;
END $$;
`;
}

/**
 * A single read-only query that previews the migration on whichever database
 * it runs against: how many genders it would store, how many are already
 * recorded, how many ids that database does not have, which Persons would be
 * refused (a gender that disagrees with a recorded role, by name), and how
 * many empty parent roles it would fill.
 */
export function genderDryRunSql(entries: readonly GenderEntry[]): string {
  if (entries.length === 0) throw new Error('The lists give no Person a gender, so there is nothing to preview.');
  return `-- LIN-76 dry run: changes nothing. Generated by scripts/person-gender/to-migration.ts.
WITH list(id, gender) AS (
  VALUES
${valuesList(entries)}
),
matched AS (
  SELECT list.id, list.gender AS listed, n.gender AS recorded, n.first_name
  FROM list JOIN public.nodes n ON n.id = list.id
),
refused AS (
  SELECT DISTINCT m.id, m.first_name, m.listed, l.parent_role
  FROM matched m
  JOIN public.links l ON l.source_node_id = m.id AND l.type = 'parent'
  WHERE m.recorded IS NULL
    AND l.parent_role IS NOT NULL
    AND l.parent_role <> public.parent_role_for_gender(m.listed)
),
after AS (
  SELECT n.id, COALESCE(n.gender, m.listed) AS gender
  FROM public.nodes n LEFT JOIN matched m ON m.id = n.id
)
SELECT
  (SELECT count(*) FROM list) AS listed,
  (SELECT count(*) FROM matched WHERE recorded IS NULL) AS would_store,
  (SELECT count(*) FROM matched WHERE recorded IS NOT NULL) AS already_recorded,
  (SELECT count(*) FROM matched WHERE recorded IS NOT NULL AND recorded <> listed) AS already_recorded_differently,
  (SELECT count(*) FROM list) - (SELECT count(*) FROM matched) AS not_in_this_database,
  (SELECT count(*) FROM public.links l JOIN after a ON a.id = l.source_node_id
     WHERE l.type = 'parent' AND l.parent_role IS NULL AND a.gender IS NOT NULL) AS parent_roles_to_fill,
  (SELECT count(*) FROM public.links l JOIN after a ON a.id = l.source_node_id
     WHERE l.type = 'parent' AND l.parent_role IS NULL AND a.gender IS NULL) AS parent_roles_left_empty,
  (SELECT count(*) FROM refused) AS would_be_refused,
  (SELECT string_agg(format('%s (%s): listed %s, recorded as %s', first_name, id, listed, parent_role), '; ')
     FROM refused) AS refused_persons;
`;
}
