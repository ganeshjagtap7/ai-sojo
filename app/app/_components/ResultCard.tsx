'use client';

import type { RankedLead } from '@/lib/types';
import { tierOf, subScoresFor, locLine, industryOf, barCls, type Tier } from '@/app/app/_lib/leadScoring';
import { SaveButton } from './SaveButton';

const TIER_COLOR: Record<Tier, string> = {
  a: '#16a34a',
  b: '#d97706',
  c: '#6b7280',
};

interface Props {
  lead: RankedLead;
  rank: number;
  searchId: string | null;
  initialSaved: boolean;
}

export function ResultCard({ lead, rank, searchId, initialSaved }: Props) {
  const tier = tierOf(lead.matchScore);
  const subs = subScoresFor(lead);
  const phone = lead.contact?.phone ?? lead.phone;
  const email = lead.contact?.email;
  const website = lead.contact?.website ?? lead.website;

  const copy = (text: string) => {
    if (typeof window === 'undefined' || !text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <article style={styles.card}>
      <div style={styles.headerRow}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={styles.rank}>#{String(rank).padStart(2, '0')}</span>
          <h3 style={styles.name}>{lead.businessName}</h3>
        </div>
        <div style={{ ...styles.scoreBox, color: TIER_COLOR[tier] }}>
          <div style={styles.scoreNum}>{lead.matchScore}</div>
          <div style={styles.scoreLabel}>match</div>
        </div>
      </div>

      <div style={styles.metaLine}>
        <span>{industryOf(lead)}</span>
        <span style={styles.dot}>·</span>
        <span>{locLine(lead) || '—'}</span>
        {lead.businessDetails?.estimatedRevenue && (
          <>
            <span style={styles.dot}>·</span>
            <span>{lead.businessDetails.estimatedRevenue} rev</span>
          </>
        )}
      </div>

      <p style={styles.reason}>{lead.matchReason}</p>

      <div style={styles.bars}>
        {(['revenue', 'location', 'industry', 'signal'] as const).map((k) => (
          <div key={k} style={styles.barRow}>
            <span style={styles.barLabel}>{k}</span>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${subs[k]}%`,
                  background: barCls(subs[k]) === 'h' ? '#16a34a' : barCls(subs[k]) === 'm' ? '#d97706' : '#9ca3af',
                }}
              />
            </div>
            <span style={styles.barValue}>{subs[k]}</span>
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        <SaveButton lead={lead} searchId={searchId} initialSaved={initialSaved} />
        {phone && (
          <button type="button" style={styles.actionBtn} onClick={() => copy(phone)} title={phone}>
            Copy phone
          </button>
        )}
        {email && (
          <button type="button" style={styles.actionBtn} onClick={() => copy(email)} title={email}>
            Copy email
          </button>
        )}
        {website && (
          <a href={website} target="_blank" rel="noreferrer" style={styles.actionLink}>
            Website ↗
          </a>
        )}
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e0d3',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rank: { fontFamily: 'var(--serif), serif', fontStyle: 'italic', color: '#9ca3af', fontSize: 14 },
  name: { fontSize: 17, fontWeight: 600, margin: 0, lineHeight: 1.3 },
  scoreBox: { textAlign: 'right' },
  scoreNum: { fontSize: 24, fontWeight: 700, lineHeight: 1 },
  scoreLabel: { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' },
  metaLine: { fontSize: 13, color: '#555', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  dot: { color: '#cbd5e1' },
  reason: {
    fontFamily: 'var(--serif), Georgia, serif',
    fontStyle: 'italic',
    fontSize: 14,
    color: '#374151',
    margin: '4px 0',
    lineHeight: 1.5,
  },
  bars: { display: 'flex', flexDirection: 'column', gap: 5 },
  barRow: { display: 'grid', gridTemplateColumns: '70px 1fr 28px', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' },
  barTrack: { height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s ease' },
  barValue: { fontSize: 11, color: '#9ca3af', textAlign: 'right' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  actionBtn: {
    fontSize: 12,
    padding: '4px 10px',
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
  },
  actionLink: {
    fontSize: 12,
    padding: '4px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    textDecoration: 'none',
    color: 'inherit',
  },
};
