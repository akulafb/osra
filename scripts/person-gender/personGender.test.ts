import { describe, expect, it } from 'vitest';
import {
  GIVEN_NAMES,
  genderDryRunSql,
  genderMigrationSql,
  guessGenderFromName,
  guessPersonGenders,
  mergeGenderLists,
  parseCsv,
  toCsv,
  type PersonGenderRow,
} from './personGender';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('guessGenderFromName', () => {
  it('knows common Arabic and English given names, in either spelling', () => {
    expect(guessGenderFromName('Mohamed')).toBe('male');
    expect(guessGenderFromName('Muhammad')).toBe('male');
    expect(guessGenderFromName('Youssef')).toBe('male');
    expect(guessGenderFromName('John')).toBe('male');
    expect(guessGenderFromName('Fatma')).toBe('female');
    expect(guessGenderFromName('Leila')).toBe('female');
    expect(guessGenderFromName('Emily')).toBe('female');
  });

  it('reads Arabic script, ignoring short vowels and the form of alef', () => {
    expect(guessGenderFromName('مُحَمَّد')).toBe('male');
    expect(guessGenderFromName('إبراهيم')).toBe('male');
    expect(guessGenderFromName('فاطمة')).toBe('female');
  });

  it('reads the first word, then its first part, ignoring case and accents', () => {
    expect(guessGenderFromName('  ahmed ali ')).toBe('male');
    expect(guessGenderFromName('Mary-Anne')).toBe('female');
    expect(guessGenderFromName('Zéina')).toBe('female');
  });

  it('takes an "Abd" name as male', () => {
    expect(guessGenderFromName('Abdallah')).toBe('male');
    expect(guessGenderFromName('Abdel-Rahman')).toBe('male');
    expect(guessGenderFromName('عبدالله')).toBe('male');
  });

  it('leaves names that could be either, and unknown names, blank', () => {
    for (const name of ['Nour', 'Noor', 'Jude', 'Farah', 'Iman', 'Sam', 'Zorblax', '', null]) {
      expect(guessGenderFromName(name), String(name)).toBeNull();
    }
  });

  it('lists no name as both', () => {
    const both = [...GIVEN_NAMES.male].filter((name) => GIVEN_NAMES.female.has(name));
    expect(both).toEqual([]);
  });
});

describe('guessPersonGenders', () => {
  const nodes = [
    { id: id(1), first_name: 'Nour', paternal_family_cluster: 'Badran' }, // a father: role wins over the name
    { id: id(2), first_name: 'Huda', paternal_family_cluster: 'Kutob' }, // a mother
    { id: id(3), first_name: 'Khalil', paternal_family_cluster: 'Badran' }, // childless: the name
    { id: id(4), first_name: 'Jude', paternal_family_cluster: null }, // nothing says
    { id: id(5), first_name: 'Sami', paternal_family_cluster: 'Badran' }, // mother and father: a conflict
    { id: id(6), first_name: 'Majed', paternal_family_cluster: 'Saleh' }, // a parent with no role: the name
  ];
  const links = [
    { source_node_id: id(1), type: 'parent', parent_role: 'father' as const },
    { source_node_id: id(2), type: 'parent', parent_role: 'mother' as const },
    { source_node_id: id(1), type: 'marriage', parent_role: null },
    { source_node_id: id(5), type: 'parent', parent_role: 'mother' as const },
    { source_node_id: id(5), type: 'parent', parent_role: 'father' as const },
    { source_node_id: id(6), type: 'parent', parent_role: null },
  ];

  it('reads parent_role first, then the given name, and sorts by display name', () => {
    const { rows, conflicts } = guessPersonGenders(nodes, links);
    expect(rows).toEqual([
      { id: id(2), display_name: 'Huda Kutob', guessed_gender: 'female', source: 'parent_role' },
      { id: id(4), display_name: 'Jude', guessed_gender: '', source: 'none' },
      { id: id(3), display_name: 'Khalil Badran', guessed_gender: 'male', source: 'name' },
      { id: id(6), display_name: 'Majed Saleh', guessed_gender: 'male', source: 'name' },
      { id: id(1), display_name: 'Nour Badran', guessed_gender: 'male', source: 'parent_role' },
      { id: id(5), display_name: 'Sami Badran', guessed_gender: '', source: 'none' },
    ]);
    expect(conflicts).toEqual([id(5)]);
  });
});

