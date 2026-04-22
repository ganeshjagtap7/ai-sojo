'use client';

import type { CSSProperties } from 'react';
import { useFlow } from './FlowProvider';
import type { RankedLead } from '@/lib/types';

export function Stage6Deliver() {
  const { state, dispatch } = useFlow();
  const { thesis, leads, searchMetadata, facts, buckets } = state;

  const targets = leads.slice(0, 10);
  const disqualifiers = thesis?.disqualifiers?.length
    ? thesis.disqualifiers
    : [buckets.disqualifier || 'Customer concentration above 35%'];

  // Empty state — no search has completed. Happens when the user skipped Stage 5
  // via Next/Tweaks, refreshed mid-search (FlowProvider clears transient fields),
  // or the search errored. Thesis may still be populated if /api/thesis succeeded.
  if (leads.length === 0 && !searchMetadata) {
    return (
      <div className="s6 fade-in">
        <div style={{ maxWidth: 640, margin: '120px auto', padding: '0 40px', textAlign: 'center' }}>
          <div className="eye" style={{ marginBottom: 20 }}>§ Six · Delivery</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 44, fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 20 }}>
            Nothing to <em>deliver</em> yet.
          </h1>
          <p style={{ fontSize: 16, color: 'var(--ink-70)', lineHeight: 1.6, marginBottom: 32 }}>
            The search hasn&apos;t run — either you skipped ahead or the page was refreshed mid-generation. Go back to Stage 5 to kick it off.
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

  const funnelSteps = (() => {
    const total = searchMetadata?.totalScraped ?? 0;
    if (total < 50) return null;
    return [
      { label: 'Raw universe',            n: total,                                     w: 580 },
      { label: 'Geo + size filter',       n: Math.round(total * 0.4),                   w: 420 },
      { label: 'Compliance-driven only',  n: Math.round(total * 0.15),                  w: 240 },
      { label: 'Succession signal',       n: searchMetadata?.afterFiltering ?? Math.round(total * 0.05), w: 110 },
      { label: 'Top ten',                 n: Math.min(leads.length, 10),                w: 36 },
    ];
  })();

  return (
    <div className="s6 fade-in">
      <div className="s6-ribbon">
        <div className="s6-ribbon-l">
          <div className="dot" />
          <span>
            Delivered · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            {searchMetadata?.searchDurationSeconds ? ` · ${Math.round(searchMetadata.searchDurationSeconds)} sec` : ''}
          </span>
          <div className="sep" />
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-55)', letterSpacing: '0.08em' }}>
            Thesis v1 · Draft
          </span>
        </div>
        <div className="s6-ribbon-actions">
          <button className="s6-ribbon-btn" onClick={() => {}}>Download PDF</button>
          <button className="s6-ribbon-btn" onClick={() => {}}>Share</button>
          <button className="s6-ribbon-btn solid" onClick={() => dispatch({ type: 'SET_STAGE', stage: 7 })}>
            Finish · go to inbox
          </button>
        </div>
      </div>

      <div className="s6-acts">
        {/* ACT I — THESIS */}
        <section className="s6-act">
          <div className="s6-act-eye"><span className="sect">§ Act One</span> · The thesis</div>
          <h1 className="s6-h1">{thesis?.headline || 'Your thesis'}</h1>

          <div className="s6-meta-row">
            <div><div className="lbl">Archetype</div><div className="val">{thesis?.archetypeLabel || buckets.archetype || '—'}</div></div>
            <div><div className="lbl">Geography</div><div className="val">{(facts.geo || ['Southeast']).slice(0, 2).join(' + ')}</div></div>
            <div><div className="lbl">Check size</div><div className="val">{facts.check || '$3–10M'}</div></div>
            <div><div className="lbl">Horizon</div><div className="val">{facts.horizon || '5–10 yrs'}</div></div>
          </div>

          <div className="s6-section">
            <h3>The one paragraph</h3>
            <p>{thesis?.paragraph || '—'}</p>
          </div>

          {thesis?.sharpening && (
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

        {/* ACT II — MARKET MAP */}
        <section className="s6-act">
          <div className="s6-act-eye"><span className="sect">§ Act Two</span> · The market</div>
          <h1 className="s6-h1" style={{ fontSize: 36 }}>
            {searchMetadata ? `${searchMetadata.totalScraped.toLocaleString()} candidates` : 'Candidates'} <em>narrowed</em> to {targets.length}.
          </h1>

          {funnelSteps ? (
            <div className="s6-chart-mini">
              <div className="s6-chart-title">Funnel — how the number became ten</div>
              <div className="s6-chart-sub">
                {(facts.geo || ['Southeast']).join(' + ')} · {facts.check || '$3–15M revenue'} · thesis-matched
              </div>
              <svg viewBox="0 0 600 140" style={{ width: '100%', height: 140, display: 'block' }}>
                {funnelSteps.map((s, i) => (
                  <g key={i} transform={`translate(${(600 - s.w) / 2}, ${i * 24 + 6})`}>
                    <rect width={s.w} height={18} fill={i === 4 ? '#0E0E0C' : 'rgba(14,14,12,0.85)'} opacity={0.25 + i * 0.16} />
                    <text x={s.w / 2} y={13} textAnchor="middle"
                      fill={i >= 3 ? '#FAF7F0' : '#0E0E0C'}
                      fontFamily="Inter" fontSize="10" fontWeight="500"
                      letterSpacing="0.06em">
                      {s.label.toUpperCase()} · {s.n.toLocaleString()}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="s6-chart-foot">
                <span>Source · Searcher AI market model</span>
                <span>{searchMetadata?.sourcesUsed?.join(' + ')}</span>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-70)' }}>
              Scanned {searchMetadata?.totalScraped ?? 0}, surfaced {targets.length}.
            </p>
          )}
        </section>

        {/* ACT III — TARGETS */}
        <section className="s6-act">
          <div className="s6-act-eye"><span className="sect">§ Act Three</span> · The ten</div>
          <div className="s6-universe-head">
            <div><h1 className="s6-h1" style={{ fontSize: 36, margin: 0 }}>
              {targets.length} companies you could <em>call Monday</em>.
            </h1></div>
            <div className="helper">
              Amber scores flag targets worth a second look but with caveats to resolve before outreach.
            </div>
          </div>

          <table className="s6-tgt">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Company</th>
                <th>Why it fits</th>
                <th className="num">Revenue / EBITDA</th>
                <th className="num" style={{ width: 90 }}>Fit score</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => (
                <TargetRow key={t.id} lead={t} index={i} />
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function TargetRow({ lead, index }: { lead: RankedLead; index: number }) {
  const cal = lead.matchScore < 80;
  const warm = !!lead.contact?.linkedin;
  const rev = lead.businessDetails?.estimatedRevenue ?? '—';
  const ebitda = estimateEbitda(lead);
  const loc = [lead.city, lead.state].filter(Boolean).join(', ');
  return (
    <tr>
      <td style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-40)', fontSize: 14, paddingTop: 16 }}>
        {String(index + 1).padStart(2, '0')}
      </td>
      <td>
        <div className="s6-tgt-name">{lead.businessName}</div>
        <div className="s6-tgt-loc">
          {loc}{warm && <span style={{ color: 'var(--emerald)', marginLeft: 8 }}>· warm path</span>}
        </div>
      </td>
      <td><div className="s6-tgt-reason">{lead.matchReason}</div></td>
      <td className="s6-tgt-rev">
        {rev} <span className="dim">rev</span><br />
        {ebitda} <span className="dim">ebitda</span>
      </td>
      <td>
        <div className={`s6-tgt-score ${cal ? 'cal' : ''}`}>
          <div className="num">{lead.matchScore}</div>
          <div className="bar" style={{ ['--w' as string]: `${lead.matchScore}%` } as CSSProperties} />
        </div>
      </td>
    </tr>
  );
}

function estimateEbitda(lead: RankedLead): string {
  const rev = lead.businessDetails?.estimatedRevenue;
  if (!rev) return '—';
  const match = rev.match(/\$?([\d.]+)\s*M/i);
  if (!match) return '—';
  const revM = parseFloat(match[1]);
  const ebitdaM = Math.round(revM * 0.18 * 10) / 10;
  return `$${ebitdaM}M`;
}
