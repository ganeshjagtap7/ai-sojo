import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Press — Searcher',
  description: 'Press and media enquiries for Searcher.',
};

const PRESS_EMAIL = 'hello@pocket-fund.com';

const wrap: React.CSSProperties = {
  maxWidth: 620,
  margin: '0 auto',
  padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 40px)',
  fontFamily: 'var(--sans)',
  color: 'var(--ink)',
};

export default function PressPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <div style={wrap}>
        <Link href="/" style={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-55)', textDecoration: 'none' }}>
          ← Searcher
        </Link>

        <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--ink-55)', marginTop: 40 }}>
          Press
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, letterSpacing: '-0.025em', fontSize: 'clamp(30px, 6vw, 44px)', lineHeight: 1.1, margin: '16px 0 20px' }}>
          Press &amp; media.
        </h1>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 16px' }}>
          Searcher is in private beta. We don’t have a press kit yet — but we’re
          happy to talk.
        </p>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 32px' }}>
          For press, partnership, or media enquiries, email{' '}
          <a href={`mailto:${PRESS_EMAIL}`} style={{ color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {PRESS_EMAIL}
          </a>{' '}
          and we’ll get back to you.
        </p>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ink-12)', display: 'flex', gap: 16, fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <Link href="/" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Home</Link>
          <Link href="/ethos" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Ethos</Link>
          <Link href="/login" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Login</Link>
        </div>
      </div>
    </main>
  );
}
