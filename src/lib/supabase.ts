import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { fetchWithoutKeyAsBearer, supabasePublishableKey, supabaseUrl } from './supabaseConfig';

// Throws when VITE_SUPABASE_URL is missing or names a project with no key.
const supabaseKey = supabasePublishableKey();

export const supabase = createClient<Database>(supabaseUrl(), supabaseKey, {
  // Signed out, supabase-js would send the publishable key as the bearer too.
  // It is not a JWT: it goes on apikey only (LIN-82).
  global: {
    fetch: fetchWithoutKeyAsBearer(supabaseKey),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 0,
    },
  },
  db: {
    schema: 'public',
  },
});
