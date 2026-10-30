import { describe, it, expect } from 'vitest';
import { createRecorder, type Recorder } from './recorder';
import {
  initialLifecycleState,
  lifecycleReducer,
  startLifecycleAction,
  abortLifecycleAction,
  lifecycleKey,
  type LifecycleKind,
  type LifecycleState,
  type LifecycleSubject,
} from './lifecycle';
import { MAX_CLUSTER_LENGTH, MAX_PERSON_NAME_LENGTH, TreeRecordError } from './treeRecord';
import {
  emptyWorkingRecord,
  projectWorkingRecord,
  withConfirmedSnapshot,
  type WorkingRecordState,
} from './workingRecord';
import { createWriteSequencer } from './writeSequencer';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

interface SentRequest {
  path: string;
  method: string;
  body: Record<string, unknown> | Record<string, unknown>[] | null;
}

const USER = { userId: 'user-1', sessionToken: 'token-1' };

const linkRow = (id: string, source: string, target: string, type = 'parent', role: string | null = null) => ({
  id,
  source_node_id: source,
  target_node_id: target,
  type,
  parent_role: role,
});

const nodeRow = (id: string, firstName: string, gender: string | null = null) => ({
  id,
  first_name: firstName,
  gender,
  paternal_family_cluster: 'Server cluster',
  maternal_family_cluster: null,
  created_at: '2026-10-30T10:00:00Z',
});

/** The server's happy answer to each request the Recorder can make. */
function answerFor({ path, method, body }: SentRequest): unknown {
  const sent = (body ?? {}) as Record<string, string>;
  if (path.endsWith('/rpc/create_relative_secure')) {
    return {
      success: true,
      nodes: [nodeRow(sent.p_new_node_id, sent.new_first_name, sent.p_gender ?? null)],
      links: [linkRow('new-link', sent.target_node_id, sent.p_new_node_id)],
    };
  }
  if (path.endsWith('/rpc/link_existing_relative_secure')) {
    return { success: true, links: [linkRow('new-link', sent.target_node_id, sent.existing_node_id)] };
  }
  if (path.endsWith('/rpc/admin_delete_node_secure')) return { success: true, removed_link_ids: [] };
  if (path.endsWith('/nodes') && method === 'POST') return [nodeRow(sent.id, sent.first_name)];
  if (path.includes('/nodes?id=eq.') && method === 'PATCH') {
    return [nodeRow(path.split('eq.')[1], sent.first_name)];
  }
  if (path.endsWith('/links') && method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    return rows.map((row, i) => {
      const r = row as Record<string, string>;
      return linkRow(`new-link-${i}`, r.source_node_id, r.target_node_id, r.type, r.parent_role);
    });
  }
  if (path.includes('/links?id=eq.') && method === 'PATCH') {
    return [linkRow(path.split('eq.')[1], sent.source_node_id, sent.target_node_id, sent.type, sent.parent_role)];
  }
  if (path.includes('/links?id=eq.') && method === 'DELETE') return [linkRow(path.split('eq.')[1], 'a', 'b')];
  return [];
}

/**
 * Everything real but the network: the write sequencer, the Tree Record seam
 * and the lifecycle machine, with an in-memory `fetch` adapter beneath them.
 */
