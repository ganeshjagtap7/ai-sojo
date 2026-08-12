import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ethos — Searcher',
  description: 'What Searcher is, who it’s for, and what we believe about sourcing acquisitions.',
};

const wrap: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 40px)',
  fontFamily: 'var(--sans)',
  color: 'var(--ink)',
};
const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--ink-55)',
};
const h1: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontWeight: 400, letterSpacing: '-0.025em',
  fontSize: 'clamp(30px, 6vw, 44px)', lineHeight: 1.1, margin: '16px 0 8px',
};
const lede: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(17px, 3.4vw, 20px)',
  color: 'var(--ink-70)', lineHeight: 1.5, margin: '0 0 40px',
};
const h2: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em',
  textTransform: 'uppercase', color: 'var(--ink-55)', margin: '40px 0 12px',
};
const p: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 16px',
};

export default function EthosPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <div style={wrap}>
        <Link href="/" style={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-55)', textDecoration: 'none' }}>
          ← Searcher
        </Link>

        <div style={{ ...eyebrow, marginTop: 40 }}>Ethos</div>
        <h1 style={h1}>What this is, and who it’s for.</h1>
        <p style={lede}>
          An investment committee that thinks in targets, not decks.
        </p>

        <h2 style={h2}>What it is</h2>
        <p style={p}>
          You describe an acquisition mandate in plain language. A short guided
          conversation sharpens it into real criteria — industry, geography, size —
          and pressure-tests the thesis. Then the system live-scrapes the most
          relevant sources for that mandate and returns one ranked board of real
          businesses, each with a match score and a reason.
        </p>
        <p style={p}>
          Nothing is pre-stored. Every search hits the sources at that moment, so
          results are as fresh as the sites themselves.
        </p>

        <h2 style={h2}>Who it’s for</h2>
        <p style={p}>
          Independent searchers, traditional searchers with investors, fundless
          sponsors and ETA funds, and holdco operators — anyone running a real
          acquisition search who would rather spend their hours on the businesses
          than on the sourcing. The session tunes to how you buy: how hard it pushes
          back, which disqualifiers matter, how it frames risk.
        </p>

        <h2 style={h2}>What we believe</h2>
        <p style={p}>
          <strong>A thesis beats a deck.</strong> Clarity about what you’d buy and
          why is the actual work; the list is downstream of it.
        </p>
        <p style={p}>
          <strong>One channel, not the only channel.</strong> The product adds leads
          and saves you hours — it doesn’t replace your own sourcing, diligence, or
          judgment. Contact details come from live scrapes, so verify them before
          you reach out.
        </p>

        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--ink-12)', display: 'flex', gap: 16, fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <Link href="/" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Home</Link>
          <Link href="/press" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Press</Link>
          <Link href="/login" style={{ color: 'var(--ink-55)', textDecoration: 'none' }}>Login</Link>
        </div>
      </div>
    </main>
  );
}
