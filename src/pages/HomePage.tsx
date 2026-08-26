import { lazy, Suspense } from 'react';
import Button from '@mui/material/Button';
import { FamilyTree } from '../components/FamilyTree';
import { useAuth } from '../contexts/AuthContext';
import { FamilyDataProvider } from '../contexts/FamilyDataContext';

const LandingPage = lazy(() => import('../landing/LandingPage'));

export default function HomePage() {
  const { user, isLoading, signInWithGoogle, signOut, isBound } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          minHeight: '100vh',
          color: 'white',
          background: '#0a0a0a',
        }}
        aria-busy="true"
      >
        Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span>...
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff' }}>Loading...</div>}>
        <LandingPage onSignIn={() => signInWithGoogle(window.location.origin)} />
      </Suspense>
    );
  }

  if (!isBound) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <h1 style={{ color: 'white', fontSize: '2.5rem', marginBottom: '10px' }}>
          Welcome, {user.email}!
        </h1>
        <p style={{ color: 'white', fontSize: '1.2rem', textAlign: 'center', maxWidth: '600px' }}>
          You need an invite link to access the family tree. Please ask a family member to send you an invite.
        </p>
        <Button variant="outlined" onClick={signOut} sx={{ border: '2px solid white', color: 'white', fontWeight: 'bold' }}>
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000
      }}>
        <Button variant="contained" color="error" onClick={signOut}>
          Sign Out
        </Button>
      </div>
      {/* Scoped to the signed-in tree: the landing page has no reason to hold a
          family graph, and this is the narrowest mount that still covers every
          reader — FamilyChat included, since it renders inside FamilyTree. */}
      <FamilyDataProvider>
        <FamilyTree />
      </FamilyDataProvider>
    </div>
  );
}
