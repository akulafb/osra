import { describe, it, expect } from 'vitest';
import {
  applyPending,
  confirmPending,
  dropPending,
  emptyWorkingRecord,
  projectWorkingRecord,
  revertPending,
  withConfirmedSnapshot,
  type RecordChange,
  type WorkingRecordState,
} from './workingRecord';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

const person = (id: string, firstName: string, extra: Partial<FamilyNode> = {}): FamilyNode => ({
  id,
  firstName,
  ...extra,
});

const link = (
  id: string | undefined,
  source: string,
  target: string,
  type: FamilyLink['type'] = 'parent'
): FamilyLink => (id === undefined ? { source, target, type } : { id, source, target, type });

/** Fahd and Ahmad, parent-linked. The smallest record with a Kinship Link in it. */
const seeded = (): WorkingRecordState =>
  withConfirmedSnapshot(emptyWorkingRecord(), {
    nodes: [person('ahmad', 'Ahmad'), person('fahd', 'Fahd')],
    links: [link('l-1', 'ahmad', 'fahd')],
  });

const idsOf = (graph: FamilyGraph): string[] => graph.nodes.map((n) => n.id);
const nodeById = (graph: FamilyGraph, id: string): FamilyNode | undefined =>
  graph.nodes.find((n) => n.id === id);

describe('applyPending', () => {
  it('shows the Person in the projection without putting them in `confirmed`', () => {
    const state = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);

    expect(idsOf(projectWorkingRecord(state, null))).toContain('zaynab');
    expect(state.confirmed.nodes.map((n) => n.id)).not.toContain('zaynab');
  });

  it('projects a pending Kinship Link with no id, and keeps it across an unrelated confirmation', () => {
    const pending = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);

    const projected = projectWorkingRecord(pending, null);
    const newLink = projected.links.find((l) => l.target === 'zaynab');
    expect(newLink).toBeDefined();
    expect(newLink?.id).toBeUndefined();

    // A different write confirms; the pending Kinship Link is untouched.
    const other = applyPending(pending, 'c2', [
      { kind: 'person-upsert', person: person('mona', 'Mona') },
    ]);
    const after = confirmPending(other, 'c2', { persons: [person('mona', 'Mona')] });

    const stillPending = projectWorkingRecord(after, projected).links.find(
      (l) => l.target === 'zaynab'
    );
    expect(stillPending).toBeDefined();
    expect(stillPending?.id).toBeUndefined();
  });

  it('does not project an id-less Kinship Link that duplicates a confirmed one', () => {
    const state = applyPending(seeded(), 'c1', [
      { kind: 'link-upsert', link: link(undefined, 'ahmad', 'fahd') },
    ]);

    expect(projectWorkingRecord(state, null).links).toHaveLength(1);
  });

  it('does not project an id-less spouse link the record already holds in the other direction', () => {
    const married = withConfirmedSnapshot(emptyWorkingRecord(), {
      nodes: [person('ahmad', 'Ahmad'), person('fatima', 'Fatima')],
      links: [link('l-1', 'fatima', 'ahmad', 'marriage')],
    });
    // The server's spouse guard matches both orderings, so the client's must
    // too, or the canvas draws a second edge until `already_connected` lands.
    const state = applyPending(married, 'c1', [
      { kind: 'link-upsert', link: link(undefined, 'ahmad', 'fatima', 'marriage') },
    ]);

    expect(projectWorkingRecord(state, null).links).toHaveLength(1);
  });

  it('still projects a reversed pending parent link, which is a different claim', () => {
    const state = applyPending(seeded(), 'c1', [
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'ahmad') },
    ]);

    expect(projectWorkingRecord(state, null).links).toHaveLength(2);
  });
});

