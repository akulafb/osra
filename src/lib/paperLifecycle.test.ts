import { describe, it, expect } from 'vitest';
import {
  EMPTY_LIFECYCLE_SCENE,
  growingFrom,
  holdingProgress,
  inLifecycle,
  paperLifecycleDraws,
  paperDissolveDisc,
  paperDissolveSpecks,
  paperLinkDrawn,
  paperSpawnDisc,
  paperSpawnRing,
  rememberLifecycleScene,
  rememberPositions,
  steadyLines,
} from './paperLifecycle';
import { seedCanvasParticles } from '../utils/canvasFx';
import type { Lifecycle, LifecycleKind, LifecycleSubject } from './lifecycle';
import type { PaperLayout, PaperLine } from './paperLayout';
import type { FamilyLink, FamilyNode } from '../types/graph';

const progresses = Array.from({ length: 21 }, (_, i) => i / 20);

function lifecycle(kind: LifecycleKind, subject: LifecycleSubject): Lifecycle {
  const key = subject.kind === 'node' ? `${kind}:${subject.id}` : `${kind}:${subject.aId}-${subject.bId}`;
  return { key, kind, subject, phase: 'playing', startedAt: 0, durationMs: 1000, abortFrom: 0, geometry: null };
}

function line(sourceId: string, targetId: string, type: FamilyLink['type'] = 'parent'): PaperLine {
  return { sourceId, targetId, type, link: { source: sourceId, target: targetId, type } };
}

describe('Spawn in ink', () => {
  it('starts as a small dot of no ink and ends as the full disc in full ink', () => {
    expect(paperSpawnDisc(0).ink).toBe(0);
    expect(paperSpawnDisc(0).scale).toBeLessThan(0.5);
    expect(paperSpawnDisc(1).scale).toBeCloseTo(1, 9);
    expect(paperSpawnDisc(1).ink).toBe(1);
  });

  it('pops past its size before settling', () => {
    expect(Math.max(...progresses.map((p) => paperSpawnDisc(p).scale))).toBeGreaterThan(1);
  });

  it('never draws more than full ink', () => {
    for (const p of progresses) expect(paperSpawnDisc(p).ink).toBeLessThanOrEqual(1);
  });

  it('sends out a ring that widens and fades to nothing', () => {
    expect(paperSpawnRing(1).ink).toBe(0);
    expect(paperSpawnRing(0).ink).toBe(1);
    expect(paperSpawnRing(0.9).scale).toBeGreaterThan(paperSpawnRing(0.1).scale);
  });
});

describe('Dissolve in ink', () => {
  it('starts as the full disc and ends shrunk with no ink left', () => {
    expect(paperDissolveDisc(0)).toEqual({ scale: 1, ink: 1 });
    expect(paperDissolveDisc(1).ink).toBe(0);
    expect(paperDissolveDisc(1).scale).toBeLessThan(1);
  });

  it('only ever loses ink', () => {
    const inks = progresses.map((p) => paperDissolveDisc(p).ink);
    inks.slice(1).forEach((ink, i) => expect(ink).toBeLessThanOrEqual(inks[i]));
  });

  it('scatters ink specks from the disc that are gone by the end', () => {
    const seeds = seedCanvasParticles(12, 'dissolve', () => 0.5);
    const radius = 6;
    for (const speck of paperDissolveSpecks(seeds, 0, radius)) {
      expect(Math.hypot(speck.x, speck.y)).toBeLessThanOrEqual(radius);
      expect(speck.ink).toBe(1);
    }
    const late = paperDissolveSpecks(seeds, 0.6, radius);
    expect(late.some((speck) => Math.hypot(speck.x, speck.y) > radius)).toBe(true);
    for (const speck of paperDissolveSpecks(seeds, 1, radius)) expect(speck.ink).toBe(0);
  });
});

