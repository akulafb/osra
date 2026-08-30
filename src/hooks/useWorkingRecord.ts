// src/hooks/useWorkingRecord.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dropOrphanLinks } from '../lib/sanitizeFamilyGraph';
import { kinshipLinksFromRows, personFromRow } from '../lib/treeRecordRows';
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
} from '../lib/workingRecord';
import type { AddLinkResult, ConfirmedRows } from '../lib/treeRecord';
import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';
import type { Database } from '../types/database';

type NodeRow = Database['public']['Tables']['nodes']['Row'];

/**
 * What a write reported back. A rejection throws `TreeRecordError` instead of
 * arriving here, because a caller has to be told about it; `empty` is the
 * server accepting a write and doing nothing (`already_connected`), which is
 * not a failure and has nothing to tell (D10).
 */
export type WriteOutcome =
  | { kind: 'confirmed'; rows: ConfirmedRows }
  | { kind: 'empty' };

export interface WorkingRecordController {
  /** Rendering, filters, search, bounds and Person Match read this (D13). */
  working: FamilyGraph | null;
  /**
   * A Person is not "new" until the database says so, and no affordance may be
   * derived from a Kinship Link the server has not persisted (D13). `null`
   * until the first read answers, which a reader must not read as an empty
   * family.
   */
  confirmedNodes: readonly FamilyNode[] | null;
  confirmedLinks: readonly FamilyLink[];
  isLoading: boolean;
  error: string | null;
  /** Full re-read of the Tree Record. Retry button only (D14). */
  reload: () => Promise<void>;
  /** apply → commit → confirm | revert | drop (D9). Rethrows a rejection after reverting. */
  write: (changes: RecordChange[], commit: () => Promise<WriteOutcome>) => Promise<void>;
}

/**
 * `addLink`'s three outcomes in the sequencer's vocabulary (D10). The server
 * can accept a write and insert nothing, because the Kinship Link already
 * existed; that drops the Pending Change without ever calling it a failure.
 */
export function linkWriteOutcome(result: AddLinkResult): WriteOutcome {
  return result.alreadyConnected ? { kind: 'empty' } : { kind: 'confirmed', rows: result };
}

interface Projection {
  working: FamilyGraph | null;
  confirmedNodes: readonly FamilyNode[] | null;
  confirmedLinks: readonly FamilyLink[];
}

/**
 * Before the first read there are no confirmed Persons *and no answer about
 * them* — which is not the same as a family with nobody in it, and a reader
 * that cannot tell the two apart acts on an empty tree that was never read.
 * An empty perimeter, on the other hand, is the right answer either way:
 * `confirmedLinks` grants nothing until the server has said otherwise.
 */
const NOTHING_YET: Projection = { working: null, confirmedNodes: null, confirmedLinks: [] };

/**
 * The owner of the Working Record and the sequencer for every write (LIN-58).
 *
 * `WorkingRecordProvider` is the one caller, and every reader goes through
 * `useWorkingRecord()` on the context (ADR-0009) — hence the name: calling this
 * mints a *second* record, and the second would never see the first's writes.
 *
 * The record itself lives in a ref rather than in React state. Two writes can
 * be in flight at once, and each one has to confirm or revert against whatever
 * the *other* has done since — not against the record its own render closed
 * over. State holds only the projection, which is what re-renders the canvas.
 */
export function useWorkingRecordOwner(): WorkingRecordController {
  const { session, user } = useAuth();
  const recordRef = useRef<WorkingRecordState>(emptyWorkingRecord());
  // Where the positions live: react-force-graph writes x/y/z/fx/fy/fz onto the
  // node objects it was handed, so the last projection is what the next one
  // reuses them from.
  const projectedRef = useRef<FamilyGraph | null>(null);
  const changeCounterRef = useRef(0);
  const [projection, setProjection] = useState<Projection>(NOTHING_YET);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const advance = useCallback((next: WorkingRecordState) => {
    recordRef.current = next;
    const working = projectWorkingRecord(next, projectedRef.current);
    projectedRef.current = working;
    setProjection({
      working,
      confirmedNodes: next.confirmed.nodes,
      confirmedLinks: next.confirmed.links,
    });
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      // Read `recordRef` *after* the round trip, not before: a Pending Change
      // applied while the fetch was in flight has to survive it (D14), and
      // argument evaluation would otherwise capture the record as it was when
      // the request went out.
      const snapshot = await readTreeRecord(session?.access_token);
      advance(withConfirmedSnapshot(recordRef.current, snapshot));
    } catch (err) {
      console.error('[useWorkingRecord] Error fetching family data:', err);
      setError('Failed to load family data');
    } finally {
      setIsLoading(false);
    }
  }, [advance, session?.access_token]);

  // `reload` is recreated only when the access token changes, and Supabase
  // hands out a new session object when it does, so this adds no read the
  // `session` dependency does not already cause.
  useEffect(() => {
    if (session || (import.meta.env.DEV && user)) {
      void reload();
    }
  }, [session, user, reload]);

  const write = useCallback(
    async (changes: RecordChange[], commit: () => Promise<WriteOutcome>): Promise<void> => {
      const changeId = `change-${(changeCounterRef.current += 1)}`;
      advance(applyPending(recordRef.current, changeId, changes));
      let outcome: WriteOutcome;
      try {
        outcome = await commit();
      } catch (err) {
        advance(revertPending(recordRef.current, changeId));
        throw err;
      }
      advance(
        outcome.kind === 'confirmed'
          ? confirmPending(recordRef.current, changeId, outcome.rows)
          : dropPending(recordRef.current, changeId)
      );
    },
    [advance]
  );

  return {
    working: projection.working,
    confirmedNodes: projection.confirmedNodes,
    confirmedLinks: projection.confirmedLinks,
    isLoading,
    error,
    reload,
    write,
  };
}