describe('revertPending', () => {
  it('restores the previous projection exactly and never touched `confirmed`', () => {
    const base = seeded();
    const before = projectWorkingRecord(base, null);

    const applied = applyPending(base, 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);
    projectWorkingRecord(applied, before);

    const reverted = revertPending(applied, 'c1');
    const after = projectWorkingRecord(reverted, before);

    expect(idsOf(after)).toEqual(idsOf(before));
    expect(after.links).toHaveLength(before.links.length);
    expect(reverted.confirmed).toBe(base.confirmed);
    expect(reverted.pending).toHaveLength(0);
  });

  it('leaves a second, concurrent Pending Change applied', () => {
    const twoInFlight = applyPending(
      applyPending(seeded(), 'c1', [
        { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      ]),
      'c2',
      [{ kind: 'person-upsert', person: person('mona', 'Mona') }]
    );

    const ids = idsOf(projectWorkingRecord(revertPending(twoInFlight, 'c1'), null));
    expect(ids).not.toContain('zaynab');
    expect(ids).toContain('mona');
  });
});

describe('dropPending', () => {
  it('is indistinguishable from revertPending in its effect on state', () => {
    const applied = applyPending(seeded(), 'c1', [
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'mona') },
    ]);

    expect(dropPending(applied, 'c1')).toEqual(revertPending(applied, 'c1'));
  });
});

describe('confirmPending', () => {
  it('folds the server rows into `confirmed` and the Pending Change disappears', () => {
    const applied = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);

    const confirmed = confirmPending(applied, 'c1', {
      persons: [person('zaynab', 'Zaynab', { familyCluster: 'Badran' })],
      links: [link('l-2', 'fahd', 'zaynab')],
    });

    expect(confirmed.pending).toHaveLength(0);
    expect(confirmed.confirmed.nodes.map((n) => n.id)).toContain('zaynab');
    expect(confirmed.confirmed.links.map((l) => l.id)).toContain('l-2');
    expect(projectWorkingRecord(confirmed, null).links.find((l) => l.target === 'zaynab')?.id).toBe(
      'l-2'
    );
  });

  it('lets the server row win wholesale over what was applied', () => {
    const applied = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'zaynab  ') },
    ]);

    const confirmed = confirmPending(applied, 'c1', {
      persons: [person('zaynab', 'Zaynab')],
    });

    expect(nodeById(projectWorkingRecord(confirmed, null), 'zaynab')?.firstName).toBe('Zaynab');
  });

  it('carries `isClaimed` across, because no `nodes` row can report it', () => {
    const claimed = withConfirmedSnapshot(emptyWorkingRecord(), {
      nodes: [person('fahd', 'Fahd', { isClaimed: true })],
      links: [],
    });
    const applied = applyPending(claimed, 'c1', [
      { kind: 'person-upsert', person: person('fahd', 'Fahd Badran', { isClaimed: true }) },
    ]);

    const confirmed = confirmPending(applied, 'c1', {
      persons: [person('fahd', 'Fahd Badran')],
    });

    expect(nodeById(projectWorkingRecord(confirmed, null), 'fahd')?.isClaimed).toBe(true);
  });

  it('applies removed ids reported by the server', () => {
    const applied = applyPending(seeded(), 'c1', [{ kind: 'person-remove', id: 'fahd' }]);

    const confirmed = confirmPending(applied, 'c1', {
      removedPersonIds: ['fahd'],
      removedLinkIds: ['l-1'],
    });

    expect(confirmed.confirmed.nodes.map((n) => n.id)).toEqual(['ahmad']);
    expect(confirmed.confirmed.links).toHaveLength(0);
  });
});

describe('folding', () => {
  it('drops a removed Person’s Kinship Links from the projection with no `link-remove`', () => {
    const state = applyPending(seeded(), 'c1', [{ kind: 'person-remove', id: 'fahd' }]);

    const projected = projectWorkingRecord(state, null);
    expect(idsOf(projected)).toEqual(['ahmad']);
    expect(projected.links).toHaveLength(0);
  });

  it('lets a `person-remove` after a `person-upsert` for the same id win', () => {
    const state = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'person-remove', id: 'zaynab' },
    ]);

    expect(idsOf(projectWorkingRecord(state, null))).not.toContain('zaynab');
  });

  it('lets a later `person-upsert` for the same id win', () => {
    const changes: RecordChange[] = [
      { kind: 'person-upsert', person: person('fahd', 'Fahd One') },
      { kind: 'person-upsert', person: person('fahd', 'Fahd Two') },
    ];
    const state = applyPending(seeded(), 'c1', changes);

    expect(nodeById(projectWorkingRecord(state, null), 'fahd')?.firstName).toBe('Fahd Two');
  });

  it('removes a Kinship Link by id', () => {
    const state = applyPending(seeded(), 'c1', [{ kind: 'link-remove', id: 'l-1' }]);

    expect(projectWorkingRecord(state, null).links).toHaveLength(0);
  });
});

