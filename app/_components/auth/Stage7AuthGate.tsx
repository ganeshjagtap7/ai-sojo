'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { friendlyAuthError } from '@/lib/errors/authError';
import { PasswordField } from './PasswordField';

type Mode = 'signup' | 'signin';

// 'start' = front-door gate before the onboarding wizard; 'claim' = the
// flagged mid-funnel gate that fires after the free stages (archetype +
// five fast facts), before the paid conversation stage — nothing has been
// generated yet at this point, so copy must not claim a thesis is "ready".
// Auth logic is identical for both.
type Context = 'start' | 'claim';

export function Stage7AuthGate({ context = 'claim' }: { context?: Context }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (err) throw err;
        if (!data.session) {
          setMessage('Check your inbox to confirm your email, then come back and sign in.');
          setMode('signin');
        } else {
          // Auto-confirmed signup returns a session immediately — re-run server
          // routing so the user is placed correctly (see below).
          router.refresh();
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        // Signing in only updates client auth state; it does NOT reload the page,
        // so the `/` server check that redirects returning users (with an active
        // thesis) to /app never re-runs — they'd be stuck on the onboarding
        // wizard until a manual refresh. refresh() re-runs that server check:
        // returning users get bounced to /app, brand-new users stay in the wizard.
        router.refresh();
      }
    } catch (err) {
      // Friendly copy (consistent with the /login and /signup pages) instead of
      // raw Supabase strings like "Invalid login credentials" / "fetch failed".
      const raw = err instanceof Error ? err.message : 'Something went wrong';
      setError(friendlyAuthError(raw, mode === 'signup' ? 'signup' : 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="s7 fade-in">
      <div className="s7-inner" style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 480, margin: '0 auto' }}>
        <div className="s7-col">
          <h2>{context === 'start' ? <>Sign in to <em>begin</em>.</> : <>Sign in to <em>continue</em>.</>}</h2>
          <p>
            {context === 'start'
              ? 'Sojo builds your investment thesis through a short guided conversation, then returns a ranked target list. Create a free account to get started — your work saves automatically as you go.'
              : "You've told us who you are and what you're looking for. Create a free account to continue — we'll guide you through a short conversation and save your work as you go."}
          </p>

          <form onSubmit={handleSubmit} style={formStyles.form}>
            <label style={formStyles.label}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                style={formStyles.input}
              />
            </label>
            <PasswordField
              value={password}
              onChange={setPassword}
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              labelStyle={formStyles.label}
              inputStyle={formStyles.input}
            />

            {message && <p style={formStyles.info}>{message}</p>}
            {error && <p style={formStyles.error}>{error}</p>}

            <button type="submit" disabled={submitting} className="iden-cta" style={{ width: '100%', marginTop: 6 }}>
              {submitting
                ? 'Working…'
                : context === 'start'
                  ? mode === 'signup' ? 'Create account & begin' : 'Sign in & begin'
                  : mode === 'signup' ? 'Create account & continue' : 'Sign in & continue'}
            </button>

            <button
              type="button"
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setMessage(null); }}
              style={formStyles.toggle}
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </form>

          <p className="caption" style={{ marginTop: 16, textAlign: 'center' }}>
            {context === 'start'
              ? 'Free to start — no card required.'
              : 'Nothing is lost — your answers are saved behind sign-up.'}
          </p>
        </div>
      </div>
    </div>
  );
}

const formStyles: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-55)' },
  input: { padding: '10px 12px', fontSize: 15, fontFamily: 'var(--serif)', border: '1px solid var(--ink-12)', borderRadius: 4, background: 'var(--paper)', color: 'var(--ink)' },
  info: { fontSize: 13, padding: '10px 12px', border: '1px solid #cfe0ff', background: '#eef5ff', color: '#1e3a8a', margin: 0, borderRadius: 4 },
  error: { fontSize: 13, padding: '10px 12px', border: '1px solid var(--crimson)', background: 'rgba(220,38,38,0.06)', color: 'var(--crimson)', margin: 0, borderRadius: 4 },
  toggle: { padding: 6, fontSize: 12, color: 'var(--ink-55)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--sans)' },
};
