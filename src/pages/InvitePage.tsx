import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import { useAuth } from '../contexts/AuthContext';

type InviteStatus = 
  | 'loading' 
  | 'valid' 
  | 'expired' 
  | 'claimed' 
  | 'not_found' 
  | 'claiming' 
  | 'error';

const INVITE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{10,64}$/;

function isValidInviteToken(t: string | undefined): t is string {
  return !!t && INVITE_TOKEN_REGEX.test(t);
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, session, signInWithGoogle } = useAuth();
  
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('loading');
  const [inviteData, setInviteData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [declinedIdentity, setDeclinedIdentity] = useState<boolean>(false);
  const [confirmedIdentity, setConfirmedIdentity] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (!token) return false;
    try {
      return window.sessionStorage.getItem(`invite_confirmed_identity_${token}`) === 'true';
    } catch {
      return false;
    }
  });

  // Validate the invite
  useEffect(() => {
    if (!isValidInviteToken(token)) {
      setInviteStatus('not_found');
      return;
    }

    let cancelled = false;

    const validateInvite = async () => {
      try {
        // Bypass Supabase client (websocket hangs) - use raw fetch to REST API
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const response = await fetch(
          `${supabaseUrl}/rest/v1/rpc/get_invite_by_token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ invite_token: token }),
          }
        );
        
        if (cancelled) return;

        if (!response.ok) {
          await response.text();
          setInviteStatus('not_found');
          return;
        }

        const data = await response.json();

        // RPC returns null when no row found
        if (!data || typeof data !== 'object') {
          setInviteStatus('not_found');
          return;
        }

        // Check if already claimed
        if (data.claimed_by_user_id) {
          setInviteStatus('claimed');
          setInviteData(data);
          return;
        }

        // Check if expired
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          setInviteStatus('expired');
          setInviteData(data);
          return;
        }

        setInviteStatus('valid');
        setInviteData(data);

        // Reset any previous decline state when a fresh invite validates
        setDeclinedIdentity(false);

        // Persist invite data for UX continuity across auth redirects
        try {
          if (token) {
            window.sessionStorage.setItem(
              `invite_data_${token}`,
              JSON.stringify(data)
            );
          }
        } catch {
          // Non-fatal if sessionStorage is unavailable
        }
    } catch {
      setInviteStatus('error');
      setErrorMessage('Failed to validate invite');
    }
    };

    validateInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Auto-claim when user logs in (must have session token - anon key returns 401)
  useEffect(() => {
    if (user && session?.access_token && inviteStatus === 'valid' && inviteData && confirmedIdentity) {
      claimInvite();
    }
  }, [user, session?.access_token, inviteStatus, inviteData, confirmedIdentity]);

  const claimInvite = async () => {
    if (!user || !inviteData || !token) return;
    if (!session?.access_token) {
      setInviteStatus('error');
      setErrorMessage('Session not ready. Please wait a moment and try again.');
      return;
    }
    setInviteStatus('claiming');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const authToken = session.access_token;
      
      // Call the secure RPC function that handles the entire claim flow atomically
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/claim_invite_secure`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            invite_token: token,
            claiming_user_id: user.id,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        let parsed: { message?: string; error?: string } | null = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {
          // Ignore parse errors
        }
        const msg = parsed?.message ?? parsed?.error ?? (response.status === 401 ? 'Please sign in again.' : `Request failed (${response.status}).`);
        throw new Error(msg);
      }

      const result = await response.json();

      // Check if the RPC returned an error
      if (!result.success) {
        setInviteStatus('error');
        
        // Map error codes to user-friendly messages
        switch (result.error) {
          case 'invalid_invite':
            setErrorMessage('This invite link is not valid.');
            break;
          case 'already_claimed':
            setInviteStatus('claimed');
            setErrorMessage('This invite has already been claimed.');
            break;
          case 'expired_invite':
            setInviteStatus('expired');
            setErrorMessage('This invite has expired.');
            break;
          case 'already_bound':
            setErrorMessage('You are already bound to a node in the family tree.');
            break;
          case 'auth_not_found':
            setErrorMessage(result.message || 'Unable to retrieve your profile. Please sign out and try again.');
            break;
          case 'unauthorized':
            setErrorMessage('You must be signed in to claim this invite.');
            break;
          default:
            setErrorMessage(result.message || 'Failed to claim invite. Please try again.');
        }
        return;
      }

      // Clear any invite confirmation/session markers on success
      try {
        if (token) {
          window.sessionStorage.removeItem(`invite_confirmed_identity_${token}`);
          window.sessionStorage.removeItem(`invite_data_${token}`);
        }
      } catch {
        // Ignore storage errors
      }

      // Success! Redirect with hard reload to ensure fresh auth context
      window.location.href = '/';
      
    } catch (err) {
      setInviteStatus('error');
      const msg = err instanceof Error ? err.message : 'Failed to claim invite. Please try again.';
      setErrorMessage(msg);
    }
  };

  const renderContent = () => {
    switch (inviteStatus) {
      case 'loading':
        return (
          <div>
            <h2>Validating invite...</h2>
          </div>
        );

      case 'valid':
        if (!user || !confirmedIdentity) {
          const displayName = inviteData?.node_name ?? 'a family member';

          const handleYes = () => {
            try {
              if (token) {
                window.sessionStorage.setItem(
                  `invite_confirmed_identity_${token}`,
                  'true'
                );
              }
            } catch {
              // Non-fatal if storage fails
            }
            setConfirmedIdentity(true);
            setDeclinedIdentity(false);

            if (!user) {
              // Proceed to auth; redirect back to this invite URL
              signInWithGoogle(window.location.href);
            } else {
              // Already signed in and now confirmed; claim immediately
              claimInvite();
            }
          };

          const handleNo = () => {
            try {
              if (token) {
                window.sessionStorage.removeItem(
                  `invite_confirmed_identity_${token}`
                );
                window.sessionStorage.removeItem(`invite_data_${token}`);
              }
            } catch {
              // Ignore storage errors
            }
            setConfirmedIdentity(false);
            setInviteStatus('error');
            setDeclinedIdentity(true);
            setErrorMessage(
              "This invite appears to be for someone else. Please contact your family member to get the correct link."
            );
          };

          return (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>
                You're Invited!
              </h1>
              <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
                You are being invited to claim this profile in the family tree:
              </p>
              <p
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 'bold',
                  color: '#667eea',
                  marginBottom: '16px',
                }}
              >
                {displayName}
              </p>
              <p style={{ fontSize: '1.1rem', marginBottom: '24px' }}>
                Is this you?
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <Button variant="contained" onClick={handleYes} sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
                  Yes, continue
                </Button>
                <Button variant="outlined" onClick={handleNo} sx={{ borderColor: 'rgba(255,255,255,0.6)', color: 'white' }}>
                  No, this isn't me
                </Button>
              </div>
            </div>
          );
        }
        return null; // Will auto-claim when user is present and identity confirmed

      case 'claiming':
        return (
          <div>
            <h2>Claiming your spot in the family tree...</h2>
          </div>
        );

      case 'expired':
        return (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '20px', color: '#f59e0b' }}>
              Invite Expired
            </h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '30px' }}>
              This invite link has expired. Please contact the person who sent it to request a new one.
            </p>
          </div>
        );

      case 'claimed':
        return (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '20px', color: '#10b981' }}>
              Already Claimed
            </h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '30px' }}>
              This invite has already been claimed. If this was you, please sign in.
            </p>
            {!user && (
              <Button variant="contained" onClick={() => signInWithGoogle(window.location.origin)} sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
                Returning? Sign in here
              </Button>
            )}
          </div>
        );

      case 'not_found':
        return (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '20px', color: '#ef4444' }}>
              Invalid Invite
            </h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '30px' }}>
              This invite link is not valid. Please check the URL and try again.
            </p>
          </div>
        );

      case 'error':
        if (declinedIdentity) {
          const displayName = inviteData?.node_name ?? 'this profile';
          return (
            <div style={{ textAlign: 'center' }}>
              <h1
                style={{
                  fontSize: '2.3rem',
                  marginBottom: '16px',
                  color: '#fb7185', // soft rose
                }}
              >
                Alrighty then!
              </h1>
              <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                We won&apos;t claim this profile:
              </p>
              <p
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 600,
                  color: 'rgba(249, 250, 251, 0.9)', // lighter name for contrast
                  marginBottom: '20px',
                }}
              >
                {displayName}
              </p>
              <p style={{ fontSize: '0.95rem', opacity: 0.85 }}>
                If this invite was meant for someone else, feel free to close this
                tab and ask your family member to resend the correct link.
              </p>
            </div>
          );
        }
        return (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '20px', color: '#ef4444' }}>
              Error
            </h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '30px' }}>
              {errorMessage || 'Something went wrong. Please try again.'}
            </p>
          </div>
        );
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      gap: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '20px'
    }}>
      {renderContent()}
    </div>
  );
}