function harness(graph: FamilyGraph, { isAdmin = false, signedIn = true } = {}) {
  let record: WorkingRecordState = withConfirmedSnapshot(emptyWorkingRecord(), graph);
  let lifecycles: LifecycleState = initialLifecycleState;
  const startedOn: FamilyGraph[] = [];
  const sent: SentRequest[] = [];
  let answer: (request: SentRequest) => Response | Promise<Response> = (request) =>
    new Response(JSON.stringify(answerFor(request)), { status: 200 });

  const recorder: Recorder = createRecorder({
    identity: signedIn ? { ...USER, isAdmin } : null,
    graph: () => projectWorkingRecord(record, null),
    write: createWriteSequencer({
      current: () => record,
      advance: (next) => {
        record = next;
      },
    }),
    lifecycles: {
      start: (kind, subject) => {
        startedOn.push(projectWorkingRecord(record, null));
        lifecycles = lifecycleReducer(lifecycles, startLifecycleAction(kind, subject, '2d', 0));
      },
      abort: (kind, subject) => {
        lifecycles = lifecycleReducer(lifecycles, abortLifecycleAction(lifecycleKey(kind, subject), 1));
      },
    },
    config: {
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'test-key',
      fetch: (async (url: string, init?: RequestInit) => {
        const request: SentRequest = {
          path: url.replace('https://example.supabase.co/rest/v1', ''),
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        };
        sent.push(request);
        return answer(request);
      }) as typeof fetch,
    },
  });

  return {
    recorder,
    sent,
    startedOn,
    answerWith: (next: typeof answer) => {
      answer = next;
    },
    working: () => projectWorkingRecord(record, null),
    confirmed: () => record.confirmed,
    pendingCount: () => record.pending.length,
    phaseOf: (kind: LifecycleKind, subject: LifecycleSubject) =>
      lifecycles.lifecycles[lifecycleKey(kind, subject)]?.phase ?? null,
    spawning: () =>
      Object.values(lifecycles.lifecycles)
        .filter((l) => l.kind === 'spawn' && l.phase === 'playing')
        .map((l) => l.subject),
  };
}

const person = (id: string, firstName: string, extra: Partial<FamilyNode> = {}): FamilyNode => ({
  id,
  firstName,
  ...extra,
});

const link = (id: string, source: string, target: string, type: FamilyLink['type'] = 'parent'): FamilyLink => ({
  id,
  source,
  target,
  type,
});

const refusal = () => new Response(JSON.stringify({ code: 'P0001', message: 'Refused by rule' }), { status: 400 });

/** A family: Hala is married to Omar and has parents Nabil and Rima. */
const FAMILY: FamilyGraph = {
  nodes: [
    person('hala', 'Hala', { gender: 'female' }),
    person('omar', 'Omar', { gender: 'male' }),
    person('nabil', 'Nabil', { gender: 'male' }),
    person('rima', 'Rima', { gender: 'female' }),
    person('sami', 'Sami'),
    person('dana', 'Dana', { gender: 'female' }),
    person('tariq', 'Tariq', { gender: 'male' }),
  ],
  links: [
    link('l-spouse', 'hala', 'omar', 'marriage'),
    link('l-father', 'nabil', 'hala'),
    link('l-mother', 'rima', 'hala'),
  ],
};

const pendingLinkTo = (graph: FamilyGraph, target: string) =>
  graph.links.filter((l) => l.target === target).map((l) => [l.source, l.parentRole]);

