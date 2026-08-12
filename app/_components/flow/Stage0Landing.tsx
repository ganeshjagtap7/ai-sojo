'use client';

import { useState } from 'react';
import { useFlow } from './FlowProvider';

// The five searcher archetypes, mirrored from Stage 1 (Identify) so the "built
// for" section stays in sync with the types the product actually tunes to.
const ARCHETYPES = [
  { t: 'Self-funded searcher', m: 'One shot. One check. Everything on the line.' },
  { t: 'Traditional searcher with investors', m: 'Committee-backed. Reputation matters.' },
  { t: 'Fundless sponsor / ETA fund', m: 'Portfolio mindset. Pattern over precision.' },
  { t: 'Holdco operator', m: 'Long hold. Platform-shaped thinking.' },
  { t: 'Still exploring', m: 'Not sure yet — the session pushes a little harder.' },
];

const STEPS = [
  {
    n: '01',
    t: 'Describe your mandate',
    b: 'Write what you’d buy in plain English — industry, geography, size. "HVAC services around Dallas, $1–3M revenue, owner looking to exit."',
  },
  {
    n: '02',
    t: 'The AI sharpens it',
    b: 'A short guided conversation turns your mandate into real criteria and pressure-tests the thesis — what "sticky" means to you, your fast nos, the five-year picture.',
  },
  {
    n: '03',
    t: 'Live sources, ranked board',
    b: 'We scrape the most relevant sources for that mandate right then — nothing pre-stored — and hand back a ranked board of real businesses, each with a match score and a reason.',
  },
];

const FAQS = [
  {
    q: 'How is this different from a broker?',
    a: "We're not a broker and we don't represent sellers. You describe a thesis; we search live public sources and return a ranked board of businesses that fit it. No listings pushed at you, no commission, no side of the table.",
  },
  {
    q: 'How fresh is the data?',
    a: 'Every search hits the sources live at that moment — nothing is pre-stored — so results are as fresh as the sites themselves. Contact details come from those scrapes, so verify them before you reach out.',
  },
  {
    q: 'What does the flat fee cover?',
    a: 'One thesis: the guided session, a live multi-source search, and a ranked board of real businesses with match reasons, saved to your workspace. No subscription and no per-seat pricing.',
  },
  {
    q: 'How long does it really take?',
    a: 'About five minutes end to end — a few minutes of conversation to shape the thesis, then a 1–2 minute live search. The progress panel shows each source as it completes, and some sources failing is normal; the search continues without them.',
  },
  {
    q: 'Who is this not a good fit for?',
    a: 'If you want a broker to hand you pre-vetted, off-market deals with a guarantee they’re for sale, this isn’t that. It’s one sourcing channel that saves you hours — it doesn’t replace your own diligence or outreach.',
  },
];

// Stage 0: landing / first contact
export function Stage0Landing() {
  const { state, dispatch } = useFlow();
  const [email, setEmail] = useState(state.email ?? '');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) return;
    // Persist the captured email so it isn't collected-then-discarded — it's
    // kept in flow state for downstream use (e.g. pre-filling signup).
    dispatch({ type: 'SET_EMAIL', email: email.trim() });
    dispatch({ type: 'SET_STAGE', stage: 1 });
  };
  return (
    <div className="lp fade-in">
      <div className="lp-body">
        <div className="lp-main">
          <div className="lp-eye">Searcher AI · Est. 2026 · Private Beta</div>
          <div className="lp-rule"></div>
          <h1 className="lp-h">
            An <em>investment committee</em><br/>
            that thinks in targets,<br/>
            not decks.
          </h1>
          <p className="lp-sub">
            Tell us what you'd buy and why. We return a working thesis and ten companies you could actually call Monday morning.
          </p>
          <form className="lp-form" onSubmit={submit}>
            <input
              autoFocus
              type="email"
              inputMode="email"
              placeholder="you@fund.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={!emailValid}>Begin</button>
          </form>
          <div className="lp-meta">
            <div className="lp-meta-cell">
              <div className="lbl">Flat fee</div>
              <div className="val">$2,500 / thesis</div>
            </div>
            <div className="lp-meta-cell">
              <div className="lbl">Turnaround</div>
              <div className="val">~5 minutes</div>
            </div>
          </div>
        </div>
        <div className="lp-side">
          <div className="lp-side-eye">From a recent session</div>
          <p className="lp-quote">
            "I came in thinking 'pest control rollup.' I left with a sharper thesis and two names I had never heard of. One responded within a week."
          </p>
          <div className="lp-attr">— Searcher, Atlanta · $8M committed</div>
        </div>
      </div>

      {/* How it works */}
      <section className="lp-sec" id="how-it-works">
        <div className="lp-sec-eye">How it works</div>
        <h2 className="lp-sec-h">A mandate in, a ranked board out.</h2>
        <div className="lp-steps">
          {STEPS.map((s) => (
            <div className="lp-step" key={s.n}>
              <div className="lp-step-n">{s.n}</div>
              <div className="lp-step-t">{s.t}</div>
              <p className="lp-step-b">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built for */}
      <section className="lp-sec" id="built-for">
        <div className="lp-sec-eye">Built for</div>
        <h2 className="lp-sec-h">Searchers, not spectators.</h2>
        <p className="lp-sec-sub">
          The session tunes to how you buy — how hard it pushes back, which disqualifiers matter, how it frames risk.
        </p>
        <div className="lp-arch-grid">
          {ARCHETYPES.map((a) => (
            <div className="lp-arch" key={a.t}>
              <div className="lp-arch-t">{a.t}</div>
              <div className="lp-arch-m">{a.m}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="lp-sec" id="pricing">
        <div className="lp-sec-eye">Pricing</div>
        <div className="lp-price-card">
          <div className="lp-price-left">
            <div className="lp-price-num">$2,500 <span className="u">/ thesis</span></div>
            <p className="lp-price-note">Flat. No subscription, no per-seat, no data resale.</p>
          </div>
          <ul className="lp-price-list">
            <li>A guided thesis session that sharpens your mandate into real criteria</li>
            <li>One live search across the sources that fit that mandate</li>
            <li>A ranked board of real businesses — match score and reason on each</li>
            <li>Everything saved to your workspace, ready to refine and re-run</li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-sec" id="faq">
        <div className="lp-sec-eye">Questions</div>
        <h2 className="lp-sec-h">Before you start.</h2>
        <div className="lp-faq">
          {FAQS.map((f) => (
            <details className="lp-faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="lp-foot">
        <div>Built for independent searchers &amp; ETA funds</div>
        <div className="lp-foot-links">
          <a href="/press">Press</a>
          <span className="sep">·</span>
          <a href="/ethos">Ethos</a>
          <span className="sep">·</span>
          <a href="/login">Login</a>
        </div>
      </div>
    </div>
  );
}
