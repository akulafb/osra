import { describe, it, expect } from 'vitest';
import {
  listCsv,
  parseNamesCsv,
  parseWillLinkCsv,
  planDifferences,
  willLinkCsv,
  type FillInResult,
  type PlanRow,
} from './bothParents';

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function row(overrides: Partial<PlanRow>): PlanRow {
  return {
    child_id: ID(1),
    child_name: 'Ali Badran',
    linked_parent_id: ID(2),
    linked_parent_name: 'Fadi Badran',
    status: 'will_link',
    reason: null,
    other_parent_id: ID(3),
    other_parent_name: 'Ebtisam Kutob',
    parent_role: 'mother',
    source: 'only spouse',
    spouses: [{ id: ID(3), name: 'Ebtisam Kutob', link: 'marriage' }],
    ...overrides,
  };
}

const seif = row({
  child_id: ID(4),
  child_name: 'Seif Shaban',
  linked_parent_id: ID(5),
  linked_parent_name: 'Hisham Shaban',
  status: 'needs_a_name',
  reason: 'divorced',
  other_parent_id: null,
  other_parent_name: null,
  parent_role: null,
  source: null,
  spouses: [{ id: ID(6), name: 'Hala, "the elder"', link: 'divorce' }],
});

describe('the list for the owner', () => {
  it('has one line per question, with the spouses to choose from and a blank column to name the parent', () => {
    const csv = listCsv([seif]);
    const [header, line] = csv.trim().split('\n');
    expect(header).toBe('child_id,child_name,linked_parent_id,linked_parent_name,reason,spouses,named_parent_id');
    expect(line).toBe(
      `${ID(4)},Seif Shaban,${ID(5)},Hisham Shaban,divorced,"Hala, ""the elder"" ${ID(6)} (divorce)",`
    );
  });

  it('reads back the parents the owner named, and skips lines left blank', () => {
    const filled = listCsv([seif, row({ ...seif, child_id: ID(7), child_name: 'Zeina Shaban' })]).replace(
      /,\n/,
      `,${ID(6)}\n`
    );
    expect(parseNamesCsv(filled)).toEqual([{ child_id: ID(4), parent_id: ID(6) }]);
  });

  it('refuses a named parent that is not a uuid, naming the line', () => {
    const filled = listCsv([seif]).replace(/,\n$/, ',Hala\n');
    expect(() => parseNamesCsv(filled, 'list.csv')).toThrow(/list.csv.*line 2.*"Hala" is not a uuid/s);
  });

  it('refuses a file without the columns it needs', () => {
    expect(() => parseNamesCsv('id,name\n')).toThrow(/child_id and named_parent_id/);
  });
});

describe('the links the fill-in will write', () => {
  it('round-trips through the file the owner reviews', () => {
    const rows = [row({}), row({ child_id: ID(8), child_name: 'Omar Haddad', other_parent_id: ID(9), parent_role: 'father' })];
    expect(parseWillLinkCsv(willLinkCsv(rows))).toEqual([
      { child_id: ID(1), parent_id: ID(3) },
      { child_id: ID(8), parent_id: ID(9) },
    ]);
  });

  it('finds no differences when the plan is the one reviewed', () => {
    const plan: FillInResult = {
      applied: false,
      will_link: [row({})],
      needs_a_name: [],
      refused_names: [],
      inserted_link_ids: [],
      counts: { will_link: 1, needs_a_name: 0, refused_names: 0, children_with_two_or_more_parents: 0 },
    };
    expect(planDifferences([{ child_id: ID(1), parent_id: ID(3) }], plan)).toEqual([]);
  });

  it('names every link added, dropped or changed since the review', () => {
    const plan = {
      will_link: [row({}), row({ child_id: ID(8), child_name: 'Omar Haddad', other_parent_id: ID(9), other_parent_name: 'Yusuf Haddad' })],
    };
    const reviewed = [
      { child_id: ID(1), parent_id: ID(10) },
      { child_id: ID(11), parent_id: ID(12) },
    ];
    expect(planDifferences(reviewed, plan)).toEqual([
      `Ali Badran (${ID(1)}): reviewed ${ID(10)}, now Ebtisam Kutob (${ID(3)})`,
      `Omar Haddad (${ID(8)}): not in the reviewed list, now Yusuf Haddad (${ID(9)})`,
      `${ID(11)}: reviewed ${ID(12)}, now not linked`,
    ]);
  });
});
