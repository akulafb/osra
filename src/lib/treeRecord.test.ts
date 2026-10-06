import { describe, it, expect, vi } from 'vitest';
import {
  createTreeRecord,
  parentRoleForGender,
  pendingKinshipLinks,
  relativeToKinshipLink,
  relativeToKinshipLinks,
  TreeRecordError,
  isTreeRecordError,
} from './treeRecord';
import type { FamilyLink, FamilyNode } from '../types/graph';

const TEST_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-anon-key',
};

/** A `public.nodes` row exactly as PostgREST returns it. */
const NODE_ROW = {
  id: 'node-1',
  first_name: 'Farah',
  paternal_family_cluster: 'Badran',
  maternal_family_cluster: null,
  created_by_user_id: 'user-1',
  created_at: '2026-08-26T10:00:00Z',
};

/** The Person `NODE_ROW` decodes to. */
const PERSON = {
  id: 'node-1',
  firstName: 'Farah',
  createdAt: '2026-08-26T10:00:00Z',
  familyCluster: 'Badran',
};

const linkRow = (
  id: string,
  source: string,
  target: string,
  type: 'parent' | 'marriage' | 'divorce' = 'parent',
  parentRole: 'mother' | 'father' | null = null
) => ({
  id,
  source_node_id: source,
  target_node_id: target,
  type,
  parent_role: parentRole,
  created_by_user_id: 'user-1',
  created_at: '2026-08-26T10:00:00Z',
});

