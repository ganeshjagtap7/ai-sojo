'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';

interface Props {
  email: string;
  initials: string;
  savedCount: number;
}

export function AppHeader({ email, initials, savedCount }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (target: string) =>
    target === '/app' ? pathname === '/app' : pathname.startsWith(target);

  // Close the profile menu on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
        <div className="profile" ref={menuRef}>
          <button
            type="button"
            className="avatar"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Account menu"
            title={email}
            onClick={() => setOpen((o) => !o)}
          >
            {initials}
          </button>

          {open && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-head">
                <div className="profile-menu-label">Signed in as</div>
                <div className="profile-menu-email" title={email}>{email}</div>
              </div>
              <div className="profile-menu-sep" />
              <Link href="/app/theses" role="menuitem" className="profile-menu-item" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Theses
              </Link>
              <div className="profile-menu-sep" />
              <form action={logout}>
                <button type="submit" role="menuitem" className="profile-menu-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
