// Harness stand-in for src/contexts/AuthContext.tsx: a signed-in, bound Member of a made-up Tree.
import React, { createContext, useContext } from 'react';

declare global {
  interface Window { __harnessBoundNodeId?: string }
}

const value = () => ({
  user: { id: 'harness-user', email: 'harness@example.invalid' },
  session: { access_token: 'harness-token' },
  userProfile: { id: 'harness-user', role: 'member', node_id: window.__harnessBoundNodeId ?? null },
  isLoading: false,
  isAdmin: false,
  isBound: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshUserProfile: async () => {},
});

const Ctx = createContext<ReturnType<typeof value> | undefined>(undefined);
const fixed = value();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={fixed}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const context = useContext(Ctx);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