describe('the CSV', () => {
  const rows: PersonGenderRow[] = [
    { id: id(1), display_name: 'Omar "Abu Ali" Haddad', guessed_gender: 'male', source: 'parent_role' },
    { id: id(2), display_name: 'Layla, the elder', guessed_gender: '', source: 'none' },
  ];

  it('writes the four columns and reads them back, quotes and commas included', () => {
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe('id,display_name,guessed_gender,source');
    expect(parseCsv(csv)).toEqual(rows);
  });

  it('reads corrections: m/f, any case, CRLF, a byte order mark, extra columns', () => {
    const csv = `\uFEFFid,display_name,guessed_gender,source,note\r\n${id(1)},Omar,M,name,fixed\r\n${id(2)},Layla,Female,none,\r\n${id(3)},Jude,,none,\r\n`;
    expect(parseCsv(csv).map((r) => r.guessed_gender)).toEqual(['male', 'female', '']);
  });

  it('refuses a bad id, a repeated id and an unknown gender, naming each line', () => {
    const csv = `id,display_name,guessed_gender,source\nnot-a-uuid,A,male,name\n${id(1)},B,boy,name\n${id(1)},C,female,name\n`;
    expect(() => parseCsv(csv, 'list.csv')).toThrow(/line 2: id "not-a-uuid"[\s\S]*line 3: gender "boy"[\s\S]*line 4: id .* appears twice/);
  });

  it('refuses a file without the id and guessed_gender columns', () => {
    expect(() => parseCsv('name,gender\nA,male\n')).toThrow(/needs the columns id and guessed_gender/);
  });
});

describe('the SQL', () => {
  const dev: PersonGenderRow[] = [
    { id: id(1), display_name: 'Omar Haddad', guessed_gender: 'male', source: 'parent_role' },
    { id: id(2), display_name: 'Jude', guessed_gender: '', source: 'none' },
  ];
  const prod: PersonGenderRow[] = [
    { id: id(1), display_name: 'Omar Haddad', guessed_gender: 'male', source: 'parent_role' },
    { id: id(3), display_name: 'Huda\nMansour', guessed_gender: 'female', source: 'name' },
  ];

  it('merges the lists by id, leaving blank Persons out', () => {
    expect(mergeGenderLists([dev, prod])).toEqual([
      { id: id(3), gender: 'female', display_name: 'Huda\nMansour' },
      { id: id(1), gender: 'male', display_name: 'Omar Haddad' },
    ]);
  });

  it('refuses lists that give one Person two genders', () => {
    const other = [{ ...dev[0], guessed_gender: 'female' as const }];
    expect(() => mergeGenderLists([dev, other])).toThrow(/Omar Haddad\): male in one list, female in another/);
  });

  it('writes a migration that stores the genders, then fills empty roles, then checks', () => {
    const sql = genderMigrationSql(mergeGenderLists([dev, prod]), { sources: ['/tmp/persons-gender-dev.csv'] });
    expect(sql).toContain(`('${id(3)}'::uuid, 'female'), -- Huda Mansour`);
    expect(sql).toContain(`('${id(1)}'::uuid, 'male')  -- Omar Haddad`);
    expect(sql).toContain('AND n.gender IS NULL');
    // The backfill comes after the genders, never before.
    expect(sql.indexOf('UPDATE public.links')).toBeGreaterThan(sql.indexOf('UPDATE public.nodes'));
    expect(sql).toContain('2 Persons: 1 male, 1 female');
    expect(sql).not.toMatch(/Huda\n/);
  });

  it('writes a dry run that only reads', () => {
    const sql = genderDryRunSql(mergeGenderLists([dev, prod]));
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
    expect(sql).toContain('would_be_refused');
  });

  it('refuses to write SQL for lists that give no one a gender', () => {
    expect(() => genderMigrationSql([], { sources: [] })).toThrow(/nothing to store/);
    expect(() => genderDryRunSql([])).toThrow(/nothing to preview/);
  });
});