describe('Kinship Link lifecycles in ink', () => {
  it('grows a new line from nothing to whole', () => {
    expect(paperLinkDrawn('spawn', 0)).toBe(0);
    expect(paperLinkDrawn('spawn', 1)).toBe(1);
  });

  it('draws a dissolving line back to nothing', () => {
    expect(paperLinkDrawn('dissolve', 0)).toBe(1);
    expect(paperLinkDrawn('dissolve', 1)).toBe(0);
  });

  it('grows a line from the Person already there towards the newcomer', () => {
    expect(growingFrom({ aId: 'new', bId: 'old' }, new Set(['new']))).toEqual(['old', 'new']);
    expect(growingFrom({ aId: 'old', bId: 'new' }, new Set(['new']))).toEqual(['old', 'new']);
    expect(growingFrom({ aId: 'a', bId: 'b' }, new Set())).toEqual(['a', 'b']);
  });

  it('leaves a spawning line out of the steady lines, whichever way round it was recorded', () => {
    const lines = [line('mum', 'kid'), line('dad', 'kid')];
    const spawning = [lifecycle('spawn', { kind: 'link', aId: 'kid', bId: 'mum' })];
    expect(steadyLines(lines, spawning)).toEqual([lines[1]]);
    expect(steadyLines(lines, [])).toBe(lines);
  });

  it('leaves a dissolving line out of the steady lines too, so an unwinding Dissolve is not drawn twice', () => {
    const lines = [line('mum', 'dad', 'marriage'), line('dad', 'kid')];
    const dissolving = [lifecycle('dissolve', { kind: 'link', aId: 'dad', bId: 'mum' })];
    expect(steadyLines(lines, dissolving)).toEqual([lines[1]]);
  });

  it('knows which Persons are in a lifecycle', () => {
    const playing = [lifecycle('spawn', { kind: 'node', id: 'kid' }), lifecycle('dissolve', { kind: 'link', aId: 'a', bId: 'b' })];
    expect([...inLifecycle(playing)]).toEqual(['kid']);
  });
});

describe('rememberPositions: a Person in a lifecycle keeps their last position', () => {
  const disc = (x: number) => ({ x, y: 0, z: 0, radius: 5 });
  const before: PaperLayout = new Map([
    ['kept', disc(1)],
    ['newcomer', disc(2)],
  ]);
  const after: PaperLayout = new Map([['kept', disc(1)]]);

  it('keeps the last position of a Person who left the Working Record while dissolving', () => {
    const remembered = rememberPositions(before, after, new Set(['newcomer']));
    expect(remembered.get('newcomer')).toEqual(disc(2));
    expect(remembered.get('kept')).toEqual(disc(1));
  });

  it('keeps it for as long as the lifecycle plays', () => {
    const first = rememberPositions(before, after, new Set(['newcomer']));
    expect(rememberPositions(first, after, new Set(['newcomer'])).get('newcomer')).toEqual(disc(2));
  });

  it('forgets a Person once their lifecycle is over', () => {
    const first = rememberPositions(before, after, new Set(['newcomer']));
    expect(rememberPositions(first, after, new Set()).has('newcomer')).toBe(false);
  });

  it('follows the layout for Persons still in it', () => {
    const moved: PaperLayout = new Map([['kept', disc(9)]]);
    expect(rememberPositions(before, moved, new Set(['kept'])).get('kept')).toEqual(disc(9));
  });

  it('returns the layout itself when nobody needs remembering', () => {
    expect(rememberPositions(before, after, new Set())).toBe(after);
    expect(rememberPositions(before, before, new Set(['newcomer']))).toBe(before);
  });
});

