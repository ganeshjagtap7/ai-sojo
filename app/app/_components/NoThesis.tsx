import Link from 'next/link';

// Empty state for a signed-in user who has no active thesis. Replaces the old
// bounce back to the onboarding wizard — a signed-in user should land in their
// workspace, with a clear way to start a thesis, not get marched into a form.
export function NoThesis() {
  return (
    <div
      className="view active"
      style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>
          Your workspace
        </div>
        <h1 style={{ fontFamily: 'var(--font-instrument), serif', fontSize: 40, fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 12px' }}>
          No active thesis.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 28px' }}>
          Your searches live behind a thesis. Start one — a short guided
          conversation — and your ranked board of businesses shows up here.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none' }}>
            Start a thesis →
          </Link>
          <Link href="/app/theses" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', borderBottom: '1px solid var(--border)', paddingBottom: 1 }}>
            View your theses
          </Link>
        </div>
      </div>
    </div>
  );
}
