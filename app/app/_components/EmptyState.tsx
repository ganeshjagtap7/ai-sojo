import Link from 'next/link';
import type { ReactNode } from 'react';

// A single, on-brand empty state shared by Saved / History / Theses so a new
// user never lands on a blank pane — each says what lives here and offers the
// one action that fills it. Server component (markup + Link only).
interface Props {
  eyebrow?: string;
  title: ReactNode;
  sub: string;
  cta?: { href: string; label: string };
}

export function EmptyState({ eyebrow, title, sub, cta }: Props) {
  return (
    <div className="empty-state">
      {eyebrow && <div className="empty-state-eye">{eyebrow}</div>}
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-sub">{sub}</p>
      {cta && (
        <Link href={cta.href} className="btn-primary" style={{ textDecoration: 'none' }}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}
