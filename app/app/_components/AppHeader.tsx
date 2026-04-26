'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/auth/actions';

interface Props {
  email: string;
  initials: string;
  savedCount: number;
}

export function AppHeader({ email, initials, savedCount }: Props) {
  const pathname = usePathname();
  const isActive = (target: string) =>
    target === '/app' ? pathname === '/app' : pathname.startsWith(target);

  return (
    <header className="header">
      <Link href="/app" className="brand" aria-label="Sojo">
        <div className="brand-mark">s</div>
        <div className="brand-name">Sojo</div>
      </Link>

      <nav className="header-nav">
        <Link href="/app" className={isActive('/app') && pathname === '/app' ? 'active' : ''}>
          Search
        </Link>
        <Link href="/app/saved" className={isActive('/app/saved') ? 'active' : ''}>
          Saved {savedCount > 0 ? `· ${savedCount}` : ''}
        </Link>
        <Link href="/app/history" className={isActive('/app/history') ? 'active' : ''}>
          History
        </Link>
      </nav>

      <div className="header-actions">
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--faint)' }} title={email}>
          {email}
        </span>
        <form action={logout}>
          <button type="submit" className="icon-btn" title="Sign out" aria-label="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
        <div className="avatar" aria-hidden>{initials}</div>
      </div>
    </header>
  );
}
