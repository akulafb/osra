/**
 * The one definition of the tools the family-chat model may call (LIN-71).
 *
 * The tools run in the browser, on the Working Record, with the LIN-70 code in
 * src/lib/familyGraph.ts. This module sends their descriptions to the model,
 * and the browser (LIN-72) imports the names and argument types from here, so
 * the two cannot drift. It has no Deno or browser imports for that reason.
 *
 * Every tool is read only. Person ids appear in tool arguments and results so
 * the model can chain calls; the system prompt forbids showing them.
 */

export const CHAT_TOOL_NAMES = [
  'findPersonsByName',
  'getRelatives',
  'findKinshipPaths',
  'getTreeCounts',
] as const;
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

/** `RelativeKind` in src/lib/familyGraph.ts; a test keeps the two lists equal. */
export const RELATIVE_KINDS = [
  'parents',
  'children',
  'siblings',
  'spouses',
  'grandparents',
  'grandchildren',
  'auntsAndUncles',
  'cousins',
  'niecesAndNephews',
  'inLaws',
  'ancestors',
  'descendants',
] as const;
export type RelativeKindArgument = (typeof RELATIVE_KINDS)[number];

/** What the model sends for each tool, once the browser has checked it. */
export interface ChatToolArguments {
  findPersonsByName: { name: string };
  getRelatives: {
    personId: string;
    kind: RelativeKindArgument;
    side?: 'mother' | 'father' | 'both';
    gender?: 'female' | 'male';
  };
  findKinshipPaths: { fromPersonId: string; toPersonId: string };
  getTreeCounts: Record<string, never>;
}

/** The OpenAI-style function definition OpenRouter takes in `tools`. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: ChatToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const personId = (what: string) => ({
  type: 'string',
  description: `${what}. A personId from findPersonsByName, or the speaker's own personId.`,
});

export const CHAT_TOOLS: readonly ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'findPersonsByName',
      description:
        'Finds every Person a name could mean. Each word must be a whole word of the ' +
        "Person's given name or paternal family name; case does not matter. Returns a list " +
        'of { personId, displayName, fatherName }. More than one match means you must ask ' +
        'the user which one, showing each with their father\'s name.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The name as the user wrote it.' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRelatives',
      description:
        'Lists the relatives of one Person, of one kind. Returns the relatives with their ' +
        'display names, and the total. Spouses are current marriages only. Siblings include ' +
        'half-siblings. Aunts and uncles are the siblings of a parent (not their spouses). ' +
        'Cousins are first cousins. In-laws are the parents and siblings of a spouse and the ' +
        'spouses of siblings and of children.',
      parameters: {
        type: 'object',
        properties: {
          personId: personId('The Person whose relatives are wanted'),
          kind: { type: 'string', enum: [...RELATIVE_KINDS] },
          side: {
            type: 'string',
            enum: ['mother', 'father', 'both'],
            description:
              "Only relatives reached through the Person's mother or father (\"mom's side\"). " +
              'Applies to parents, siblings, grandparents, aunts and uncles, cousins, nieces ' +
              'and nephews, and ancestors.',
          },
          gender: {
            type: 'string',
            enum: ['female', 'male'],
            description:
              'Only relatives the record shows as female or male (for example aunts, not ' +
              'uncles). Persons whose gender the record cannot tell are left out.',
          },
        },
        required: ['personId', 'kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'findKinshipPaths',
      description:
        'Finds how two Persons are related: the shortest blood path first, then the shortest ' +
        'path through a marriage when there is one. Each path has its kind (blood, marriage ' +
        'or other), the chain of Persons, and the relation name worked out by code: what the ' +
        'second Person is to the first (for example "first cousin", mother\'s side). Use that ' +
        'name; name a relation yourself only when it is null. An empty list means not related.',
      parameters: {
        type: 'object',
        properties: {
          fromPersonId: personId('The first Person'),
          toPersonId: personId('The second Person'),
        },
        required: ['fromPersonId', 'toPersonId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTreeCounts',
      description:
        'Counts for the whole family tree: the number of Persons, and the number of Kinship ' +
        'Links of each type (parent, marriage, divorce).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];
