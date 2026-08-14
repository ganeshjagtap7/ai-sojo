import Link from 'next/link';

// Empty state for a signed-in user who has no active thesis. Instead of a bare
// "nothing here" it invites the user in: a warm headline, the three-step shape
// of what's about to happen, and a clear primary action. Styling lives in
// sojo.css (.empty-ws*) so it stays responsive across devices.
const STEPS = [
  { n: 1, t: 'Shape your thesis', m: "A short conversation: who you are, what you'd buy, and your hard no's." },
  { n: 2, t: 'We scan, live', m: 'Real marketplaces and directories, matched to your criteria as you go.' },
  { n: 3, t: 'Your ranked board', m: 'Every business scored and explained — save the ones worth a call.' },
];

export function NoThesis() {
  return (
    <div className="view active empty-ws">
      <div className="empty-ws-card">
        <div className="empty-ws-eye">Your workspace</div>
        <h1 className="empty-ws-title">
          Let&rsquo;s find the <em>one</em>.
        </h1>
        <p className="empty-ws-sub">
          Your searches live behind a thesis — a short guided conversation about the
          business you&rsquo;re looking for. Start one and your ranked, explained board
          shows up right here.
        </p>

        <ol className="empty-ws-steps">
          {STEPS.map((s) => (
            <li className="empty-ws-step" key={s.n}>
              <span className="n">{s.n}</span>
              <div className="s-t">{s.t}</div>
              <div className="s-m">{s.m}</div>
            </li>
          ))}
        </ol>

        <div className="empty-ws-cta">
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none' }}>
            Start a thesis →
          </Link>
          <Link href="/app/theses" className="empty-ws-link">
            View your theses
          </Link>
        </div>
      </div>
    </div>
  );
}