describe('treeRecord module', () => {
  describe('First red test / defect fix: divorce refused for non-admins', () => {
    it('refuses divorce link creation for non-admin without calling fetch or coercing to child', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'token-123' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addLink({
          sourceId: 'person-1',
          targetId: 'person-2',
          type: 'divorce',
        })
      ).rejects.toMatchObject({
        kind: 'refused',
        message: expect.stringContaining('Only administrators can record a divorce'),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('addLink', () => {
    it('routes to REST POST /links for admin users and returns the inserted Kinship Link', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([linkRow('link-9', 'p1', 'p2', 'marriage')]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({
        sourceId: 'p1',
        targetId: 'p2',
        type: 'marriage',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer admin-token');
      expect(init.headers['apikey']).toBe('test-anon-key');
      expect(init.headers['Prefer']).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual({
        source_node_id: 'p1',
        target_node_id: 'p2',
        type: 'marriage',
        parent_role: null,
        created_by_user_id: 'admin-1',
      });
      expect(rows).toEqual({
        links: [{ id: 'link-9', source: 'p1', target: 'p2', type: 'marriage' }],
        alreadyConnected: false,
      });
    });

    it('sends the publishable key on apikey only, never as the bearer, when there is no session', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([linkRow('link-9', 'p1', 'p2', 'marriage')]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: null },
        { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test', fetch: mockFetch }
      );

      await record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['apikey']).toBe('sb_publishable_test');
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('routes marriage to RPC link_existing_relative_secure for non-admin and returns its rows', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            already_connected: false,
            links: [linkRow('link-7', 'p1', 'p2', 'marriage')],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({
        sourceId: 'p1',
        targetId: 'p2',
        type: 'marriage',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/link_existing_relative_secure');
      expect(JSON.parse(init.body)).toEqual({
        existing_node_id: 'p2',
        rel_type: 'spouse',
        target_node_id: 'p1',
        creator_id: 'user-1',
      });
      expect(rows).toEqual({
        links: [{ id: 'link-7', source: 'p1', target: 'p2', type: 'marriage' }],
        alreadyConnected: false,
      });
    });

    it('routes parent link to RPC link_existing_relative_secure for non-admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            already_connected: false,
            links: [linkRow('link-8', 'parent-1', 'child-1', 'parent', 'father')],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({
        sourceId: 'parent-1',
        targetId: 'child-1',
        type: 'parent',
        parentRole: 'father',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/link_existing_relative_secure');
      expect(JSON.parse(init.body)).toEqual({
        existing_node_id: 'child-1',
        rel_type: 'child',
        target_node_id: 'parent-1',
        creator_id: 'user-1',
        p_parent_role: 'father',
      });
      expect(rows.links).toEqual([
        { id: 'link-8', source: 'parent-1', target: 'child-1', type: 'parent', parentRole: 'father' },
      ]);
    });

    /**
     * The server's third outcome: accepted, and it inserted nothing. Not an
     * error, and distinguishable from a confirmed write (LIN-58's D10).
     */
    it('reports already_connected as an accepted write with no rows', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            new_node_id: 'p2',
            already_connected: true,
            links: [],
            message: 'Already connected',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' });

      expect(rows).toEqual({ links: [], alreadyConnected: true });
    });
  });

  describe('addLink with the other parent (LIN-79)', () => {
    const bothRows = [
      linkRow('link-20', 'fadi', 'ali', 'parent', 'father'),
      linkRow('link-21', 'ebtisam', 'ali', 'parent', 'mother'),
    ];
    const bothLinks = [
      { id: 'link-20', source: 'fadi', target: 'ali', type: 'parent', parentRole: 'father' },
      { id: 'link-21', source: 'ebtisam', target: 'ali', type: 'parent', parentRole: 'mother' },
    ];

    it('sends the other parent to link_existing_relative_secure for a non-admin and folds both links', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, already_connected: false, links: bothRows }), { status: 200 })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({ sourceId: 'fadi', targetId: 'ali', type: 'parent', otherParentId: 'ebtisam' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/link_existing_relative_secure');
      expect(JSON.parse(init.body)).toEqual({
        existing_node_id: 'ali',
        rel_type: 'child',
        target_node_id: 'fadi',
        creator_id: 'user-1',
        p_other_parent_id: 'ebtisam',
      });
      expect(rows).toEqual({ links: bothLinks, alreadyConnected: false });
    });

    it('posts both parent links as one array for an admin, so they are inserted together', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(bothRows), { status: 201 }));
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addLink({ sourceId: 'fadi', targetId: 'ali', type: 'parent', otherParentId: 'ebtisam' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links');
      expect(init.headers['Prefer']).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual([
        { source_node_id: 'fadi', target_node_id: 'ali', type: 'parent', parent_role: null, created_by_user_id: 'admin-1' },
        { source_node_id: 'ebtisam', target_node_id: 'ali', type: 'parent', parent_role: null, created_by_user_id: 'admin-1' },
      ]);
      expect(rows).toEqual({ links: bothLinks, alreadyConnected: false });
    });

    it('sends no other parent when none is given', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([linkRow('link-20', 'fadi', 'ali', 'parent', 'father')]), { status: 201 })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.addLink({ sourceId: 'fadi', targetId: 'ali', type: 'parent', otherParentId: null });

      expect(Array.isArray(JSON.parse(mockFetch.mock.calls[0][1].body))).toBe(false);
    });

    it.each([true, false])('refuses an other parent on a link that is not a parent link (admin: %s)', async (isAdmin) => {
      const mockFetch = vi.fn();
      const record = createTreeRecord({ userId: 'user-1', isAdmin, sessionToken: 't' }, { ...TEST_CONFIG, fetch: mockFetch });

      await expect(
        record.addLink({ sourceId: 'fadi', targetId: 'ebtisam', type: 'marriage', otherParentId: 'huda' })
      ).rejects.toMatchObject({ kind: 'refused' });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('addPerson', () => {
    it('creates relative atomically via RPC and returns the Person and every Kinship Link written', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            new_node_id: 'node-1',
            nodes: [NODE_ROW],
            links: [
              linkRow('link-1', 'parent-node', 'node-1', 'parent', 'mother'),
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({
        id: 'node-1',
        firstName: 'Farah',
        link: {
          targetId: 'parent-node',
          relation: 'child',
          parentRole: 'mother',
        },
      });

      expect(rows).toEqual({
        persons: [PERSON],
        links: [
          {
            id: 'link-1',
            source: 'parent-node',
            target: 'node-1',
            type: 'parent',
            parentRole: 'mother',
          },
        ],
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/create_relative_secure');
      expect(JSON.parse(init.body)).toEqual({
        new_first_name: 'Farah',
        rel_type: 'child',
        target_node_id: 'parent-node',
        creator_id: 'user-1',
        p_parent_role: 'mother',
        p_new_node_id: 'node-1',
      });
    });

    it('sends the other parent with a new child and returns both parent links', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            nodes: [NODE_ROW],
            links: [
              linkRow('link-1', 'huda', 'node-1', 'parent', 'mother'),
              linkRow('link-2', 'yusuf', 'node-1', 'parent', 'father'),
            ],
          }),
          { status: 200 }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({
        id: 'node-1',
        firstName: 'Farah',
        link: { targetId: 'huda', relation: 'child', otherParentId: 'yusuf' },
      });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
        new_first_name: 'Farah',
        rel_type: 'child',
        target_node_id: 'huda',
        creator_id: 'user-1',
        p_new_node_id: 'node-1',
        p_other_parent_id: 'yusuf',
      });
      expect(rows.links).toEqual([
        { id: 'link-1', source: 'huda', target: 'node-1', type: 'parent', parentRole: 'mother' },
        { id: 'link-2', source: 'yusuf', target: 'node-1', type: 'parent', parentRole: 'father' },
      ]);
    });

    it('refuses an other parent for any relation but child', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord({ userId: 'user-1', isAdmin: true, sessionToken: 't' }, { ...TEST_CONFIG, fetch: mockFetch });

      await expect(
        record.addPerson({ firstName: 'Farah', link: { targetId: 'huda', relation: 'spouse', otherParentId: 'yusuf' } })
      ).rejects.toMatchObject({ kind: 'refused' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends the new Person's gender and reads it back", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            nodes: [{ ...NODE_ROW, gender: 'female' }],
            links: [linkRow('link-1', 'node-1', 'child-node', 'parent', 'mother')],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({
        id: 'node-1',
        firstName: 'Farah',
        gender: 'female',
        link: { targetId: 'child-node', relation: 'parent' },
      });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
        new_first_name: 'Farah',
        rel_type: 'parent',
        target_node_id: 'child-node',
        creator_id: 'user-1',
        p_gender: 'female',
        p_new_node_id: 'node-1',
      });
      expect(rows.persons).toEqual([{ ...PERSON, gender: 'female' }]);
      // The server, not the client, gives the parent link its role from the gender.
      expect(rows.links?.[0].parentRole).toBe('mother');
    });

    it('sends the gender on a standalone Person', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ ...NODE_ROW, gender: 'male' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({ firstName: 'Farah', gender: 'male' });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ gender: 'male' });
      expect(rows.persons).toEqual([{ ...PERSON, gender: 'male' }]);
    });

    /**
     * A sibling addition writes one Person and one Kinship Link per parent the
     * anchor has. The client cannot know how many, or to whom.
     */
    it('returns every Kinship Link a sibling addition wrote', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            new_node_id: 'node-1',
            nodes: [NODE_ROW],
            links: [
              linkRow('link-1', 'mum', 'node-1'),
              linkRow('link-2', 'dad', 'node-1'),
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({
        id: 'node-1',
        firstName: 'Farah',
        link: { targetId: 'anchor', relation: 'sibling' },
      });

      expect(rows.links).toEqual([
        { id: 'link-1', source: 'mum', target: 'node-1', type: 'parent' },
        { id: 'link-2', source: 'dad', target: 'node-1', type: 'parent' },
      ]);
    });

    /**
     * The Person id is client-generated (LIN-58's D11), so a collision is
     * possible and arrives as a primary key violation inside a `success: false`
     * RPC envelope rather than as an HTTP status.
     */
    it('categorizes a colliding client-supplied Person id as conflict', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            message: 'duplicate key value violates unique constraint "nodes_pkey"',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({
          id: 'node-1',
          firstName: 'Farah',
          link: { targetId: 'anchor', relation: 'child' },
        })
      ).rejects.toMatchObject({ kind: 'conflict' });
    });

    /**
     * The RPC reports failure inside a 200 envelope, so `success !== false` with
     * no rows is a server that accepted the write and did not say what it wrote
     * — a database older than the migration, most likely. Not a confirmation.
     */
    it('rejects a create the server accepted without reporting the Person', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, new_node_id: 'node-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({
          firstName: 'Farah',
          link: { targetId: 'anchor', relation: 'child' },
        })
      ).rejects.toMatchObject({ kind: 'unknown' });
    });

    /**
     * `network` would tell the caller the write did not happen, and LIN-58's
     * sequencer reverts on a rejection. The write did happen.
     */
    it('reports an unreadable RPC envelope as unknown, not network', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({
          firstName: 'Farah',
          link: { targetId: 'anchor', relation: 'child' },
        })
      ).rejects.toMatchObject({ kind: 'unknown' });
    });

    it('creates standalone person via REST POST /nodes when link is omitted and user is admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ ...NODE_ROW, maternal_family_cluster: 'Kutob' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.addPerson({
        id: 'node-1',
        firstName: 'Farah',
        paternalCluster: 'Badran',
        maternalCluster: 'Kutob',
      });

      expect(rows).toEqual({
        persons: [{ ...PERSON, maternalFamilyCluster: 'Kutob' }],
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes');
      expect(init.headers['Prefer']).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual({
        id: 'node-1',
        first_name: 'Farah',
        paternal_family_cluster: 'Badran',
        maternal_family_cluster: 'Kutob',
        created_by_user_id: 'admin-1',
      });
    });

    it('refuses standalone person creation for non-admin', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({ firstName: 'Omar' })
      ).rejects.toMatchObject({
        kind: 'refused',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refuses empty first name', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({ firstName: '   ' })
      ).rejects.toMatchObject({
        kind: 'refused',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('editPerson', () => {
    it('sends cluster fields when admin edits person and returns the updated row', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ ...NODE_ROW, first_name: 'Updated Name' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editPerson({
        id: 'node-1',
        firstName: 'Updated Name',
        paternalCluster: 'Badran',
        maternalCluster: null,
      });

      expect(rows).toEqual({ persons: [{ ...PERSON, firstName: 'Updated Name' }] });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes?id=eq.node-1');
      expect(init.method).toBe('PATCH');
      expect(init.headers['Prefer']).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual({
        first_name: 'Updated Name',
        paternal_family_cluster: 'Badran',
        maternal_family_cluster: null,
      });
    });

    it('does not send cluster fields when non-admin edits person', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ ...NODE_ROW, first_name: 'Updated Name' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editPerson({
        id: 'node-1',
        firstName: 'Updated Name',
        paternalCluster: 'Forbidden Paternal',
      });

      expect(rows.persons).toEqual([{ ...PERSON, firstName: 'Updated Name' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes?id=eq.node-1');
      expect(JSON.parse(init.body)).toEqual({
        first_name: 'Updated Name',
      });
    });

    /**
     * A gender change can give the Person's parent links a role (the server
     * fills an empty `parent_role` from the gender), so those links are read
     * back too and confirmed with the Person.
     */
    it('sends the gender, then reads back the parent links it may have given a role', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ ...NODE_ROW, gender: 'female' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([linkRow('link-1', 'node-1', 'child-1', 'parent', 'mother')]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editPerson({ id: 'node-1', gender: 'female' });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ gender: 'female' });
      const [url, init] = mockFetch.mock.calls[1];
      expect(url).toBe(
        'https://example.supabase.co/rest/v1/links?source_node_id=eq.node-1&type=eq.parent'
      );
      expect(init.method).toBe('GET');
      expect(rows).toEqual({
        persons: [{ ...PERSON, gender: 'female' }],
        links: [{ id: 'link-1', source: 'node-1', target: 'child-1', type: 'parent', parentRole: 'mother' }],
      });
    });

    it('sends a cleared gender as null', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([NODE_ROW]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        )
        .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editPerson({ id: 'node-1', gender: null });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ gender: null });
      expect(rows).toEqual({ persons: [PERSON], links: [] });
    });

    it('still confirms the Person when the parent links cannot be read back', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ ...NODE_ROW, gender: 'male' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
        .mockRejectedValueOnce(new Error('offline'));
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editPerson({ id: 'node-1', gender: 'male' });

      expect(rows).toEqual({ persons: [{ ...PERSON, gender: 'male' }] });
    });

    it('reports a gender the server refused as refused', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'P0001',
            message: 'Farah is recorded as a father on a Kinship Link, so their gender cannot be female.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(record.editPerson({ id: 'node-1', gender: 'female' })).rejects.toMatchObject({
        kind: 'refused',
        message: expect.stringContaining('their gender cannot be female'),
      });
    });

    /**
     * `return=minimal` reported 204 whether or not a row matched, so an edit
     * RLS silently dropped looked like a success. The representation makes it
     * visible, and a write that reports nothing written is not confirmed.
     */
    it('rejects an edit the server accepted without updating a row', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.editPerson({ id: 'node-1', firstName: 'Updated Name' })
      ).rejects.toMatchObject({ kind: 'not-authorized' });
    });

    /**
     * The row is written and only the confirmation is missing, so this is not a
     * `network` failure: the caller must reload rather than assume nothing happened.
     */
    it('reports an unreadable response body as unknown, not network', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('not json', { status: 200 })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.editPerson({ id: 'node-1', firstName: 'Updated Name' })
      ).rejects.toMatchObject({ kind: 'unknown' });
    });
  });

  describe('editLink', () => {
    it('updates link for admin users and returns the updated row', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([linkRow('link-123', 'a', 'b', 'parent', 'mother')]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.editLink({
        id: 'link-123',
        type: 'parent',
        parentRole: 'mother',
      });

      expect(rows).toEqual({
        links: [
          { id: 'link-123', source: 'a', target: 'b', type: 'parent', parentRole: 'mother' },
        ],
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links?id=eq.link-123');
      expect(init.headers['Prefer']).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual({
        type: 'parent',
        parent_role: 'mother',
      });
    });

    it('refuses editLink for non-admin with not-authorized', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.editLink({ id: 'link-1', type: 'parent' })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a link edit the server accepted without updating a row', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.editLink({ id: 'link-1', type: 'parent' })
      ).rejects.toMatchObject({ kind: 'not-authorized' });
    });
  });

  describe('removePerson', () => {
    it('calls admin_delete_node_secure RPC for admin and reports the cascade', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, removed_link_ids: ['link-1', 'link-2'] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.removePerson({ id: 'node-delete-me' });

      expect(rows).toEqual({
        removedPersonIds: ['node-delete-me'],
        removedLinkIds: ['link-1', 'link-2'],
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/admin_delete_node_secure');
      expect(JSON.parse(init.body)).toEqual({
        p_node_id: 'node-delete-me',
      });
    });

    it('refuses removePerson for non-admin with not-authorized', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.removePerson({ id: 'node-delete-me' })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('removeLink', () => {
    it('deletes link for admin and returns the deleted row it already receives', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([linkRow('link-delete-me', 'a', 'b')]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const rows = await record.removeLink({ id: 'link-delete-me' });

      expect(rows).toEqual({ removedLinkIds: ['link-delete-me'] });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links?id=eq.link-delete-me');
      expect(init.method).toBe('DELETE');
      expect(init.headers['Prefer']).toBe('return=representation');
    });

    it('refuses removeLink for non-admin with not-authorized', async () => {
      const mockFetch = vi.fn();
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.removeLink({ id: 'link-1' })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('parentRoleForGender', () => {
    it("gives a parent link its role from the parent's gender, and none when not recorded", () => {
      expect(parentRoleForGender('male')).toBe('father');
      expect(parentRoleForGender('female')).toBe('mother');
      expect(parentRoleForGender(null)).toBeNull();
      expect(parentRoleForGender(undefined)).toBeNull();
    });
  });

  describe('relativeToKinshipLink edge conversion', () => {
    it('converts relative child to parent link with anchor as source', () => {
      const link = relativeToKinshipLink('anchor-1', 'child-1', 'child', 'father');
      expect(link).toEqual({
        sourceId: 'anchor-1',
        targetId: 'child-1',
        type: 'parent',
        parentRole: 'father',
      });
    });

    it('converts relative parent to parent link with other as source', () => {
      const link = relativeToKinshipLink('anchor-1', 'parent-1', 'parent', 'mother');
      expect(link).toEqual({
        sourceId: 'parent-1',
        targetId: 'anchor-1',
        type: 'parent',
        parentRole: 'mother',
      });
    });

    it('converts relative spouse to marriage link with parentRole cleared', () => {
      const link = relativeToKinshipLink('anchor-1', 'spouse-1', 'spouse', 'father');
      expect(link).toEqual({
        sourceId: 'anchor-1',
        targetId: 'spouse-1',
        type: 'marriage',
        parentRole: null,
      });
    });

    it('refuses to convert sibling to single kinship link', () => {
      expect(() => relativeToKinshipLink('anchor-1', 'sibling-1', 'sibling')).toThrowError(
        /Sibling is a composite relationship/
      );
    });
  });

  describe('relativeToKinshipLinks pending edge conversion', () => {
    /** The anchor has two parents, so `sibling` fans out over both. */
    const TWO_PARENT_LINKS: FamilyLink[] = [
      { id: 'link-1', source: 'father', target: 'anchor-1', type: 'parent', parentRole: 'father' },
      { id: 'link-2', source: 'mother', target: 'anchor-1', type: 'parent', parentRole: 'mother' },
      { id: 'link-3', source: 'father', target: 'mother', type: 'marriage' },
    ];

    it('converts relative child to the same single link the singular helper produces', () => {
      const links = relativeToKinshipLinks('anchor-1', 'child-1', 'child', TWO_PARENT_LINKS, 'father');
      const spec = relativeToKinshipLink('anchor-1', 'child-1', 'child', 'father');
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        source: spec.sourceId,
        target: spec.targetId,
        type: spec.type,
        parentRole: spec.parentRole,
      });
    });

    it('converts relative parent to the same single link the singular helper produces', () => {
      const links = relativeToKinshipLinks('anchor-1', 'parent-1', 'parent', TWO_PARENT_LINKS, 'mother');
      const spec = relativeToKinshipLink('anchor-1', 'parent-1', 'parent', 'mother');
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        source: spec.sourceId,
        target: spec.targetId,
        type: spec.type,
        parentRole: spec.parentRole,
      });
    });

    it('converts relative spouse to the same single link the singular helper produces', () => {
      const links = relativeToKinshipLinks('anchor-1', 'spouse-1', 'spouse', TWO_PARENT_LINKS, 'father');
      const spec = relativeToKinshipLink('anchor-1', 'spouse-1', 'spouse', 'father');
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        source: spec.sourceId,
        target: spec.targetId,
        type: spec.type,
        parentRole: spec.parentRole,
      });
    });

    it('leaves every pending kinship link without an id', () => {
      const relations = ['child', 'parent', 'spouse', 'sibling'] as const;
      for (const relation of relations) {
        const links = relativeToKinshipLinks('anchor-1', 'new-1', relation, TWO_PARENT_LINKS, 'father');
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.id).toBeUndefined();
        }
      }
    });

    it('adds the other parent of a new child, with the role from their gender', () => {
      const links = relativeToKinshipLinks('huda', 'child-1', 'child', [], null, { id: 'yusuf', gender: 'male' });
      expect(links).toEqual([
        { source: 'huda', target: 'child-1', type: 'parent', parentRole: null },
        { source: 'yusuf', target: 'child-1', type: 'parent', parentRole: 'father' },
      ]);
    });

    it('refuses an other parent for any relation but child', () => {
      expect(() =>
        relativeToKinshipLinks('huda', 'x', 'spouse', [], null, { id: 'yusuf', gender: 'male' })
      ).toThrow(TreeRecordError);
    });

    it('converts relative sibling to one parent link per parent of the anchor', () => {
      const links = relativeToKinshipLinks('anchor-1', 'sibling-1', 'sibling', TWO_PARENT_LINKS);
      expect(links).toHaveLength(2);
      expect(links).toEqual([
        { source: 'father', target: 'sibling-1', type: 'parent', parentRole: null },
        { source: 'mother', target: 'sibling-1', type: 'parent', parentRole: null },
      ]);
    });

    it('returns no links for a sibling of an anchor with no parents', () => {
      const links = relativeToKinshipLinks(
        'anchor-1',
        'sibling-1',
        'sibling',
        [{ id: 'link-4', source: 'anchor-1', target: 'spouse-1', type: 'marriage' }],
      );
      expect(links).toEqual([]);
    });

    it('resolves a parent whose endpoint the simulation already rewrote into a node object', () => {
      const father: FamilyNode = { id: 'father', firstName: 'Ahmad' };
      const links = relativeToKinshipLinks(
        'anchor-1',
        'sibling-1',
        'sibling',
        [{ id: 'link-1', source: father, target: 'anchor-1', type: 'parent', parentRole: 'father' }],
      );
      expect(links).toEqual([
        { source: 'father', target: 'sibling-1', type: 'parent', parentRole: null },
      ]);
    });
  });

  describe('pendingKinshipLinks', () => {
    const persons: FamilyNode[] = [
      { id: 'fadi', firstName: 'Fadi', gender: 'male' },
      { id: 'ebtisam', firstName: 'Ebtisam', gender: 'female' },
      { id: 'dana', firstName: 'Dana' },
    ];

    it('is the one link a write asks for when there is no other parent', () => {
      expect(pendingKinshipLinks({ sourceId: 'fadi', targetId: 'ali', type: 'parent', parentRole: 'father' }, persons)).toEqual([
        { source: 'fadi', target: 'ali', type: 'parent', parentRole: 'father' },
      ]);
    });

    it("adds the other parent's link, with the role from their gender", () => {
      expect(
        pendingKinshipLinks({ sourceId: 'fadi', targetId: 'ali', type: 'parent', otherParentId: 'ebtisam' }, persons)
      ).toEqual([
        { source: 'fadi', target: 'ali', type: 'parent', parentRole: undefined },
        { source: 'ebtisam', target: 'ali', type: 'parent', parentRole: 'mother' },
      ]);
    });

    it('leaves the role empty for an other parent with no gender recorded', () => {
      expect(
        pendingKinshipLinks({ sourceId: 'fadi', targetId: 'ali', type: 'parent', otherParentId: 'dana' }, persons)[1]
      ).toEqual({ source: 'dana', target: 'ali', type: 'parent', parentRole: null });
    });
  });

  describe('Error discriminant handling', () => {
    it('categorizes HTTP 401/403 as not-authorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
        status: 401,
      });
    });

    it('categorizes HTTP 409 / conflict message as conflict', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'duplicate key value violates unique constraint' }), {
          status: 409,
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' })
      ).rejects.toMatchObject({
        kind: 'conflict',
        status: 409,
      });
    });

    it('categorizes RPC unauthorized response as not-authorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
        message: 'Unauthorized',
      });
    });

    it('categorizes RPC create_relative unauthorized response as not-authorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addPerson({
          firstName: 'Farah',
          link: { targetId: 'p1', relation: 'child' },
        })
      ).rejects.toMatchObject({
        kind: 'not-authorized',
        message: 'Unauthorized',
      });
    });

    it('categorizes network/fetch failures as network', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await expect(
        record.addLink({ sourceId: 'p1', targetId: 'p2', type: 'marriage' })
      ).rejects.toMatchObject({
        kind: 'network',
      });
    });
  });

  describe('isTreeRecordError helper', () => {
    it('identifies TreeRecordError instances', () => {
      const err = new TreeRecordError('refused', 'test message');
      expect(isTreeRecordError(err)).toBe(true);
      expect(isTreeRecordError(new Error('other'))).toBe(false);
      expect(isTreeRecordError(null)).toBe(false);
      expect(isTreeRecordError({ kind: 'refused' })).toBe(false);
    });
  });
});