describe('addRelative', () => {
  it('draws the Person and their Kinship Links, and Spawns them all, before the server answers', () => {
    const { recorder, working, spawning, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.addRelative({ anchorId: 'hala', relation: 'child', firstName: 'Lina', otherParentId: 'omar' });

    const lina = working().nodes.find((n) => n.firstName === 'Lina');
    expect(lina).toBeDefined();
    expect(pendingLinkTo(working(), lina!.id)).toEqual([
      ['hala', 'mother'],
      ['omar', 'father'],
    ]);
    expect(spawning()).toEqual([
      { kind: 'node', id: lina!.id },
      { kind: 'link', aId: 'hala', bId: lina!.id },
      { kind: 'link', aId: 'omar', bId: lina!.id },
    ]);
  });

  it('starts the Spawn before the Person is drawn, so no frame shows them without it', () => {
    const { recorder, startedOn, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina' });

    expect(startedOn[0].nodes).toHaveLength(FAMILY.nodes.length);
  });

  it('draws the gender it was given while the Pending Change is held', () => {
    const { recorder, working, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina', gender: 'female' });

    expect(working().nodes.find((n) => n.firstName === 'Lina')?.gender).toBe('female');
  });

  it('keeps two Pending Changes apart: one rejecting leaves the other drawn', async () => {
    const { recorder, working, answerWith } = harness(FAMILY);
    let reject: (reason: Error) => void = () => {};
    answerWith(() => new Promise((_, rejectFetch) => (reject = rejectFetch)));
    const first = recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'First' });
    const rejectFirst = reject;
    void recorder.addRelative({ anchorId: 'sami', relation: 'spouse', firstName: 'Second' });

    rejectFirst(new Error('offline'));
    await expect(first).rejects.toBeInstanceOf(TreeRecordError);

    const names = working().nodes.map((n) => n.firstName);
    expect(names).not.toContain('First');
    expect(names).toContain('Second');
  });

  it('asks the server for the same Person it drew, and folds in what the server answered', async () => {
    const { recorder, working, sent, pendingCount } = harness(FAMILY);

    await recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina', gender: 'female' });

    expect(sent).toHaveLength(1);
    const body = sent[0].body as Record<string, string>;
    expect(sent[0].path).toBe('/rpc/create_relative_secure');
    expect(body).toMatchObject({
      new_first_name: 'Lina',
      rel_type: 'spouse',
      target_node_id: 'hala',
      creator_id: 'user-1',
      p_gender: 'female',
    });
    expect(pendingCount()).toBe(0);
    expect(working().nodes.find((n) => n.id === body.p_new_node_id)?.familyCluster).toBe('Server cluster');
  });

  it('trims the name and caps it at the Tree Record limit, on the canvas and in the write alike', () => {
    const { recorder, working, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));
    const long = 'x'.repeat(MAX_PERSON_NAME_LENGTH + 50);

    void recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: `  ${long}  ` });

    const capped = 'x'.repeat(MAX_PERSON_NAME_LENGTH);
    expect(working().nodes.some((n) => n.firstName === capped)).toBe(true);
    expect((sent[0].body as Record<string, string>).new_first_name).toBe(capped);
  });

  it('refuses a blank name before anything is drawn, Spawned or sent', async () => {
    const { recorder, working, sent, startedOn } = harness(FAMILY);

    await expect(recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: '   ' })).rejects.toMatchObject({
      kind: 'refused',
    });

    expect(working().nodes).toHaveLength(FAMILY.nodes.length);
    expect(sent).toHaveLength(0);
    expect(startedOn).toHaveLength(0);
  });

  it('on rejection, removes the Person and unwinds every Spawn subject, then rethrows', async () => {
    const { recorder, working, phaseOf, sent, answerWith } = harness(FAMILY);
    answerWith(refusal);

    await expect(
      recorder.addRelative({ anchorId: 'hala', relation: 'child', firstName: 'Lina', otherParentId: 'omar' })
    ).rejects.toBeInstanceOf(TreeRecordError);

    const id = (sent[0].body as Record<string, string>).p_new_node_id;
    expect(working().nodes.some((n) => n.id === id)).toBe(false);
    expect(working().links.some((l) => l.target === id)).toBe(false);
    expect(phaseOf('spawn', { kind: 'node', id })).toBe('aborting');
    expect(phaseOf('spawn', { kind: 'link', aId: 'hala', bId: id })).toBe('aborting');
    expect(phaseOf('spawn', { kind: 'link', aId: 'omar', bId: id })).toBe('aborting');
  });

  describe('the parent role', () => {
    const pendingRoleFor = (intent: Parameters<Recorder['addRelative']>[0]) => {
      const { recorder, working, sent, answerWith } = harness(FAMILY);
      answerWith(() => new Promise(() => {}));
      void recorder.addRelative(intent);
      const id = (sent[0].body as Record<string, string>).p_new_node_id;
      const drawn = working().links.find((l) => l.source === intent.anchorId && l.target === id);
      const reversed = working().links.find((l) => l.source === id && l.target === intent.anchorId);
      return { drawn: (drawn ?? reversed)?.parentRole ?? null, body: sent[0].body as Record<string, string> };
    };

    it("takes a child's role from the anchor's recorded gender, over a pick", () => {
      const { drawn, body } = pendingRoleFor({ anchorId: 'hala', relation: 'child', firstName: 'Lina', parentRole: 'father' });
      expect(drawn).toBe('mother');
      expect(body.p_parent_role).toBe('mother');
    });

    it("takes a child's role from the pick when the anchor's gender is not recorded", () => {
      const { drawn, body } = pendingRoleFor({ anchorId: 'sami', relation: 'child', firstName: 'Lina', parentRole: 'father' });
      expect(drawn).toBe('father');
      expect(body.p_parent_role).toBe('father');
    });

    it('takes a new parent\'s role from the gender being entered', () => {
      const { drawn, body } = pendingRoleFor({ anchorId: 'sami', relation: 'parent', firstName: 'Lina', gender: 'female' });
      expect(drawn).toBe('mother');
      expect(body.p_parent_role).toBeUndefined();
    });

    it('draws no role for a spouse', () => {
      expect(pendingRoleFor({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina', parentRole: 'mother' }).drawn).toBeNull();
    });
  });

  describe('the other parent', () => {
    it('links a spouse the links still offer, and sends them in the one write', () => {
      const { recorder, sent, answerWith } = harness(FAMILY);
      answerWith(() => new Promise(() => {}));
      void recorder.addRelative({ anchorId: 'hala', relation: 'child', firstName: 'Lina', otherParentId: 'omar' });
      expect(sent).toHaveLength(1);
      expect((sent[0].body as Record<string, string>).p_other_parent_id).toBe('omar');
    });

    it('links nobody the links no longer offer', () => {
      const { recorder, working, sent, answerWith } = harness(FAMILY);
      answerWith(() => new Promise(() => {}));
      void recorder.addRelative({ anchorId: 'hala', relation: 'child', firstName: 'Lina', otherParentId: 'tariq' });
      const body = sent[0].body as Record<string, string>;
      expect(body.p_other_parent_id).toBeUndefined();
      expect(pendingLinkTo(working(), body.p_new_node_id)).toEqual([['hala', 'mother']]);
    });

    it('ignores an other parent on anything but a child', () => {
      const { recorder, sent, answerWith } = harness(FAMILY);
      answerWith(() => new Promise(() => {}));
      void recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina', otherParentId: 'omar' });
      expect((sent[0].body as Record<string, string>).p_other_parent_id).toBeUndefined();
    });
  });

  it("fans a sibling out over the anchor's parents, and Spawns each link", () => {
    const { recorder, working, spawning, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.addRelative({ anchorId: 'hala', relation: 'sibling', firstName: 'Lina' });

    const id = (sent[0].body as Record<string, string>).p_new_node_id;
    expect(working().links.filter((l) => l.target === id).map((l) => l.source)).toEqual(['nabil', 'rima']);
    expect(spawning()).toHaveLength(3);
  });

  it('reads the latest links, including a Pending Change made after the Recorder was created', () => {
    const { recorder, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.addRelative({ anchorId: 'sami', relation: 'spouse', firstName: 'Lina' });
    const linaId = (sent[0].body as Record<string, string>).p_new_node_id;
    void recorder.addRelative({ anchorId: 'sami', relation: 'child', firstName: 'Zaid', otherParentId: linaId });

    expect((sent[1].body as Record<string, string>).p_other_parent_id).toBe(linaId);
  });

  it('refuses when nobody is signed in', async () => {
    const { recorder, sent } = harness(FAMILY, { signedIn: false });
    await expect(recorder.addRelative({ anchorId: 'hala', relation: 'spouse', firstName: 'Lina' })).rejects.toMatchObject({
      kind: 'not-authorized',
    });
    expect(sent).toHaveLength(0);
  });
});

describe('connectRelative', () => {
  it('draws and Spawns the Kinship Link, and writes it through the RPC for a non-admin', () => {
    const { recorder, working, spawning, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'child' });

    expect(pendingLinkTo(working(), 'sami')).toEqual([['hala', 'mother']]);
    expect(spawning()).toEqual([{ kind: 'link', aId: 'hala', bId: 'sami' }]);
    expect(sent[0].path).toBe('/rpc/link_existing_relative_secure');
    expect(sent[0].body).toMatchObject({ existing_node_id: 'sami', rel_type: 'child', target_node_id: 'hala', p_parent_role: 'mother' });
  });

  it('writes it over REST for an admin, with the same intent', () => {
    const { recorder, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.connectRelative({ anchorId: 'sami', existingId: 'dana', relation: 'parent' });

    expect(sent[0].path).toBe('/links');
    expect(sent[0].body).toMatchObject({ source_node_id: 'dana', target_node_id: 'sami', parent_role: 'mother' });
  });

  it("takes an existing parent's role from that Person's gender", () => {
    const { recorder, working, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));
    void recorder.connectRelative({ anchorId: 'sami', existingId: 'tariq', relation: 'parent' });
    expect(pendingLinkTo(working(), 'sami')).toEqual([['tariq', 'father']]);
  });

  it('refuses a sibling outright: no write, no drawing, no Spawn', async () => {
    const { recorder, working, startedOn, sent, pendingCount } = harness(FAMILY);

    await expect(
      recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'sibling' })
    ).rejects.toMatchObject({ kind: 'refused' });

    expect(sent).toHaveLength(0);
    expect(pendingCount()).toBe(0);
    expect(startedOn).toHaveLength(0);
    expect(pendingLinkTo(working(), 'sami')).toEqual([]);
  });

  it('gives an existing child the other parent, unless they already have one', () => {
    const { recorder, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'child', otherParentId: 'omar' });
    void recorder.connectRelative({ anchorId: 'omar', existingId: 'hala', relation: 'child', otherParentId: 'hala' });

    expect((sent[0].body as Record<string, string>).p_other_parent_id).toBe('omar');
    expect((sent[1].body as Record<string, string>).p_other_parent_id).toBeUndefined();
  });

  it('takes an already-existing Kinship Link as no failure: resolves and drops the Pending Change', async () => {
    const { recorder, phaseOf, pendingCount, answerWith, confirmed } = harness(FAMILY);
    answerWith(() => new Response(JSON.stringify({ success: true, already_connected: true, links: [] }), { status: 200 }));

    await expect(
      recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'child' })
    ).resolves.toBeUndefined();

    expect(pendingCount()).toBe(0);
    expect(confirmed().links).toHaveLength(FAMILY.links.length);
    expect(phaseOf('spawn', { kind: 'link', aId: 'hala', bId: 'sami' })).toBe('playing');
  });

  it('does not fold in rows from a write the server calls already connected', async () => {
    const { recorder, confirmed, answerWith } = harness(FAMILY);
    answerWith(
      () =>
        new Response(JSON.stringify({ success: true, already_connected: true, links: [linkRow('old', 'hala', 'sami')] }), {
          status: 200,
        })
    );

    await recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'child' });

    expect(confirmed().links.some((l) => l.id === 'old')).toBe(false);
  });

  it('on rejection, removes the Kinship Link and unwinds its Spawn', async () => {
    const { recorder, working, phaseOf, answerWith } = harness(FAMILY);
    answerWith(refusal);

    await expect(
      recorder.connectRelative({ anchorId: 'hala', existingId: 'sami', relation: 'child' })
    ).rejects.toBeInstanceOf(TreeRecordError);

    expect(pendingLinkTo(working(), 'sami')).toEqual([]);
    expect(phaseOf('spawn', { kind: 'link', aId: 'hala', bId: 'sami' })).toBe('aborting');
  });
});

