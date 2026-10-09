import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function restrictedSyntax(code: string) {
  const [result] = await eslint.lintText(code, { filePath: 'src/components/Fixture.tsx' });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

describe("the lint rule against drei Line's visible prop", () => {
  it('flags visible on a drei Line and names the alternatives', async () => {
    const messages = await restrictedSyntax(`
import { Line } from '@react-three/drei';
export function Fixture({ shown }: { shown: boolean }) {
  return (
    <Line
      points={[[0, 0, 0], [1, 1, 1]]}
      visible={shown}
    />
  );
}
`);
    expect(messages).toHaveLength(1);
    expect(messages[0].line).toBe(7);
    expect(messages[0].message).toMatch(/unmount/i);
    expect(messages[0].message).toMatch(/ref/);
    expect(messages[0].message).toMatch(/<group visible>/);
  });

  it('leaves a Line from another module alone', async () => {
    const messages = await restrictedSyntax(`
import { Line } from 'react-konva';
export function Fixture() {
  return <Line points={[0, 0, 1, 1]} visible={false} />;
}
`);
    expect(messages).toEqual([]);
  });

  it('leaves a drei Line without visible, and a wrapping group visible, alone', async () => {
    const messages = await restrictedSyntax(`
import { Line } from '@react-three/drei';
export function Fixture({ shown }: { shown: boolean }) {
  return (
    <group visible={shown}>
      <Line points={[[0, 0, 0], [1, 1, 1]]} transparent opacity={0.5} />
    </group>
  );
}
`);
    expect(messages).toEqual([]);
  });

  it('flags importing drei Line under another name, which would hide visible from the rule', async () => {
    const messages = await restrictedSyntax(`
import { Line as DreiLine } from '@react-three/drei';
export function Fixture() {
  return <DreiLine points={[[0, 0, 0], [1, 1, 1]]} />;
}
`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/its own name/);
  });
});
