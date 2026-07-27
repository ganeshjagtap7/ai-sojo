'use client';

import type { RankedLead } from '@/lib/types';
import { tierOf, subScoresFor, locLine, industryOf, barCls } from '@/app/app/_lib/leadScoring';

// Short source badge — small uppercase tag on each card so the user can see
// the scraper mix at a glance without opening every drawer.
const SOURCE_BADGE: Record<string, string> = {
  google_maps: 'maps',
  web_search: 'web',
  bbb: 'bbb',
  yellowpages: 'yp',
  manta: 'manta',
  directory: 'dir',
};

interface Props {
  lead: RankedLead;
  rank: number;
  searchId: string | null;
  initialSaved: boolean;
  onOpen: (lead: RankedLead) => void;
  onSaveToggle: (lead: RankedLead, nextSaved: boolean) => Promise<boolean>;
  onDismiss?: (leadId: string) => void;
  toast: (title: string, sub?: string) => void;
  showReason?: boolean;
}

export function ResultCard({
  lead,
  rank,
  searchId: _searchId,
  initialSaved,
  onOpen,
  onSaveToggle,
  onDismiss,
  toast,
  showReason = true,
}: Props) {
  const tier = tierOf(lead.matchScore);
  const subs = subScoresFor(lead);
  const phone = lead.contact?.phone ?? lead.phone;
  const email = lead.contact?.email;
  const website = lead.contact?.website ?? lead.website;

  const copy = (val: string, label: string) => {
    if (typeof window === 'undefined' || !val) return;
    navigator.clipboard?.writeText(val).catch(() => {});
    toast('Copied', label);
  };

  const onSaveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await onSaveToggle(lead, !initialSaved);
    if (ok) {
      toast(initialSaved ? 'Removed from saved' : 'Saved', lead.businessName);
    } else {
      toast(initialSaved ? "Couldn't remove" : "Couldn't save", 'Please try again');
    }
  };

  return (
    <article
      className="lead clickable fadeup"
      onClick={() => onOpen(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(lead);
        }
      }}
    >
      <div className="lead-rank">{String(rank).padStart(2, '0')}</div>

      <div className="lead-main">
        <div className="lead-head">
          <div className="lead-name">{lead.businessName}</div>
          {locLine(lead) && (
            <span className="lead-loc">
              {lead.city}
              {lead.state && (
                <>
                  <span className="sep">·</span>
                  {lead.state}
                </>
              )}
            </span>
          )}
          <span className="lead-industry">{industryOf(lead)}</span>
          <span
            className="lead-industry"
            style={{
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--faint)',
            }}
            title="Source"
          >
            {SOURCE_BADGE[lead.source] ?? lead.source}
          </span>
        </div>

        <div className="lead-contact">
          {phone && (
            <button
              type="button"
              className="contact-field"
              onClick={(e) => {
                e.stopPropagation();
                copy(phone, phone);
              }}
              title={`Copy ${phone}`}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {phone}
            </button>
          )}
          {email && (
            <button
              type="button"
              className="contact-field"
              onClick={(e) => {
                e.stopPropagation();
                copy(email, email);
              }}
              title={`Copy ${email}`}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="m22 6-10 7L2 6" />
              </svg>
              {email}
            </button>
          )}
        </div>

        {showReason && lead.matchReason && <p className="lead-reason">{lead.matchReason}</p>}
      </div>

      <div className="match-col">
        <div className="match-top">
          <div className={`match-score ${tier}`}>{lead.matchScore}</div>
          <div className="match-label">/ 100 · match</div>
        </div>
        <div className="match-bars">
          {(['revenue', 'location', 'industry', 'signal'] as const).map((k) => (
            <div className="match-bar" key={k}>
              <div className="match-bar-l">{k}</div>
              <div className="match-bar-t">
                <div
                  className={`match-bar-f ${barCls(subs[k])}`}
                  style={{ width: `${subs[k]}%` }}
                />
              </div>
              <div className="match-bar-v">{subs[k]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="actions-col">
        <div className="stat-row">
          <span>Rev</span>
          <span className="val">{lead.businessDetails?.estimatedRevenue ?? '—'}</span>
        </div>
        <div className="stat-row">
          <span>Yrs</span>
          <span className="val">{lead.businessDetails?.yearsInBusiness ?? '—'}</span>
        </div>
        <div className="stat-row">
          <span>★</span>
          <span className="val">
            {lead.businessDetails?.googleRating ?? '—'}
            {lead.businessDetails?.reviewCount ? ` · ${lead.businessDetails.reviewCount}` : ''}
          </span>
        </div>
        <div className="lead-actions">
          <button
            type="button"
            className={`act-btn primary ${initialSaved ? 'on' : ''}`}
            onClick={onSaveClick}
            title={initialSaved ? 'Remove from saved' : 'Save lead'}
          >
            <svg viewBox="0 0 24 24" fill={initialSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {initialSaved ? 'Saved' : 'Save'}
          </button>
          {website && (
            <a
              href={website.startsWith('http') ? website : `https://${website}`}
              target="_blank"
              rel="noreferrer"
              className="act-btn"
              title="Open website"
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          )}
          {onDismiss && (
            <button
              type="button"
              className="act-btn danger"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(lead.id);
              }}
              title="Dismiss"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
