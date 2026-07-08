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

// Actionable contact links (phone → call, email → compose, website → open).
// Copy-to-clipboard lives on the home cards; here the values are direct links.
// Same underline style as the "Listing" (yellowpages) link below for consistency.
const linkStyle: React.CSSProperties = {
  color: 'inherit', textDecoration: 'underline', overflowWrap: 'anywhere',
};

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

  // Business rows are built from the REAL scraped fields — only what this source
  // actually captured is shown; missing fields are simply omitted (never faked).
  const money = (n?: number | null) =>
    typeof n === 'number' && Number.isFinite(n) ? `$${n.toLocaleString('en-US')}` : null;
  const mult = (n?: number | null) => (typeof n === 'number' && Number.isFinite(n) ? `${n}×` : null);
  const bd = lead.businessDetails;
  const industry = industryOf(lead);
  // Source-specific extras live in rawData (e.g. EBITDA, reason for sale). Read
  // known keys defensively — shown only when the source actually captured them.
  const raw = lead.rawData && typeof lead.rawData === 'object' ? (lead.rawData as Record<string, unknown>) : {};
  const rawStr = (k: string) => {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const bizRows: [string, string][] = [];
  const add = (label: string, val: string | null | undefined) => {
    if (val) bizRows.push([label, val]);
  };
  add('Asking price', money(lead.askingPrice));
  // Real revenue if the listing states it; otherwise the AI estimate, clearly labeled.
  add('Revenue', money(lead.annualRevenue) ?? (bd?.estimatedRevenue ? `${bd.estimatedRevenue} · est.` : null));
  add('Cash flow / SDE', money(lead.annualProfit));
  add('EBITDA', rawStr('ebitda'));
  // Profit margin often arrives as a bare number (e.g. 30) — tag it % then.
  const pm = rawStr('profitMargin');
  add('Profit margin', pm ? (/^\d+(\.\d+)?$/.test(pm) ? `${pm}%` : pm) : null);
  add('MRR', money(lead.mrr));
  add('Revenue multiple', mult(lead.revenueMultiple));
  add('Profit multiple', mult(lead.profitMultiple));
  // Ownership / listing context — shown only when the source captured it.
  add('For sale', lead.forSale === true ? 'Yes' : lead.forSale === false ? 'No' : null);
  add('Founder', lead.founderName || rawStr('founderName') || rawStr('xFounderName'));
  add('Founded', lead.foundedDate || rawStr('founded') || rawStr('yearEstablished') || rawStr('yearFounded'));
  add('Industry', industry || null);
  add('Years', bd?.yearsInBusiness != null ? String(bd.yearsInBusiness) : null);
  add('Employees', bd?.employeeCount != null ? String(bd.employeeCount) : null);
  add(
    'Rating',
    bd?.googleRating != null ? `${bd.googleRating}★${bd.reviewCount ? ` · ${bd.reviewCount}` : ''}` : null,
  );
  add('BBB', bd?.bbbRating ? `${bd.bbbRating}${bd.bbbAccredited ? ' · accredited' : ''}` : null);
  // Seller pitch, last row. Truncated so a long blurb doesn't blow up the grid.
  const descRaw = rawStr('description') || rawStr('sellerMessage') || rawStr('subtitle');
  add('Description', descRaw ? (descRaw.length > 220 ? `${descRaw.slice(0, 217).trimEnd()}…` : descRaw) : null);

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 14px' }}>
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
              <dd>
                {phone !== '—' ? (
                  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} style={linkStyle}>{phone}</a>
                ) : '—'}
              </dd>
              <dt>Email</dt>
              <dd>
                {email !== '—' ? (
                  <a href={`mailto:${email}`} style={linkStyle}>{email}</a>
                ) : '—'}
              </dd>
              <dt>Website</dt>
              <dd>
                {website !== '—' ? (
                  <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer" style={linkStyle}>
                    {website}
                  </a>
                ) : '—'}
              </dd>
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
            {bizRows.length > 0 ? (
              <dl className="kv-grid">
                {bizRows.map(([label, val]) => (
                  <div key={label} style={{ display: 'contents' }}>
                    <dt>{label}</dt>
                    <dd className={label === 'Industry' ? 'text' : undefined}>{val}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                No further details listed for this business.
              </p>
            )}
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
