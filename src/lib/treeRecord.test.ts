import { describe, it, expect, vi } from 'vitest';
import {
  createTreeRecord,
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