describe('connectPersons', () => {
  it('draws, Spawns and writes the Kinship Link between two chosen Persons', () => {
    const { recorder, working, spawning, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.connectPersons({ sourceId: 'sami', targetId: 'dana', type: 'divorce', parentRole: 'mother' });

    expect(working().links.find((l) => l.source === 'sami')).toMatchObject({ target: 'dana', type: 'divorce', parentRole: null });
    expect(spawning()).toEqual([{ kind: 'link', aId: 'sami', bId: 'dana' }]);
    expect(sent[0].body).toMatchObject({ source_node_id: 'sami', target_node_id: 'dana', type: 'divorce' });
  });

  it('keeps the role the picker chose on a parent link, and adds the still-offered other parent', () => {
    const { recorder, working, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.connectPersons({ sourceId: 'hala', targetId: 'sami', type: 'parent', parentRole: 'mother', otherParentId: 'omar' });

    expect(pendingLinkTo(working(), 'sami')).toEqual([
      ['hala', 'mother'],
      ['omar', 'father'],
    ]);
    expect(Array.isArray(sent[0].body) && sent[0].body).toHaveLength(2);
  });

  it('links no other parent the links no longer offer', () => {
    const { recorder, working, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.connectPersons({ sourceId: 'hala', targetId: 'sami', type: 'parent', otherParentId: 'tariq' });

    expect(pendingLinkTo(working(), 'sami')).toEqual([['hala', null]]);
    expect(Array.isArray(sent[0].body)).toBe(false);
  });

  it('ignores an other parent on anything but a parent link', async () => {
    const { recorder, sent } = harness(FAMILY, { isAdmin: true });

    await recorder.connectPersons({ sourceId: 'hala', targetId: 'sami', type: 'marriage', otherParentId: 'omar' });

    expect(sent).toHaveLength(1);
    expect(Array.isArray(sent[0].body)).toBe(false);
  });

  it('on rejection, unwinds both Spawn subjects', async () => {
    const { recorder, phaseOf, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(refusal);

    await expect(
      recorder.connectPersons({ sourceId: 'hala', targetId: 'sami', type: 'parent', otherParentId: 'omar' })
    ).rejects.toBeInstanceOf(TreeRecordError);

    expect(phaseOf('spawn', { kind: 'link', aId: 'hala', bId: 'sami' })).toBe('aborting');
    expect(phaseOf('spawn', { kind: 'link', aId: 'omar', bId: 'sami' })).toBe('aborting');
  });
});

describe('addStandalonePerson', () => {
  it('draws, Spawns and writes a Person with no Kinship Link, trimming the clusters', () => {
    const { recorder, working, spawning, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.addStandalonePerson({ firstName: ' Lina ', paternalCluster: ' Badran ', maternalCluster: '   ' });

    const lina = working().nodes.find((n) => n.firstName === 'Lina');
    expect(lina).toMatchObject({ familyCluster: 'Badran' });
    expect(lina?.maternalFamilyCluster).toBeUndefined();
    expect(spawning()).toEqual([{ kind: 'node', id: lina!.id }]);
    expect(sent[0].path).toBe('/nodes');
    expect(sent[0].body).toMatchObject({
      id: lina!.id,
      first_name: 'Lina',
      paternal_family_cluster: 'Badran',
      maternal_family_cluster: null,
    });
  });

  it('caps the clusters at the Tree Record limit', () => {
    const { recorder, working, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.addStandalonePerson({ firstName: 'Lina', paternalCluster: 'x'.repeat(MAX_CLUSTER_LENGTH + 1) });

    expect(working().nodes.find((n) => n.firstName === 'Lina')?.familyCluster).toHaveLength(MAX_CLUSTER_LENGTH);
  });

  it('on refusal for a non-admin, removes the Person and unwinds the Spawn', async () => {
    const { recorder, working, spawning, sent } = harness(FAMILY);

    await expect(recorder.addStandalonePerson({ firstName: 'Lina' })).rejects.toMatchObject({ kind: 'refused' });

    expect(sent).toHaveLength(0);
    expect(working().nodes.some((n) => n.firstName === 'Lina')).toBe(false);
    expect(spawning()).toEqual([]);
  });
});

describe('editPerson', () => {
  const hala = FAMILY.nodes[0];

  it('redraws the Person now and sends a gender only when it changed', () => {
    const { recorder, working, sent, spawning, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));

    void recorder.editPerson({ person: hala, firstName: ' Halah ', gender: 'female' });

    expect(working().nodes.find((n) => n.id === 'hala')?.firstName).toBe('Halah');
    expect(sent[0].path).toBe('/nodes?id=eq.hala');
    expect(sent[0].body).toEqual({ first_name: 'Halah' });
    expect(spawning()).toEqual([]);
  });

  it('sends a changed gender', () => {
    const { recorder, sent, answerWith } = harness(FAMILY);
    answerWith(() => new Promise(() => {}));
    void recorder.editPerson({ person: hala, firstName: 'Hala', gender: null });
    expect(sent[0].body).toEqual({ first_name: 'Hala', gender: null });
  });

  it('applies cluster edits for an admin only, leaving the rest as they were', () => {
    const clustered = person('c', 'Cala', { familyCluster: 'Old', maternalFamilyCluster: 'Older' });
    const graph = { nodes: [clustered], links: [] };

    const nonAdmin = harness(graph);
    nonAdmin.answerWith(() => new Promise(() => {}));
    void nonAdmin.recorder.editPerson({ person: clustered, firstName: 'Cala', gender: null, paternalCluster: 'New', maternalCluster: 'Newer' });
    expect(nonAdmin.working().nodes[0]).toMatchObject({ familyCluster: 'Old', maternalFamilyCluster: 'Older' });
    expect(nonAdmin.sent[0].body).not.toHaveProperty('paternal_family_cluster');

    const admin = harness(graph, { isAdmin: true });
    admin.answerWith(() => new Promise(() => {}));
    void admin.recorder.editPerson({ person: clustered, firstName: 'Cala', gender: null, paternalCluster: 'New', maternalCluster: 'Newer' });
    expect(admin.working().nodes[0]).toMatchObject({ familyCluster: 'New', maternalFamilyCluster: 'Newer' });
    expect(admin.sent[0].body).toMatchObject({ paternal_family_cluster: 'New', maternal_family_cluster: 'Newer' });
  });

  it('on rejection, puts the Person back', async () => {
    const { recorder, working, answerWith } = harness(FAMILY);
    answerWith(refusal);
    await expect(recorder.editPerson({ person: hala, firstName: 'Halah', gender: 'female' })).rejects.toBeInstanceOf(TreeRecordError);
    expect(working().nodes.find((n) => n.id === 'hala')?.firstName).toBe('Hala');
  });
});

describe('editLink', () => {
  it('redraws the re-pointed Kinship Link now, with no Spawn', () => {
    const { recorder, working, sent, spawning, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.editLink({ id: 'l-father', source: 'tariq', target: 'hala', type: 'parent', parentRole: 'father' });

    expect(working().links.find((l) => l.id === 'l-father')).toMatchObject({ source: 'tariq', parentRole: 'father' });
    expect(sent[0].path).toBe('/links?id=eq.l-father');
    expect(sent[0].body).toEqual({ source_node_id: 'tariq', target_node_id: 'hala', type: 'parent', parent_role: 'father' });
    expect(spawning()).toEqual([]);
  });

  it('drops the role on anything but a parent link', () => {
    const { recorder, working, sent, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.editLink({ id: 'l-spouse', source: 'hala', target: 'omar', type: 'divorce', parentRole: 'mother' });

    expect(working().links.find((l) => l.id === 'l-spouse')?.parentRole).toBeNull();
    expect(sent[0].body).toMatchObject({ parent_role: null });
  });
});

describe('removePerson', () => {
  it('starts the Dissolve and takes the Person off the canvas before the server answers', () => {
    const { recorder, working, phaseOf, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.removePerson('sami');

    expect(working().nodes.some((n) => n.id === 'sami')).toBe(false);
    expect(phaseOf('dissolve', { kind: 'node', id: 'sami' })).toBe('playing');
  });

  it('on rejection, puts the Person back and unwinds the Dissolve', async () => {
    const { recorder, working, phaseOf, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Response('{"message":"nope"}', { status: 500 }));

    await expect(recorder.removePerson('sami')).rejects.toBeInstanceOf(TreeRecordError);

    expect(working().nodes.some((n) => n.id === 'sami')).toBe(true);
    expect(phaseOf('dissolve', { kind: 'node', id: 'sami' })).toBe('aborting');
  });
});

describe('removeLink', () => {
  const father = { id: 'l-father', aId: 'nabil', bId: 'hala' };

  it('starts the Dissolve and takes the Kinship Link off the canvas before the server answers', () => {
    const { recorder, working, phaseOf, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Promise(() => {}));

    void recorder.removeLink(father);

    expect(working().links.some((l) => l.id === 'l-father')).toBe(false);
    expect(phaseOf('dissolve', { kind: 'link', aId: 'nabil', bId: 'hala' })).toBe('playing');
  });

  it('on rejection, puts the Kinship Link back and unwinds the Dissolve', async () => {
    const { recorder, working, phaseOf, answerWith } = harness(FAMILY, { isAdmin: true });
    answerWith(() => new Response('{"message":"nope"}', { status: 500 }));

    await expect(recorder.removeLink(father)).rejects.toBeInstanceOf(TreeRecordError);

    expect(working().links.some((l) => l.id === 'l-father')).toBe(true);
    expect(phaseOf('dissolve', { kind: 'link', aId: 'nabil', bId: 'hala' })).toBe('aborting');
  });
});
