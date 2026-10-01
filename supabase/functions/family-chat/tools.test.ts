import { describe, expect, it } from 'vitest';
import type { KinshipSide, RecordedGender, RelativeKind } from '../../../src/lib/familyGraph.ts';
import {
  CHAT_TOOL_NAMES,
  CHAT_TOOLS,
  KINSHIP_SIDES,
  RECORDED_GENDERS,
  RELATIVE_KINDS,
  type RelativeKindArgument,
} from './tools.ts';

// Compile-time: the tool's kinds and LIN-70's RelativeKind are the same set.
// `npx tsc -p supabase/functions` fails here if either list changes alone.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const kindsMatch: Same<RelativeKindArgument, RelativeKind> = true;
const sidesMatch: Same<(typeof KINSHIP_SIDES)[number], KinshipSide> = true;
const gendersMatch: Same<(typeof RECORDED_GENDERS)[number], RecordedGender> = true;

describe('the chat tool list', () => {
  it('defines each tool once, by the names the browser runs', () => {
    expect(CHAT_TOOLS.map((t) => t.function.name)).toEqual([...CHAT_TOOL_NAMES]);
  });

  it('offers every relative kind the LIN-70 code knows', () => {
    expect([kindsMatch, sidesMatch, gendersMatch]).toEqual([true, true, true]);
    const getRelatives = CHAT_TOOLS.find((t) => t.function.name === 'getRelatives');
    const properties = getRelatives?.function.parameters.properties as Record<string, { enum?: string[] }>;
    expect(properties.kind.enum).toEqual([...RELATIVE_KINDS]);
  });
});
