'use client';

import { useEffect } from 'react';
import type { RankedLead } from '@/lib/types';
import { subScoresFor, barCls, locLine, industryOf } from '@/app/app/_lib/leadScoring';

interface Props {
  lead: RankedLead | null;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
  isSaved?: boolean;
}

// Pretty label per source. Lets the user verify in the drawer which scraper
// pulled this lead — useful for sanity-checking that all 5 sources are firing.
const SOURCE_LABEL: Record<string, string> = {
  google_maps: 'Google Maps',
  web_search: 'Web search',
  bbb: 'BBB.org',
  yellowpages: 'YellowPages.com',
  manta: 'Manta.com',
  directory: 'Directory',
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LeadDrawer({ lead, open, onClose, onSave, isSaved }: Props) {
  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!lead) {
    return (
      <>
        <div className={`sojo-drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
        <aside className={`sojo-drawer ${open ? 'open' : ''}`} aria-hidden={!open} />
      </>
    );
  }

  const subs = subScoresFor(lead);
  const tierColor = lead.matchScore >= 85 ? '#3F6B4A' : lead.matchScore >= 70 ? '#7A5A2B' : '#6E6A5E';
  const phone = lead.contact?.phone ?? lead.phone ?? '—';
  const email = lead.contact?.email ?? '—';
  const website = lead.contact?.website ?? lead.website ?? '—';

  return (
    <>
      <div className={`sojo-drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sojo-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="header">
          <div className="title">
            <h3>{lead.businessName}</h3>
            <div className="sub">
              {locLine(lead) || '—'}
              {website !== '—' && (
                <>
                  {' · '}
                  <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {website}
                  </a>
                </>
              )}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="body">
          <div className="score-big">
            <div className="n" style={{ color: tierColor }}>
              {lead.matchScore}
              <span> / 100 match</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              {(['revenue', 'location', 'industry', 'signal'] as const).map((k) => (
                <div key={k}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-geist-mono), monospace',
                      fontSize: 10.5,
                      color: '#9B9687',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginBottom: 5,
                    }}
                  >
                    <span>{k}</span>
                    <span>{subs[k]}</span>
                  </div>
                  <div className="match-bar-t">
                    <div className={`match-bar-f ${barCls(subs[k])}`} style={{ width: `${subs[k]}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {lead.matchReason && <div className="why">{lead.matchReason}</div>}
          </div>

          <div>
            <h4>Contact</h4>
            <dl className="kv-grid">
              <dt>Phone</dt>
              <dd>{phone}</dd>
              <dt>Email</dt>
              <dd>{email}</dd>
              <dt>Website</dt>
              <dd>{website}</dd>
            </dl>
          </div>

          <div>
            <h4>Source</h4>
            <dl className="kv-grid">
              <dt>Scraped from</dt>
              <dd className="text">{SOURCE_LABEL[lead.source] ?? lead.source}</dd>
              {lead.sourceUrl && (
                <>
                  <dt>Listing</dt>
                  <dd>
                    <a href={lead.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {hostnameOf(lead.sourceUrl)}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div>
            <h4>Business</h4>
            <dl className="kv-grid">
              <dt>Industry</dt>
              <dd className="text">{industryOf(lead)}</dd>
              <dt>Revenue</dt>
              <dd>{lead.businessDetails?.estimatedRevenue ?? '—'}</dd>
              <dt>Years</dt>
              <dd>{lead.businessDetails?.yearsInBusiness ?? '—'}</dd>
              <dt>Employees</dt>
              <dd>{lead.businessDetails?.employeeCount ?? '—'}</dd>
              <dt>Rating</dt>
              <dd>
                {lead.businessDetails?.googleRating ?? '—'}
                {lead.businessDetails?.reviewCount ? `★ · ${lead.businessDetails.reviewCount}` : ''}
              </dd>
              <dt>BBB</dt>
              <dd>
                {lead.businessDetails?.bbbRating ?? '—'}
                {lead.businessDetails?.bbbAccredited ? ' · accredited' : ''}
              </dd>
            </dl>
          </div>
        </div>

        <div className="footer">
          {onSave && (
            <button
              type="button"
              className="btn-primary"
              onClick={onSave}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isSaved ? 'Remove from saved' : 'Save lead'}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
