'use client';

import { useState } from 'react';
import { useFlow, LS_KEY } from './FlowProvider';
import { useAuth } from '../auth/AuthProvider';
import { friendlyActionError } from '@/lib/errors/actionError';

export function Stage6Deliver() {
  const { state, dispatch } = useFlow();
  const { user, loading } = useAuth();
  const { thesis, facts, buckets, archetype } = state;
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const disqualifiers = thesis?.disqualifiers?.length
    ? thesis.disqualifiers
    : [buckets.disqualifier || 'Customer concentration above 35%'];

  // Authed-user "Save and view" path. Skips /signup since we already have a
  // session — write the thesis directly to /api/onboard, then jump to /app.
  const onSaveAndView = async () => {
    setPersisting(true);
    setPersistError(null);
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype, facts, buckets, thesis }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // 4xx copy from the server is user-actionable; 5xx/unknown get a calm
        // generic rather than a raw "HTTP 500".
        const friendly =
          res.status >= 400 && res.status < 500 && j.error
            ? j.error
            : "We couldn't save your thesis right now. Please try again.";
        throw new Error(friendly);
      }
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        // Storage disabled — non-fatal.
      }
      window.location.href = '/app';
    } catch (err) {
      setPersistError(friendlyActionError(err, "We couldn't save your thesis right now. Please try again."));
      setPersisting(false);
    }
  };

  // Empty state — no thesis yet. Happens when the user skipped Stage 5
  // via Next/Tweaks, or refreshed mid-generation.
  if (!thesis) {
    return (
      <div className="s6 fade-in">
        <div style={{ maxWidth: 640, margin: '120px auto', padding: '0 40px', textAlign: 'center' }}>
          <div className="eye" style={{ marginBottom: 20 }}>§ Six · Delivery</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 44, fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 20 }}>
            Nothing to <em>deliver</em> yet.
          </h1>
          <p style={{ fontSize: 16, color: 'var(--ink-70)', lineHeight: 1.6, marginBottom: 32 }}>
            The thesis hasn&apos;t been generated — either you skipped ahead or the page was refreshed mid-generation. Go back to Stage 5 to kick it off.
          </p>
          <button
            onClick={() => dispatch({ type: 'SET_STAGE', stage: 5 })}
            style={{
              fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500,
              padding: '12px 22px', border: '1px solid var(--ink)',
              background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer',
            }}
          >
            ← Back to Stage 5 · Generate
          </button>
        </div>
      </div>
    );
  }

  const ctaLabel = loading
    ? 'Loading…'
    : user
    ? persisting
      ? 'Saving…'
      : 'Save and view your matches →'
    : 'Create account to unlock your deals →';

  const ctaDisabled = loading || persisting;

  return (
    <div className="s6 fade-in">
      <div className="s6-ribbon">
        <div className="s6-ribbon-l">
          <div className="dot" />
          <span>
            Delivered · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </span>
          <div className="sep" />
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-55)', letterSpacing: '0.08em' }}>
            Thesis v1 · Draft
          </span>
        </div>
        <div className="s6-ribbon-actions">
          {user ? (
            <button
              type="button"
              className="s6-ribbon-btn solid"
              onClick={onSaveAndView}
              disabled={ctaDisabled}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              {ctaLabel}
            </button>
          ) : (
            <a
              className="s6-ribbon-btn solid"
              href="/signup"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Create account to unlock your deals →
            </a>
          )}
        </div>
      </div>

      <div className="s6-acts">
        {/* ACT I — THESIS */}
        <section className="s6-act">
          <div className="s6-act-eye"><span className="sect">§ Act One</span> · The thesis</div>
          <h1 className="s6-h1">{thesis.headline || 'Your thesis'}</h1>

          <div className="s6-meta-row">
            <div><div className="lbl">Archetype</div><div className="val">{thesis.archetypeLabel || buckets.archetype || '—'}</div></div>
            <div><div className="lbl">Geography</div><div className="val">{(facts.geo || ['Southeast']).slice(0, 2).join(' + ')}</div></div>
            <div><div className="lbl">Check size</div><div className="val">{facts.check || '$3–10M'}</div></div>
            <div><div className="lbl">Horizon</div><div className="val">{facts.horizon || '5–10 yrs'}</div></div>
          </div>

          <div className="s6-section">
            <h3>The one paragraph</h3>
            <p>{thesis.paragraph || '—'}</p>
          </div>

          {thesis.sharpening && (
            <div className="s6-section">
              <h3>Where you sharpened (in session)</h3>
              <p>{thesis.sharpening}</p>
            </div>
          )}

          <div className="s6-section">
            <h3>Disqualifiers · the fast nos</h3>
            <div className="s6-disqual">
              <ul>{disqualifiers.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          </div>
        </section>

        {/* CTA — replaces Acts II & III */}
        <section className="s6-act" style={{ textAlign: 'center', paddingTop: 32 }}>
          <div className="s6-act-eye"><span className="sect">§ Next</span> · Unlock your matches</div>
          <h1 className="s6-h1" style={{ fontSize: 36 }}>
            {user ? (
              <>Save your <em>thesis</em> and see what matches.</>
            ) : (
              <>Your thesis is the <em>filter</em>. Sign up to see what passes.</>
            )}
          </h1>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink-70)', maxWidth: 580, margin: '20px auto 32px', lineHeight: 1.6 }}>
            We&apos;ll scan thousands of companies against this thesis and surface the ones worth a Monday call. Your thesis stays saved, your matches stay yours.
          </p>
          {user ? (
            <button
              type="button"
              onClick={onSaveAndView}
              disabled={ctaDisabled}
              style={{
                display: 'inline-block',
                fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, letterSpacing: '0.02em',
                padding: '14px 28px', border: '1px solid var(--ink)',
                background: 'var(--ink)', color: 'var(--paper)',
                cursor: ctaDisabled ? 'wait' : 'pointer',
                opacity: ctaDisabled ? 0.7 : 1,
              }}
            >
              {ctaLabel}
            </button>
          ) : (
            <a
              href="/signup"
              style={{
                display: 'inline-block',
                fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, letterSpacing: '0.02em',
                padding: '14px 28px', border: '1px solid var(--ink)',
                background: 'var(--ink)', color: 'var(--paper)',
                textDecoration: 'none', cursor: 'pointer',
              }}
            >
              Create account to unlock your deals →
            </a>
          )}
          {persistError && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#991b1b' }}>{persistError}</p>
          )}
        </section>
      </div>
    </div>
  );
}
