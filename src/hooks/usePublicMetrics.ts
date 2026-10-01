import { useEffect, useState } from 'react';
import { supabaseHeaders, supabasePublishableKey, supabaseUrl } from '../lib/supabaseConfig';

interface PublicMetrics {
  individuals: number;
  families: number;
  isLoading: boolean;
  hasError: boolean;
}

const CACHE_KEY = 'family_tree_metrics';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedMetrics {
  individuals: number;
  families: number;
  timestamp: number;
}

function getCachedMetrics(): CachedMetrics | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedMetrics = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - data.timestamp < CACHE_TTL) {
      return data;
    }
    
    // Cache expired, remove it
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

function setCachedMetrics(individuals: number, families: number) {
  try {
    const data: CachedMetrics = {
      individuals,
      families,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

export function usePublicMetrics(): PublicMetrics {
  const [metrics, setMetrics] = useState<PublicMetrics>(() => {
    // Try to load from cache immediately
    const cached = getCachedMetrics();
    if (cached) {
      return {
        individuals: cached.individuals,
        families: cached.families,
        isLoading: false,
        hasError: false,
      };
    }
    
    return {
      individuals: 0,
      families: 0,
      isLoading: true,
      hasError: false,
    };
  });

  useEffect(() => {
    // Check cache first
    const cached = getCachedMetrics();
    if (cached) {
      setMetrics({
        individuals: cached.individuals,
        families: cached.families,
        isLoading: false,
        hasError: false,
      });
      return;
    }

    const fetchMetrics = async () => {
      try {
        // Throws, into the catch below, when VITE_SUPABASE_URL is missing or unknown.
        const key = supabasePublishableKey();

        // Call public RPC function (bypasses RLS)
        const rpcUrl = `${supabaseUrl()}/rest/v1/rpc/get_public_metrics`;
        
        // Signed out: the publishable key on apikey, and no bearer.
        const rpcResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            ...supabaseHeaders(key),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!rpcResponse.ok) {
          const text = await rpcResponse.text();
          console.error('[usePublicMetrics] RPC failed:', rpcResponse.status, text);
          throw new Error('Failed to fetch metrics');
        }

        const metricsData = await rpcResponse.json();

        const individualCount = metricsData?.individuals || 0;
        const familyCount = metricsData?.families || 0;

        // Cache the results
        setCachedMetrics(individualCount, familyCount);

        setMetrics({
          individuals: individualCount,
          families: familyCount,
          isLoading: false,
          hasError: false,
        });
      } catch (err) {
        console.error('[usePublicMetrics] Exception caught:', err);
        if (err instanceof Error) {
          console.error('[usePublicMetrics] Error details:', {
            message: err.message,
            stack: err.stack
          });
        }
        setMetrics({
          individuals: 0,
          families: 0,
          isLoading: false,
          hasError: true,
        });
      }
    };

    fetchMetrics();
  }, []);

  return metrics;
}
