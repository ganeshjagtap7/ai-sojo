'use client';

import { useFlow } from './FlowProvider';
import { useAuth } from '../auth/AuthProvider';
import type { ReactNode } from 'react';

const STAGES = [
  { id: 0, label: '00 · Landing' },
  { id: 1, label: '01 · Identify' },
  { id: 2, label: '02 · Fast facts' },
  { id: 3, label: '03 · Converse' },
  { id: 4, label: '04 · Confirm' },
  { id: 5, label: '05 · Generate' },
  { id: 6, label: '06 · Deliver' },
] as const;

const ARCHETYPE_LABELS: Record<string, string> = {
  'self-funded': 'self-funded searcher',
  traditional: 'traditional searcher',
  etf: 'fundless sponsor',
  holdco: 'holdco operator',
  exploring: 'exploring',
};

export function Shell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useFlow();
  const { user, signOut } = useAuth();
  const { stage, archetype } = state;

  const go = (n: number) => dispatch({ type: 'SET_STAGE', stage: Math.max(0, Math.min(6, n)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
  const restart = () => dispatch({ type: 'RESTART' });

  return (
    <div className="shell" data-screen-label={STAGES[stage].label}>
      <header className="shell-top">
        <div className="shell-left">
          <a className="logo" href="#" onClick={(e) => { e.preventDefault(); go(0); }}>
            <span className="logo-mark">S/AI</span>
            <span className="logo-dot" />
            <span className="logo-word">Searcher</span>
          </a>
          <div style={{ width: 1, height: 20, background: 'var(--ink-12)' }} />
          {archetype ? (
            <div className="arche-chip" onClick={() => go(1)}>
              {archetype.name} · <span style={{ color: 'var(--ink-55)' }}>{ARCHETYPE_LABELS[archetype.id]}</span>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-55)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {/* Signed-in users aren't "unidentified". Use a real name if the
                  auth profile has one (e.g. OAuth); otherwise a clean "Signed
                  in" — never the raw email handle. Once they complete Identify,
                  the archetype chip above shows the name they entered. */}
              {user
                ? ((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || 'Signed in')
                : 'Unidentified visitor'}
            </div>
          )}
        </div>
        <div className="shell-right" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user ? (
            <>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-55)', letterSpacing: '0.05em' }}>
                {user.email}
              </span>
              <a className="doc-link" href="/app">Workspace</a>
              <a className="doc-link" href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
            </>
          ) : (
            <a className="doc-link" href="/login">Sign in</a>
          )}
          <a className="doc-link" href="#" onClick={(e) => { e.preventDefault(); restart(); }}>Restart</a>
        </div>
      </header>

      <main className="shell-body" key={stage}>{children}</main>

      <footer className="shell-foot">
        <div className="shell-foot-l">
          <span>{STAGES[stage].label}</span>
          <div className="shell-foot-progress">
            {STAGES.map((s, i) => (
              <div key={s.id} className={`seg ${i < stage ? 'done' : i === stage ? 'current' : ''}`} />
            ))}
          </div>
        </div>
        <div className="shell-foot-nav">
          <button onClick={() => go(stage - 1)} disabled={stage === 0}>← Prev</button>
          <button onClick={() => go(stage + 1)} disabled={stage === 6}>Next →</button>
        </div>
      </footer>
    </div>
  );
}
