import { describe, it, expect } from 'vitest';
import type { Emphasis } from '../../lib/focusEmphasis';
import type { PaperLine } from '../../lib/paperLayout';
import * as THREE from 'three';
import type { Spread } from '../../lib/paperSpread';
import { emptyEmphasisState, lineEndInks, placeOf } from './paperEmphasis';

function stateWith(entries: [string, Emphasis][]) {
  return { ...emptyEmphasisState(), emphasis: new Map(entries) };
}

const line = { sourceId: 'ghost', targetId: 'relative', type: 'parent' } as PaperLine;

describe('lineEndInks', () => {
  it('gives each end of a line its own Person’s ink, so a faint line darkens into a dark disc', () => {
    expect(lineEndInks(stateWith([['ghost', 'ghost'], ['relative', 'relative']]), line)).toEqual([0.2, 1]);
  });

  it('keeps full ink at both ends when nobody is emphasised', () => {
    expect(lineEndInks(emptyEmphasisState(), line)).toEqual([1, 1]);
  });

  it('fades a hover-dimmed end and keeps the hovered end', () => {
    expect(lineEndInks(stateWith([['ghost', 'dimmed'], ['relative', 'hovered']]), line)).toEqual([0.5, 1]);
  });
});

describe('placeOf', () => {
  const layout = new Map([['a', { x: 12, y: 2, z: -4, radius: 5 }]]);
  const spread = { centre: { x: 2, y: 2, z: 0 }, factor: 2 as Spread };

  it('draws a Person at their layout place, spread out from the tree\'s centre', () => {
    const view = { ...emptyEmphasisState(), spread };
    expect(placeOf(layout, view, 'a', new THREE.Vector3()).toArray()).toEqual([22, 2, -8]);
  });

  it('adds a lean at its own size, which a Spread does not grow', () => {
    const view = { ...emptyEmphasisState(), spread, drift: new Map([['a', { x: 1, y: -1, z: 0.5 }]]) };
    expect(placeOf(layout, view, 'a', new THREE.Vector3()).toArray()).toEqual([23, 1, -7.5]);
  });

  it('draws the still layout before any Spread is set', () => {
    expect(placeOf(layout, emptyEmphasisState(), 'a', new THREE.Vector3()).toArray()).toEqual([12, 2, -4]);
  });
});
