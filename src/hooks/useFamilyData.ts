import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dropOrphanLinks } from '../lib/sanitizeFamilyGraph';
import { FamilyGraph, FamilyNode, FamilyLink } from '../types/graph';
import type { Database } from '../types/database';

type NodeRow = Database['public']['Tables']['nodes']['Row'];
type LinkRow = Database['public']['Tables']['links']['Row'];

export function useFamilyData() {
  const { session, user } = useAuth();
  const [graphData, setGraphData] = useState<FamilyGraph | null>(null);
  // The node objects we last handed out. react-force-graph mutates them in
  // place with simulation coordinates, so they are where the current positions
  // actually live.
  const previousNodesRef = useRef<FamilyNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session || (import.meta.env.DEV && user)) {
      fetchFamilyData();
    }
  }, [session, user]);

  /**
   * A refetch mints brand-new node objects, which drops the positions the 3D
   * force simulation had settled on: the graph re-warms from scratch and the
   * whole tree flies to a new arrangement. Carrying the coordinates over keeps
   * a Spawn or Dissolve visible where it happened (LIN-55).
   */
  const carryPositions = (next: FamilyNode[]): FamilyNode[] => {
    const previous = new Map(previousNodesRef.current.map((n) => [n.id, n]));
    const carried = next.map((node) => {
      const prior = previous.get(node.id);
      if (!prior) return node;
      return {
        ...node,
        x: prior.x,
        y: prior.y,
        z: prior.z,
        fx: prior.fx,
        fy: prior.fy,
        fz: prior.fz,
      };
    });
    previousNodesRef.current = carried;
    return carried;
  };

  const fetchFamilyData = async (isBackground = false): Promise<void> => {
    try {
      if (!isBackground) {
        setIsLoading(true);
      }
      setError(null);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Use authenticated session token to pass RLS policies
      const authToken = session?.access_token || supabaseKey;

      // Fetch nodes using raw fetch (avoid Supabase client websocket hang)
      const nodesResponse = await fetch(
        `${supabaseUrl}/rest/v1/nodes?order=created_at.asc&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      if (!nodesResponse.ok) {
        console.error('[useFamilyData] Nodes fetch failed:', nodesResponse.status, nodesResponse.statusText);
        throw new Error('Failed to load family data');
      }

      const nodesData = await nodesResponse.json();

      // Fetch links using raw fetch
      const linksResponse = await fetch(
        `${supabaseUrl}/rest/v1/links?order=created_at.asc&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );
      
      if (!linksResponse.ok) {
        const errorText = await linksResponse.text();
        console.error('[useFamilyData] Links fetch failed:', linksResponse.status, errorText);
        throw new Error('Failed to load family data');
      }

      const linksData = await linksResponse.json();

      // Fetch claimed node IDs via RPC (bypasses RLS)
      let claimedNodeIds = new Set<string>();
      try {
        const claimedRes = await fetch(
          `${supabaseUrl}/rest/v1/rpc/get_claimed_node_ids`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${authToken}`,
            },
            body: '{}',
          }
        );
        if (claimedRes.ok) {
          const claimed = await claimedRes.json();
          if (Array.isArray(claimed)) {
            claimedNodeIds = new Set(claimed.filter(Boolean).map(String));
          }
        }
      } catch {
        // Non-fatal: tree still works without claim indicators
      }

      if (!nodesData || nodesData.length === 0) {
        console.warn('[useFamilyData] No nodes returned from Supabase');
      }

      // Transform Supabase data to FamilyGraph format
      const nodes: FamilyNode[] = ((nodesData ?? []) as NodeRow[]).map((node) => ({
        id: node.id,
        firstName: node.first_name,
        createdAt: typeof node.created_at === 'string' ? node.created_at : undefined,
        familyCluster: node.paternal_family_cluster ?? undefined,
        maternalFamilyCluster: node.maternal_family_cluster || undefined,
        isClaimed: claimedNodeIds.has(String(node.id)),
      }));

      const links: FamilyLink[] = ((linksData ?? []) as LinkRow[]).map((link) => ({
        id: String(link.id),
        source: link.source_node_id,
        target: link.target_node_id,
        type: link.type as 'parent' | 'marriage' | 'divorce',
        parentRole: link.parent_role || undefined,
      }));

      const safeLinks = dropOrphanLinks(nodes, links);
      if (safeLinks.length < links.length) {
        console.warn(
          '[useFamilyData] Removed',
          links.length - safeLinks.length,
          'orphan link(s) (endpoint missing from nodes). Check DB integrity.'
        );
      }

      // Shallow-clone links so react-force-graph cannot replace string endpoints with object refs in React state.
      const linksForState = safeLinks.map((l) => ({ ...l }));

      if (nodes.length === 0 && import.meta.env.DEV) {
        const mockNodes: FamilyNode[] = [
          { id: 'node-1', firstName: 'Fahd', familyCluster: 'Badran', isClaimed: true },
          { id: 'node-2', firstName: 'Ahmad', familyCluster: 'Badran' },
          { id: 'node-3', firstName: 'Fatima', familyCluster: 'Badran' },
          { id: 'node-4', firstName: 'Sara', familyCluster: 'Badran' },
          { id: 'node-5', firstName: 'Mona', familyCluster: 'Badran' },
          { id: 'node-6', firstName: 'Ali', familyCluster: 'Badran' },
        ];
        const mockLinks: FamilyLink[] = [
          { id: 'l-1', source: 'node-2', target: 'node-3', type: 'marriage' },
          { id: 'l-2', source: 'node-2', target: 'node-1', type: 'parent' },
          { id: 'l-3', source: 'node-3', target: 'node-1', type: 'parent' },
          { id: 'l-4', source: 'node-2', target: 'node-4', type: 'parent' },
          { id: 'l-5', source: 'node-1', target: 'node-5', type: 'marriage' },
          { id: 'l-6', source: 'node-1', target: 'node-6', type: 'parent' },
        ];
        const sanitized = dropOrphanLinks(mockNodes, mockLinks);
        setGraphData({ nodes: carryPositions(mockNodes), links: sanitized });
        setIsLoading(false);
        return;
      }

      const rawGraph: FamilyGraph = { nodes, links: linksForState };
      const sanitized = dropOrphanLinks(rawGraph.nodes, rawGraph.links);
      setGraphData({ nodes: carryPositions(nodes), links: sanitized });
      setIsLoading(false);
    } catch (err) {
      console.error('[useFamilyData] Error fetching family data:', err);
      setError('Failed to load family data');
      setIsLoading(false);
    }
  };

  const refetch = (): Promise<void> => fetchFamilyData(true);

  return { graphData, isLoading, error, refetch };
}
