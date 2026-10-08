import { describe, expect, it } from 'vitest';
import { duotone, hexToLinear, type LinearRgb } from './duotoneMap';
import { GRAYSCALE_PAIR, PAPER_PAIRS } from '../../theme/paperPair';

const scene = { ink: hexToLinear(GRAYSCALE_PAIR.ink), paper: hexToLinear(GRAYSCALE_PAIR.paper) };
const pairOf = (pair: { ink: string; paper: string }) => ({ ink: hexToLinear(pair.ink), paper: hexToLinear(pair.paper) });
const mix = (a: LinearRgb, b: LinearRgb, t: number): LinearRgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function expectClose(actual: LinearRgb, expected: LinearRgb) {
  actual.forEach((channel, i) => expect(channel).toBeCloseTo(expected[i], 6));
}

describe('hexToLinear', () => {
  it('decodes sRGB hex to linear channels', () => {
    expectClose(hexToLinear('#000000'), [0, 0, 0]);
    expectClose(hexToLinear('#ffffff'), [1, 1, 1]);
    expect(hexToLinear('#808080')[0]).toBeCloseTo(0.2158605, 6);
  });
});

describe('duotone', () => {
  it('leaves the grayscale scene as it is under the grayscale pair', () => {
    const grayscale = pairOf(GRAYSCALE_PAIR);
    for (const t of [0, 0.25, 0.45, 0.5, 0.8, 1]) {
      const colour = mix(scene.ink, scene.paper, t);
      expectClose(duotone(colour, scene, grayscale), colour);
    }
  });

  it('paints scene ink in the pair ink and scene paper in the pair paper', () => {
    for (const pair of PAPER_PAIRS) {
      const target = pairOf(pair);
      expectClose(duotone(scene.ink, scene, target), target.ink);
      expectClose(duotone(scene.paper, scene, target), target.paper);
    }
  });

  it('keeps a grey part-way between ink and paper part-way in the pair', () => {
    const green = pairOf(PAPER_PAIRS[0]);
    const fogged = mix(scene.ink, scene.paper, 0.3);
    expectClose(duotone(fogged, scene, green), mix(green.ink, green.paper, 0.3));
  });

  it('clamps anything darker than ink or lighter than paper', () => {
    const indigo = pairOf(PAPER_PAIRS[1]);
    expectClose(duotone([0, 0, 0], scene, indigo), indigo.ink);
    expectClose(duotone([1, 1, 1], scene, indigo), indigo.paper);
  });
});