describe('projectWorkingRecord identity', () => {
  it('hands back the same object for a Person whose facts are unchanged', () => {
    const state = seeded();
    const first = projectWorkingRecord(state, null);
    const ahmadBefore = nodeById(first, 'ahmad')!;

    const applied = applyPending(state, 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
    ]);
    const second = projectWorkingRecord(applied, first);

    expect(nodeById(second, 'ahmad')).toBe(ahmadBefore);
  });

  it('mints a new object for an edited Person, carrying x/y/z/fx/fy/fz across', () => {
    const state = seeded();
    const first = projectWorkingRecord(state, null);
    const fahd = nodeById(first, 'fahd')!;
    // The simulation writes coordinates onto the objects it was handed.
    Object.assign(fahd, { x: 1, y: 2, z: 3, fx: 1, fy: 2, fz: 3 });

    const renamed = applyPending(state, 'c1', [
      { kind: 'person-upsert', person: person('fahd', 'Fahd Badran') },
    ]);
    const second = projectWorkingRecord(renamed, first);
    const after = nodeById(second, 'fahd')!;

    expect(after).not.toBe(fahd);
    expect(after.firstName).toBe('Fahd Badran');
    expect([after.x, after.y, after.z, after.fx, after.fy, after.fz]).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('never hands out an object held in `confirmed`, so the simulation cannot write into it', () => {
    const state = seeded();
    const projected = projectWorkingRecord(state, null);

    expect(nodeById(projected, 'fahd')).not.toBe(state.confirmed.nodes[1]);
  });

  it('seeds a Person who has no position beside the relatives they were added to', () => {
    const state = seeded();
    const first = projectWorkingRecord(state, null);
    Object.assign(nodeById(first, 'fahd')!, { x: 100, y: 200, z: 300 });

    const applied = applyPending(state, 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);
    const zaynab = nodeById(projectWorkingRecord(applied, first), 'zaynab')!;

    expect(zaynab.z).toBe(300);
    expect(Math.hypot((zaynab.x ?? 0) - 100, (zaynab.y ?? 0) - 200)).toBeCloseTo(40, 5);
  });

  it('re-mints a Kinship Link whose endpoint object the projection replaced', () => {
    const state = seeded();
    const first = projectWorkingRecord(state, null);
    // d3-force resolves string endpoints into the node objects, in place.
    first.links[0].source = nodeById(first, 'ahmad')!;
    first.links[0].target = nodeById(first, 'fahd')!;
    const before = first.links[0];

    const unchanged = projectWorkingRecord(state, first);
    expect(unchanged.links[0]).toBe(before);

    const renamed = applyPending(state, 'c1', [
      { kind: 'person-upsert', person: person('fahd', 'Fahd Badran') },
    ]);
    const after = projectWorkingRecord(renamed, first);

    // A reused link would still point at the discarded Fahd, and d3 does not
    // re-resolve an endpoint that is already an object.
    expect(after.links[0]).not.toBe(before);
    expect(after.links[0].target).toBe('fahd');
  });
});

describe('withConfirmedSnapshot', () => {
  it('keeps an in-flight Pending Change applied', () => {
    const applied = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
    ]);

    const reloaded = withConfirmedSnapshot(applied, {
      nodes: [person('ahmad', 'Ahmad'), person('fahd', 'Fahd'), person('mona', 'Mona')],
      links: [link('l-1', 'ahmad', 'fahd')],
    });

    const ids = idsOf(projectWorkingRecord(reloaded, null));
    expect(ids).toContain('mona');
    expect(ids).toContain('zaynab');
    expect(reloaded.pending).toHaveLength(1);
  });
});

describe('confirmed', () => {
  it('excludes pending Kinship Links, which permission derivation reads it for', () => {
    const applied = applyPending(seeded(), 'c1', [
      { kind: 'person-upsert', person: person('zaynab', 'Zaynab') },
      { kind: 'link-upsert', link: link(undefined, 'fahd', 'zaynab') },
    ]);

    expect(applied.confirmed.links.map((l) => l.id)).toEqual(['l-1']);
    expect(projectWorkingRecord(applied, null).links).toHaveLength(2);
  });
});

describe('emptyWorkingRecord', () => {
  it('projects an empty graph', () => {
    expect(projectWorkingRecord(emptyWorkingRecord(), null)).toEqual({ nodes: [], links: [] });
  });
});
