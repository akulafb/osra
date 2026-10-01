/**
 * The one-time fill-in that links each child to both parents (LIN-78, ADR
 * 0012): the pure part of fill-in.ts, kept free of the network and the file
 * system so it can be tested.
 *
 * The database decides what to link (`fill_in_both_parent_links`, migration
 * 20261001140000). This module writes what it says to the two files the owner
 * reads, reads the owner's answers back, and checks that an apply writes what
 * the owner reviewed.
 */
import { csvField, csvRecords } from '../person-gender/personGender';

/** One row of the plan, as `both_parent_links_plan` returns it. */
export interface PlanRow {
  child_id: string;
  child_name: string;
  linked_parent_id: string;
  linked_parent_name: string;
  status: 'will_link' | 'needs_a_name' | 'refused_name';
  reason: string | null;
  other_parent_id: string | null;
  other_parent_name: string | null;
  parent_role: 'mother' | 'father' | null;
  source: 'only spouse' | 'named' | null;
  spouses: { id: string; name: string; link: 'marriage' | 'divorce' }[] | null;
}

/** What `fill_in_both_parent_links` returns. */
export interface FillInResult {
  applied: boolean;
  will_link: PlanRow[];
  needs_a_name: PlanRow[];
  refused_names: PlanRow[];
  inserted_link_ids: string[];
  counts: {
    will_link: number;
    needs_a_name: number;
    refused_names: number;
    children_with_two_or_more_parents: number;
  };
}

/** A parent to link to a child. */
export interface ParentChoice {
  child_id: string;
  parent_id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIST_COLUMNS = [
  'child_id',
  'child_name',
  'linked_parent_id',
  'linked_parent_name',
  'reason',
  'spouses',
  'named_parent_id',
] as const;

export const WILL_LINK_COLUMNS = [
  'child_id',
  'child_name',
  'linked_parent_name',
  'other_parent_id',
  'other_parent_name',
  'parent_role',
  'source',
] as const;

function csv(columns: readonly string[], rows: readonly Record<string, string>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvField(row[column] ?? '')).join(','));
  return lines.join('\n') + '\n';
}

/**
 * The list of children the owner is asked about: one line each, with the
 * reason, the linked parent's spouses ("Name id (marriage)"), and a blank
 * `named_parent_id` to fill in with the other parent's id. A line left blank
 * stays linked to one parent.
 */
export function listCsv(needsAName: readonly PlanRow[]): string {
  return csv(
    LIST_COLUMNS,
    needsAName.map((row) => ({
      child_id: row.child_id,
      child_name: row.child_name,
      linked_parent_id: row.linked_parent_id,
      linked_parent_name: row.linked_parent_name,
      reason: row.reason ?? '',
      spouses: (row.spouses ?? []).map((s) => `${s.name} ${s.id} (${s.link})`).join('; '),
      named_parent_id: '',
    }))
  );
}

/** The links the fill-in will write, for the owner to review before the apply. */
export function willLinkCsv(willLink: readonly PlanRow[]): string {
  return csv(
    WILL_LINK_COLUMNS,
    willLink.map((row) => ({
      child_id: row.child_id,
      child_name: row.child_name,
      linked_parent_name: row.linked_parent_name,
      other_parent_id: row.other_parent_id ?? '',
      other_parent_name: row.other_parent_name ?? '',
      parent_role: row.parent_role ?? '',
      source: row.source ?? '',
    }))
  );
}

/** Reads two id columns from a CSV; throws naming every bad line. */
function readPairs(text: string, file: string, childColumn: string, parentColumn: string, skipBlank: boolean): ParentChoice[] {
  const [header, ...records] = csvRecords(text.replace(/^\uFEFF/, ''));
  if (!header) throw new Error(`${file} is empty.`);
  const at = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const child = at(childColumn);
  const parent = at(parentColumn);
  if (child < 0 || parent < 0) {
    throw new Error(`${file} needs the columns ${childColumn} and ${parentColumn} (found: ${header.join(', ')}).`);
  }

  const problems: string[] = [];
  const pairs: ParentChoice[] = [];
  records.forEach((record, i) => {
    const line = i + 2;
    const childId = (record[child] ?? '').trim();
    const parentId = (record[parent] ?? '').trim();
    if (skipBlank && parentId === '') return;
    if (!UUID.test(childId)) problems.push(`line ${line}: ${childColumn} "${childId}" is not a uuid`);
    if (!UUID.test(parentId)) problems.push(`line ${line}: ${parentColumn} "${parentId}" is not a uuid`);
    pairs.push({ child_id: childId.toLowerCase(), parent_id: parentId.toLowerCase() });
  });
  if (problems.length) throw new Error(`${file} has problems:\n  ${problems.join('\n  ')}`);
  return pairs;
}

/** The parents the owner named in the list, skipping lines left blank. */
export function parseNamesCsv(text: string, file = 'the list'): ParentChoice[] {
  return readPairs(text, file, 'child_id', 'named_parent_id', true);
}

/** The links in a reviewed will-link file. */
export function parseWillLinkCsv(text: string, file = 'the will-link file'): ParentChoice[] {
  return readPairs(text, file, 'child_id', 'other_parent_id', false);
}

/**
 * Every way the plan differs from the links the owner reviewed, one line each;
 * empty when they are the same. An apply goes ahead only when this is empty.
 */
export function planDifferences(reviewed: readonly ParentChoice[], plan: Pick<FillInResult, 'will_link'>): string[] {
  const before = new Map(reviewed.map((pair) => [pair.child_id.toLowerCase(), pair.parent_id.toLowerCase()]));
  const differences: string[] = [];
  for (const row of plan.will_link) {
    const was = before.get(row.child_id.toLowerCase());
    const now = `${row.other_parent_name} (${row.other_parent_id})`;
    if (was === undefined) differences.push(`${row.child_name} (${row.child_id}): not in the reviewed list, now ${now}`);
    else if (was !== (row.other_parent_id ?? '').toLowerCase()) differences.push(`${row.child_name} (${row.child_id}): reviewed ${was}, now ${now}`);
    before.delete(row.child_id.toLowerCase());
  }
  for (const [childId, parentId] of before) differences.push(`${childId}: reviewed ${parentId}, now not linked`);
  return differences;
}
