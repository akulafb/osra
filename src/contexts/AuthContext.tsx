import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

type UserProfile = Database['public']['Tables']['users']['Row'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isBound: boolean; // User has a node_id binding
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile from the users table using raw fetch (avoid websocket hang)
  const fetchUserProfile = async (userId: string, authToken?: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const token = authToken || supabaseKey;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.statusText}`);
      }

      const data = await response.json();

      if (data && data.length > 0) {
        setUserProfile(data[0]);
      } else {
        setUserProfile(null);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('[AuthContext] Error fetching user profile:', error);
      setUserProfile(null);
      setIsLoading(false);
    }
  };

  // Initialize auth state
  useEffect(() => {
    let isSubscribed = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isSubscribed) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id, session.access_token);
      } else {
        setIsLoading(false);
      }
    }).catch((error) => {
      console.error('[AuthContext] CRITICAL: Error getting initial session:', error);
      setIsLoading(false);
    });

    let lastUserId: string | null = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isSubscribed) return;

      const newUserId = newSession?.user?.id ?? null;

      if (newUserId === lastUserId && _event === 'SIGNED_IN') {
        return;
      }

      lastUserId = newUserId;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchUserProfile(newSession.user.id, newSession.access_token);
      } else {
        setUserProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (customRedirect?: string) => {
    try {
      const redirectUrl = typeof customRedirect === 'string' ? customRedirect : window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setSession(null);
      setUserProfile(null);

      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const refreshUserProfile = async () => {
    if (user && session) {
      await fetchUserProfile(user.id, session.access_token);
    }
  };

  const isDevAuth = import.meta.env.DEV && typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('dev') === 'true' ||
    window.localStorage.getItem('dev_auth') === 'true'
  );

  const effectiveUser = user || (isDevAuth ? ({ id: 'dev-user', email: 'dev@osra.family' } as User) : null);
  const effectiveProfile = userProfile || (isDevAuth ? ({ id: 'dev-user', role: 'admin', node_id: 'node-1' } as any) : null);

  const value: AuthContextType = {
    user: effectiveUser,
    session,
    userProfile: effectiveProfile,
    isLoading: isDevAuth ? false : isLoading,
    isAdmin: effectiveProfile?.role === 'admin',
    isBound: !!effectiveProfile?.node_id,
    signInWithGoogle,
    signOut,
    refreshUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
