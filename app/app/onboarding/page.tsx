'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LS_KEY } from '@/app/_components/flow/FlowProvider';
import { friendlyActionError } from '@/lib/errors/actionError';
import { authPageStyles } from '@/app/_components/auth/authPageStyles';

type Status = 'persisting' | 'done' | 'failed';

export default function OnboardingHandoffPage() {
  const router = useRouter();
  // Track which retry "tick" we last POSTed for. A bare boolean ref couldn't
  // re-trigger the effect on Retry (mutating a ref never re-runs a useEffect);
  // bumping `retry` (a dep) does, while the per-tick ref still blocks React's
  // StrictMode double-invoke from firing two POSTs for the same attempt.
  const ranTickRef = useRef(-1);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<Status>('persisting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ranTickRef.current === retry) return;
    ranTickRef.current = retry;

    let cancelled = false;

    (async () => {
      let payload: unknown = {};
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) payload = JSON.parse(raw);
      } catch {
        // Corrupt JSON in localStorage — treat as no-op so we don't block the user.
      }

      try {
        const res = await fetch('/api/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 4xx carry user-actionable copy from the server (e.g. the
          // "answers didn't come through" prompt); 5xx/unknown get a calm
          // generic instead of a raw "HTTP 500".
          const friendly =
            res.status >= 400 && res.status < 500 && j?.error
              ? j.error
              : "We couldn't save your thesis right now. Please try again.";
          throw new Error(friendly);
        }
        // Clear localStorage ONLY when a thesis was actually persisted. A no-op
        // response (persisted: false — e.g. the user reached here before finishing
        // the wizard) must NOT wipe their in-progress flow state (issue #11).
        if (j?.persisted === true) {
          try {
            localStorage.removeItem(LS_KEY);
          } catch {
            // Storage disabled — not fatal.
          }
        }
        if (!cancelled) {
          setStatus('done');
          router.replace('/app');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('failed');
          setErrorMsg(friendlyActionError(err, "We couldn't save your thesis right now. Please try again."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, retry]);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {status === 'persisting' && (
          <>
            <div style={styles.spinner} />
            <h1 style={styles.heading}>Saving your thesis…</h1>
            <p style={styles.sub}>One moment — we&apos;re storing your work to your account.</p>
          </>
        )}
        {status === 'failed' && (
          <>
            <h1 style={styles.heading}>Something went wrong</h1>
            <p style={styles.error}>{errorMsg ?? 'Please try again.'}</p>
            <p style={styles.sub}>Your thesis wasn&apos;t saved. Retry, or leave — your progress is kept so you can finish later.</p>
            <div style={styles.actions}>
              <button
                type="button"
                style={styles.button}
                onClick={() => {
                  setRetry((r) => r + 1);
                  setStatus('persisting');
                  setErrorMsg(null);
                }}
              >
                Retry
              </button>
              {/* Safe exit that's honest about the state: the save failed, so
                  nothing was persisted. Don't say "Continue to app" (there's no
                  saved thesis to open) — send them back to the wizard, where
                  their in-progress draft is preserved so they can try again. */}
              <button
                type="button"
                style={styles.buttonSecondary}
                onClick={() => router.replace('/')}
              >
                Leave without saving
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...authPageStyles,
  card: { ...authPageStyles.card, alignItems: 'center', textAlign: 'center' },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid var(--ink-12)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 0.8s linear infinite',
  },
  actions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
};
