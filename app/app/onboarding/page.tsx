'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LS_KEY } from '@/app/_components/flow/FlowProvider';

type Status = 'persisting' | 'done' | 'failed';

export default function OnboardingHandoffPage() {
  const router = useRouter();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<Status>('persisting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Named so the Retry button can re-fire it — a state reset alone never
  // re-runs the mount effect, which left Retry spinning forever.
  const persist = async () => {
    setStatus('persisting');
    setErrorMsg(null);

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
        throw new Error(j?.error ?? `HTTP ${res.status}`);
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
      setStatus('done');
      router.replace('/app');
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <button type="button" style={styles.button} onClick={() => void persist()}>
              Retry
            </button>
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', fontFamily: 'var(--font-inter)' },
  card: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' },
  heading: { fontSize: 22, fontWeight: 600, margin: 0 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  error: { fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', margin: 0 },
  button: { padding: '0.625rem 1rem', fontSize: 14, fontWeight: 500, borderRadius: 6, background: '#111', color: '#fff', border: 'none', cursor: 'pointer' },
  spinner: {
    width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#111',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
};
