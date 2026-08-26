// src/contexts/FamilyDataContext.tsx

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { dropOrphanLinks } from '../lib/sanitizeFamilyGraph';
import { kinshipLinksFromRows, personFromRow } from '../lib/treeRecordRows';
import { FamilyGraph, FamilyNode, FamilyLink } from '../types/graph';
import type { Database } from '../types/database';

type NodeRow = Database['public']['Tables']['nodes']['Row'];

/** How far from their relatives a newly Spawned person is seeded, in graph units. */
const SEED_RADIUS = 40;

interface FamilyDataContextType {
  /** The Persons and Kinship Links currently held in the browser. */
  graphData: FamilyGraph | null;
  isLoading: boolean;
  error: string | null;
  /** Full re-read of the Tree Record. */
  refetch: () => Promise<void>;
}

const FamilyDataContext = createContext<FamilyDataContextType | undefined>(undefined);

/**
 * The one owner of the graph in memory (LIN-63).
 *
 * This was a hook, and two components called it: `FamilyTree` and, through
 * `useFamilyChat`, the unconditionally mounted `FamilyChat`. That is two
 * independent copies of the same family tree — six requests per page load — and
 * only the tree's copy was ever refetched, so a Person Spawned after load stayed
 * invisible to every answer the chat gave for the rest of the session. A
 * provider makes the second copy unreachable rather than merely absent: reading
 * the graph from somewhere new now shares this owner instead of minting a rival.
 */
export function FamilyDataProvider({ children }: { children: React.ReactNode }) {
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
  const carryPositions = (next: FamilyNode[], links: FamilyLink[]): FamilyNode[] => {
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

    // A just-Spawned person has no position at all, so the simulation drops
    // them somewhere arbitrary and then shoves the rest of the tree aside
    // making room — which is the jolt, and why it only happened on Spawn.
    // Start them beside the relative they were added to instead.
    const idOf = (endpoint: FamilyLink['source']): string =>
      typeof endpoint === 'string' ? endpoint : endpoint.id;
    const byId = new Map(carried.map((n) => [n.id, n]));
    const neighbours = new Map<string, string[]>();
    for (const link of links) {
      const a = idOf(link.source);
      const b = idOf(link.target);
      neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
      neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
    }

    carried.forEach((node, index) => {
      if (node.x !== undefined) return;
      const anchors = (neighbours.get(node.id) ?? [])
        .map((id) => byId.get(id))
        .filter((n): n is FamilyNode => !!n && n.x !== undefined);
      if (anchors.length === 0) return;

      const mean = (pick: (n: FamilyNode) => number | undefined) =>
        anchors.reduce((sum, n) => sum + (pick(n) ?? 0), 0) / anchors.length;
      // Golden angle, so several new people in one fetch fan out rather than
      // landing on top of each other. Deterministic: no randomness to chase.
      const angle = index * 2.39996;
      node.x = mean((n) => n.x) + Math.cos(angle) * SEED_RADIUS;
      node.y = mean((n) => n.y) + Math.sin(angle) * SEED_RADIUS;
      node.z = mean((n) => n.z);
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
        console.error('[FamilyDataProvider] Nodes fetch failed:', nodesResponse.status, nodesResponse.statusText);
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
        console.error('[FamilyDataProvider] Links fetch failed:', linksResponse.status, errorText);
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
        console.warn('[FamilyDataProvider] No nodes returned from Supabase');
      }

      // Transform Supabase rows into Persons and Kinship Links. The write seam
      // decodes the rows it writes with the same functions (LIN-64), so a
      // confirmed write and a fresh fetch cannot disagree about a row's facts.
      //
      // The claim flag is stamped on here rather than passed into the decoder:
      // it is not on a `nodes` row, and a decoder that always emitted the key
      // would put `isClaimed: undefined` on every row a *write* returns, which
      // erases a Person's claim the moment such a row is merged over the old
      // one. The object being stamped was minted one line above and is not yet
      // shared with anything.
      const nodes: FamilyNode[] = ((nodesData ?? []) as NodeRow[]).map((row) => {
        const person = personFromRow(row);
        person.isClaimed = claimedNodeIds.has(String(row.id));
        return person;
      });

      const links: FamilyLink[] = kinshipLinksFromRows(linksData);

      const safeLinks = dropOrphanLinks(nodes, links);
      if (safeLinks.length < links.length) {
        console.warn(
          '[FamilyDataProvider] Removed',
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
        setGraphData({ nodes: carryPositions(mockNodes, sanitized), links: sanitized });
        setIsLoading(false);
        return;
      }

      const rawGraph: FamilyGraph = { nodes, links: linksForState };
      const sanitized = dropOrphanLinks(rawGraph.nodes, rawGraph.links);
      setGraphData({ nodes: carryPositions(nodes, sanitized), links: sanitized });
      setIsLoading(false);
    } catch (err) {
      console.error('[FamilyDataProvider] Error fetching family data:', err);
      setError('Failed to load family data');
      setIsLoading(false);
    }
  };

  const refetch = (): Promise<void> => fetchFamilyData(true);

  const value: FamilyDataContextType = { graphData, isLoading, error, refetch };

  return <FamilyDataContext.Provider value={value}>{children}</FamilyDataContext.Provider>;
}

/**
 * Read the owner's copy of the graph. Throws rather than quietly handing back an
 * empty graph, because a missing provider is a wiring mistake and the symptom —
 * a tree that renders nothing — looks exactly like an empty family.
 */
export function useFamilyData(): FamilyDataContextType {
  const context = useContext(FamilyDataContext);
  if (context === undefined) {
    throw new Error('useFamilyData must be used within a FamilyDataProvider');
  }
  return context;
}