describe('which Spawns and Dissolves are drawn, and how', () => {
  const disc = (x: number) => ({ x, y: 0, z: 0, radius: 5 });
  const person = (id: string): FamilyNode => ({ id, firstName: id });
  const layout: PaperLayout = new Map(['mum', 'dad', 'kid', 'hidden'].map((id, i) => [id, disc(i)]));
  const shownNodes = ['mum', 'dad', 'kid'].map(person);

  function scene(nodes: FamilyNode[], lines: PaperLine[], lifecycles: Lifecycle[], previous = EMPTY_LIFECYCLE_SCENE) {
    return rememberLifecycleScene(previous, layout, { nodes, lines }, lifecycles);
  }

  it('grows only the parent line that is drawn when a child Spawns on both parents', () => {
    const lines = [line('mum', 'dad', 'marriage'), line('mum', 'kid')];
    const playing = [
      lifecycle('spawn', { kind: 'node', id: 'kid' }),
      lifecycle('spawn', { kind: 'link', aId: 'mum', bId: 'kid' }),
      lifecycle('spawn', { kind: 'link', aId: 'dad', bId: 'kid' }),
    ];
    const draws = paperLifecycleDraws(playing, scene(shownNodes, lines, playing));
    const grown = draws.flatMap((d) => (d.kind === 'line' ? [d] : []));
    expect(grown).toHaveLength(1);
    expect(grown[0]).toMatchObject({ from: 'mum', to: 'kid', line: { type: 'parent' } });
  });

  it('draws each growing line in its own style', () => {
    const lines = [line('mum', 'dad', 'divorce')];
    const playing = [lifecycle('spawn', { kind: 'link', aId: 'dad', bId: 'mum' })];
    const [draw] = paperLifecycleDraws(playing, scene(shownNodes, lines, playing));
    expect(draw).toMatchObject({ kind: 'line', line: { type: 'divorce' } });
  });

  it('draws a dissolving Kinship Link as the line it was, after the write has removed it', () => {
    const before = scene(shownNodes, [line('mum', 'dad', 'marriage'), line('mum', 'kid')], []);
    const dissolving = [lifecycle('dissolve', { kind: 'link', aId: 'dad', bId: 'mum' })];
    const during = scene(shownNodes, [line('mum', 'kid')], dissolving, before);
    expect(paperLifecycleDraws(dissolving, during)).toEqual([
      expect.objectContaining({ kind: 'line', line: expect.objectContaining({ type: 'marriage' }) }),
    ]);
    const later = scene(shownNodes, [line('mum', 'kid')], dissolving, during);
    expect(paperLifecycleDraws(dissolving, later)).toHaveLength(1);
    expect(scene(shownNodes, [line('mum', 'kid')], [], later).lines).toEqual([line('mum', 'kid')]);
  });

  it('draws no Spawn for a Person the view is not showing', () => {
    const playing = [
      lifecycle('spawn', { kind: 'node', id: 'hidden' }),
      lifecycle('spawn', { kind: 'link', aId: 'mum', bId: 'hidden' }),
    ];
    expect(paperLifecycleDraws(playing, scene(shownNodes, [line('mum', 'kid')], playing))).toEqual([]);
  });

  it('draws a Dissolve where the Person was last shown, and keeps their name, after they leave', () => {
    const before = scene(shownNodes, [], []);
    const dissolving = [lifecycle('dissolve', { kind: 'node', id: 'kid' })];
    const during = scene(shownNodes.slice(0, 2), [], dissolving, before);
    expect(paperLifecycleDraws(dissolving, during)).toEqual([expect.objectContaining({ kind: 'disc', id: 'kid' })]);
    expect(during.layout.get('kid')).toEqual(disc(2));
    expect(during.nodes.map((n) => n.id)).toContain('kid');
  });

  it('draws no Dissolve for a Person who was not shown when it began', () => {
    const before = scene(shownNodes, [], []);
    const dissolving = [lifecycle('dissolve', { kind: 'node', id: 'hidden' })];
    expect(paperLifecycleDraws(dissolving, scene(shownNodes, [], dissolving, before))).toEqual([]);
  });
});

describe('holdingProgress: a finished lifecycle holds its last frame until it leaves the scene', () => {
  it('reads the live progress while there is one, and the last one once it is gone', () => {
    const live = new Map([['spawn:kid', 0.4]]);
    const held = holdingProgress((key) => live.get(key) ?? null);
    expect(held('spawn:kid')).toBe(0.4);
    live.set('spawn:kid', 1);
    expect(held('spawn:kid')).toBe(1);
    live.delete('spawn:kid');
    expect(held('spawn:kid')).toBe(1);
    expect(held('never')).toBeNull();
  });
});
