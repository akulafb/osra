import { useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyNode } from '../types/graph';

const STORAGE_PREFIX = 'osra_tree_lastAck_';

function maxCreatedAtIso(nodes: readonly FamilyNode[]): string {
  let max = '';
  for (const n of nodes) {
    if (n.createdAt && n.createdAt > max) max = n.createdAt;
  }
  return max || new Date().toISOString();
}

function sortByCreatedDesc(nodes: readonly FamilyNode[]): FamilyNode[] {
  return [...nodes].sort((a, b) => {
    const ta = a.createdAt ?? '';
    const tb = b.createdAt ?? '';
    return tb.localeCompare(ta);
  });
}

/**
 * Compares node created_at to stored lastAck; advances lastAck after compute via queueMicrotask.
 * Uses a fingerprint guard so a second effect run (Strict Mode or duplicate commit) does not
 * re-read localStorage after lastAck was advanced — that was clearing the button immediately.
 *
 * Fed the **confirmed** Persons, never the Working Record: a Person is not new
 * until the database says so, and an optimistic Spawn has no `createdAt` to
 * compare, so it would only churn the fingerprint the guard exists to hold
 * still (LIN-58's D13).
 */
export function useNewNodesSinceSignIn(
  userId: string | undefined,
  confirmedNodes: readonly FamilyNode[]
) {
  const [newMembers, setNewMembers] = useState<FamilyNode[]>([]);
  const [showSeeWhosNewButton, setShowSeeWhosNewButton] = useState(false);
  const [buttonGlowActive, setButtonGlowActive] = useState(false);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedFingerprintRef = useRef<string | null>(null);

  const newMembersKey = useMemo(
    () => newMembers.map((n) => n.id).join(',') || 'none',
    [newMembers]
  );

  useEffect(() => {
    if (!showSeeWhosNewButton) {
      setButtonGlowActive(false);
      if (glowTimerRef.current) {
        clearTimeout(glowTimerRef.current);
        glowTimerRef.current = null;
      }
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setButtonGlowActive(!prefersReduced);

    if (prefersReduced) return;

    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => {
      setButtonGlowActive(false);
      glowTimerRef.current = null;
    }, 20_000);

    return () => {
      if (glowTimerRef.current) {
        clearTimeout(glowTimerRef.current);
        glowTimerRef.current = null;
      }
    };
  }, [showSeeWhosNewButton, newMembersKey]);

  useEffect(() => {
    if (!userId) {
      processedFingerprintRef.current = null;
      setNewMembers([]);
      setShowSeeWhosNewButton(false);
      return;
    }

    const maxTs = maxCreatedAtIso(confirmedNodes);
    const fingerprint = `${userId}|${confirmedNodes.length}|${maxTs}`;

    if (processedFingerprintRef.current === fingerprint) {
      return;
    }
    processedFingerprintRef.current = fingerprint;

    const storageKey = `${STORAGE_PREFIX}${userId}`;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      /* ignore */
    }

    if (raw === null || raw === '') {
      try {
        localStorage.setItem(storageKey, maxTs);
      } catch {
        /* ignore */
      }
      setNewMembers([]);
      setShowSeeWhosNewButton(false);
      return;
    }

    const fresh = confirmedNodes.filter((n) => n.createdAt && n.createdAt > raw);
    const sorted = sortByCreatedDesc(fresh);

    setNewMembers(sorted);
    setShowSeeWhosNewButton(sorted.length > 0);

    queueMicrotask(() => {
      try {
        localStorage.setItem(storageKey, maxTs);
      } catch {
        /* ignore */
      }
    });
  }, [userId, confirmedNodes]);

  return {
    newMembers,
    showSeeWhosNewButton,
    buttonGlowActive,
  };
}