/**
 * The read half of the seam. Raw `fetch` rather than the Supabase client: the
 * client opens a websocket that hangs against a project with
 * `realtime.eventsPerSecond` at 0.
 */
async function readTreeRecord(accessToken: string | undefined): Promise<FamilyGraph> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // Authenticated session token where there is one, so RLS policies apply.
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${accessToken || supabaseKey}`,
  };

  const nodesResponse = await fetch(`${supabaseUrl}/rest/v1/nodes?order=created_at.asc&select=*`, {
    method: 'GET',
    headers,
  });
  if (!nodesResponse.ok) {
    console.error(
      '[useWorkingRecord] Nodes fetch failed:',
      nodesResponse.status,
      nodesResponse.statusText
    );
    throw new Error('Failed to load family data');
  }
  const nodesData = await nodesResponse.json();

  const linksResponse = await fetch(`${supabaseUrl}/rest/v1/links?order=created_at.asc&select=*`, {
    method: 'GET',
    headers,
  });
  if (!linksResponse.ok) {
    console.error(
      '[useWorkingRecord] Links fetch failed:',
      linksResponse.status,
      await linksResponse.text()
    );
    throw new Error('Failed to load family data');
  }
  const linksData = await linksResponse.json();

  // Claimed node ids come from a separate RPC over `public.users.node_id`
  // (it bypasses RLS), so no `nodes` row can report the flag. Non-fatal: the
  // tree still works without claim indicators.
  let claimedNodeIds = new Set<string>();
  try {
    const claimedRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_claimed_node_ids`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (claimedRes.ok) {
      const claimed = await claimedRes.json();
      if (Array.isArray(claimed)) claimedNodeIds = new Set(claimed.filter(Boolean).map(String));
    }
  } catch {
    /* ignore */
  }

  if (!nodesData || nodesData.length === 0) {
    console.warn('[useWorkingRecord] No nodes returned from Supabase');
    if (import.meta.env.DEV) return MOCK_TREE_RECORD;
  }

  // One decoder for both directions of the seam (ADR-0010), so a confirmed
  // write and a fresh read cannot disagree about what a row says. The claim
  // flag is stamped on afterwards rather than passed into the decoder: a
  // decoder that always emitted the key would put `isClaimed: undefined` on
  // every row a *write* returns, erasing a Person's claim on confirmation.
  const nodes: FamilyNode[] = ((nodesData ?? []) as NodeRow[]).map((row) => {
    const person = personFromRow(row);
    person.isClaimed = claimedNodeIds.has(String(row.id));
    return person;
  });

  const links: FamilyLink[] = kinshipLinksFromRows(linksData);
  const safeLinks = dropOrphanLinks(nodes, links);
  if (safeLinks.length < links.length) {
    console.warn(
      '[useWorkingRecord] Removed',
      links.length - safeLinks.length,
      'orphan link(s) (endpoint missing from nodes). Check DB integrity.'
    );
  }

  return { nodes, links: safeLinks };
}

/** So a dev machine pointed at an empty database still has a tree to work on. */
const MOCK_TREE_RECORD: FamilyGraph = {
  nodes: [
    { id: 'node-1', firstName: 'Fahd', familyCluster: 'Badran', isClaimed: true },
    { id: 'node-2', firstName: 'Ahmad', familyCluster: 'Badran' },
    { id: 'node-3', firstName: 'Fatima', familyCluster: 'Badran' },
    { id: 'node-4', firstName: 'Sara', familyCluster: 'Badran' },
    { id: 'node-5', firstName: 'Mona', familyCluster: 'Badran' },
    { id: 'node-6', firstName: 'Ali', familyCluster: 'Badran' },
  ],
  links: [
    { id: 'l-1', source: 'node-2', target: 'node-3', type: 'marriage' },
    { id: 'l-2', source: 'node-2', target: 'node-1', type: 'parent' },
    { id: 'l-3', source: 'node-3', target: 'node-1', type: 'parent' },
    { id: 'l-4', source: 'node-2', target: 'node-4', type: 'parent' },
    { id: 'l-5', source: 'node-1', target: 'node-5', type: 'marriage' },
    { id: 'l-6', source: 'node-1', target: 'node-6', type: 'parent' },
  ],
};
