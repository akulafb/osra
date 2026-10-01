/**
 * Runs the family-chat tools on the Working Record (LIN-72).
 *
 * The model asks for a fact through the family-chat function (LIN-71); the
 * browser answers it here, with the LIN-70 code in `familyGraph.ts`, and sends
 * the result back as the content of a tool turn. Only the answer goes back,
 * never the tree. Every tool is read only.
 *
 * The tool names, argument types and descriptions are the function's
 * (`supabase/functions/family-chat/tools.ts`), so the two cannot drift. The
 * model is not trusted: every argument is checked, and a wrong one is answered
 * with `{ error }` the model can read and correct.
 */
import type { ToolCall } from '../../supabase/functions/family-chat/request.ts';
import { MAX_TOOL_RESULT_CHARS } from '../../supabase/functions/family-chat/request.ts';
import {
  CHAT_TOOL_NAMES,
  RELATIVE_KINDS,
  type ChatToolArguments,
  type ChatToolName,
} from '../../supabase/functions/family-chat/tools.ts';
import type { FamilyLink, FamilyNode } from '../types/graph';
import {
  findKinshipPaths,
  findPersonsByName,
  getRelatives,
  type KinshipPath,
  type KinshipRelation,
} from './familyGraph';
import { formatNodeDisplayName } from '../utils/nodeDisplayName';

/** The Persons and Kinship Links the tools read: the Working Record at send time. */
export interface ChatRecord {
  nodes: readonly FamilyNode[];
  links: readonly FamilyLink[];
}

const SIDES = ['mother', 'father', 'both'] as const;
const GENDERS = ['female', 'male'] as const;

class BadArguments extends Error {}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new BadArguments(`${what} must be one of: ${allowed.join(', ')}.`);
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T | undefined {
  return value === undefined || value === null ? undefined : oneOf(value, allowed, what);
}

/** "first cousin, mother's side": the code's name for a relation, or null when no rule fits. */
function relationText(relation: KinshipRelation | null): string | null {
  if (!relation) return null;
  return relation.side ? `${relation.label}, ${relation.side}'s side` : relation.label;
}

/** What each Person on a path is to the one before it, read from the Kinship Link. */
function chainOf(path: KinshipPath, displayName: (personId: string) => string) {
  return [
    { displayName: displayName(path.personIds[0]), is: 'start' },
    ...path.steps.map((step) => ({
      displayName: displayName(step.toId),
      is:
        step.kind === 'parent'
          ? (step.link.parentRole ?? 'parent')
          : step.kind === 'formerSpouse'
            ? 'former spouse'
            : step.kind,
    })),
  ];
}

/**
 * A relatives list that fits in one tool turn. A long list (all the
 * descendants of a founder) first drops the ids, then keeps as many names as
 * fit; `total` is always the full count.
 */
function fitRelatives(
  base: Record<string, unknown>,
  relatives: Array<{ personId: string; displayName: string }>,
): string {
  const full = JSON.stringify({ ...base, relatives, total: relatives.length });
  if (full.length <= MAX_TOOL_RESULT_CHARS) return full;

  const names = relatives.map((r) => r.displayName);
  const note =
    'The list is long, so it has names only. Use findPersonsByName for the personId of one of them.';
  const namesOnly = JSON.stringify({ ...base, relatives: names, total: names.length, note });
  if (namesOnly.length <= MAX_TOOL_RESULT_CHARS) return namesOnly;

  const shown: string[] = [];
  const budget = MAX_TOOL_RESULT_CHARS - 600; // room for the other fields and the note
  let used = 0;
  for (const name of names) {
    used += JSON.stringify(name).length + 1;
    if (used > budget) break;
    shown.push(name);
  }
  return JSON.stringify({
    ...base,
    relatives: shown,
    total: names.length,
    note: `The list is too long to send in full: ${shown.length} of ${names.length} names are shown. Give the total, and say the list is too long to show in full.`,
  });
}

/** Runs one tool call and returns the tool turn's content, as JSON. */
export function runChatTool(call: ToolCall, record: ChatRecord): string {
  try {
    return run(call, record);
  } catch (err) {
    if (err instanceof BadArguments) return JSON.stringify({ error: err.message });
    throw err;
  }
}

function run(call: ToolCall, record: ChatRecord): string {
  if (!(CHAT_TOOL_NAMES as readonly string[]).includes(call.name)) {
    throw new BadArguments(`There is no tool named ${call.name}. Use one of: ${CHAT_TOOL_NAMES.join(', ')}.`);
  }
  if (call.arguments === null) {
    throw new BadArguments('The arguments were not a JSON object. Call the tool again with a JSON object.');
  }
  const name = call.name as ChatToolName;
  const args = call.arguments;

  const byId = new Map(record.nodes.map((node) => [node.id, node] as const));
  const person = (value: unknown, what: string): { personId: string; displayName: string } => {
    const node = typeof value === 'string' ? byId.get(value) : undefined;
    if (!node) {
      throw new BadArguments(
        `No Person has the personId given as ${what}. Use a personId from findPersonsByName.`,
      );
    }
    return { personId: node.id, displayName: formatNodeDisplayName(node) };
  };
  const displayNameOf = (personId: string) => {
    const node = byId.get(personId);
    return node ? formatNodeDisplayName(node) : 'Unknown';
  };

  switch (name) {
    case 'findPersonsByName': {
      const { name: wanted } = args as Partial<ChatToolArguments['findPersonsByName']>;
      if (typeof wanted !== 'string' || wanted.trim() === '') {
        throw new BadArguments('name must be the name as the user wrote it.');
      }
      const matches = findPersonsByName(wanted, record.nodes, record.links).map(
        ({ personId, displayName, fatherName }) => ({ personId, displayName, fatherName }),
      );
      return JSON.stringify({
        matches,
        total: matches.length,
        ...(matches.length === 0 && { note: 'No Person has this name.' }),
        ...(matches.length > 1 && {
          note: "More than one Person has this name. Ask the user which one they mean, showing each with their father's name. Do not pick one.",
        }),
      });
    }

    case 'getRelatives': {
      const subject = person(args.personId, 'personId');
      const kind = oneOf(args.kind, RELATIVE_KINDS, 'kind');
      const side = optionalOneOf(args.side, SIDES, 'side');
      const gender = optionalOneOf(args.gender, GENDERS, 'gender');
      const relatives = getRelatives(subject.personId, kind, record.links, { side, gender }).map(
        (personId) => ({ personId, displayName: displayNameOf(personId) }),
      );
      return fitRelatives(
        { person: subject.displayName, kind, ...(side && { side }), ...(gender && { gender }) },
        relatives,
      );
    }

    case 'findKinshipPaths': {
      const from = person(args.fromPersonId, 'fromPersonId');
      const to = person(args.toPersonId, 'toPersonId');
      const paths = findKinshipPaths(from.personId, to.personId, record.links).map((path) => ({
        kind: path.kind,
        relation: relationText(path.relation),
        chain: chainOf(path, displayNameOf),
      }));
      return JSON.stringify({
        from: from.displayName,
        to: to.displayName,
        paths,
        note:
          paths.length === 0
            ? 'These two Persons are not related in the family tree.'
            : 'relation is what the second Person is to the first. Give the blood relation first; when there is also a marriage path, add it after as "also related by marriage". When relation is null, name it yourself from the chain.',
      });
    }

    case 'getTreeCounts': {
      const kinshipLinks = { parent: 0, marriage: 0, divorce: 0 };
      for (const link of record.links) kinshipLinks[link.type] += 1;
      return JSON.stringify({ persons: record.nodes.length, kinshipLinks });
    }
  }
}
