import { describe, it, expect, vi } from 'vitest';
import {
  createTreeRecord,
  relativeToKinshipLink,
  TreeRecordError,
  isTreeRecordError,
} from './treeRecord';

const TEST_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-anon-key',
};

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
    it('routes to REST POST /links for admin users', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 201 }));
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.addLink({
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
      expect(JSON.parse(init.body)).toEqual({
        source_node_id: 'p1',
        target_node_id: 'p2',
        type: 'marriage',
        parent_role: null,
        created_by_user_id: 'admin-1',
      });
    });

    it('routes marriage to RPC link_existing_relative_secure for non-admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.addLink({
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
    });

    it('routes parent link to RPC link_existing_relative_secure for non-admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.addLink({
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
    });
  });

  describe('addPerson', () => {
    it('creates relative atomically via RPC create_relative_secure when link is present', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, new_node_id: 'new-node-123' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const res = await record.addPerson({
        firstName: 'Farah',
        link: {
          targetId: 'parent-node',
          relation: 'child',
          parentRole: 'mother',
        },
      });

      expect(res).toEqual({ id: 'new-node-123' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/rpc/create_relative_secure');
      expect(JSON.parse(init.body)).toEqual({
        new_first_name: 'Farah',
        rel_type: 'child',
        target_node_id: 'parent-node',
        creator_id: 'user-1',
        p_parent_role: 'mother',
      });
    });

    it('creates standalone person via REST POST /nodes when link is omitted and user is admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: 'standalone-node-1' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      const res = await record.addPerson({
        firstName: 'Omar',
        paternalCluster: 'Badran',
        maternalCluster: 'Kutob',
      });

      expect(res).toEqual({ id: 'standalone-node-1' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes');
      expect(JSON.parse(init.body)).toEqual({
        first_name: 'Omar',
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
    it('sends cluster fields when admin edits person', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.editPerson({
        id: 'node-1',
        firstName: 'Updated Name',
        paternalCluster: 'New Paternal',
        maternalCluster: null,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes?id=eq.node-1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({
        first_name: 'Updated Name',
        paternal_family_cluster: 'New Paternal',
        maternal_family_cluster: null,
      });
    });

    it('does not send cluster fields when non-admin edits person', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const record = createTreeRecord(
        { userId: 'user-1', isAdmin: false, sessionToken: 'user-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.editPerson({
        id: 'node-1',
        firstName: 'Updated Name',
        paternalCluster: 'Forbidden Paternal',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/nodes?id=eq.node-1');
      expect(JSON.parse(init.body)).toEqual({
        first_name: 'Updated Name',
      });
    });
  });

  describe('editLink', () => {
    it('updates link for admin users', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.editLink({
        id: 'link-123',
        type: 'parent',
        parentRole: 'mother',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links?id=eq.link-123');
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
  });

  describe('removePerson', () => {
    it('calls admin_delete_node_secure RPC for admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.removePerson({ id: 'node-delete-me' });

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
    it('deletes link for admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: 'link-delete-me' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const record = createTreeRecord(
        { userId: 'admin-1', isAdmin: true, sessionToken: 'admin-token' },
        { ...TEST_CONFIG, fetch: mockFetch }
      );

      await record.removeLink({ id: 'link-delete-me' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/rest/v1/links?id=eq.link-delete-me');
      expect(init.method).toBe('DELETE');
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
