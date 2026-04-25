import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/auth/actions';

// All /app/* routes share this layout. Auth is gated by proxy.ts, but we
// also re-check here so server components downstream can trust `user`.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app');

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <a href="/app" style={styles.logo}>
          <span style={{ fontWeight: 700 }}>S/AI</span>
          <span style={{ color: '#888' }}>·</span>
          <span>Sojo</span>
        </a>
        <div style={styles.userBox}>
          <span style={{ fontSize: 12, color: '#666' }}>{user.email}</span>
          <form action={logout}>
            <button type="submit" style={styles.signoutBtn}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#FAF7F0',
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
    color: '#0E0E0C',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: 52,
    borderBottom: '1px solid #e5e0d3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    background: '#fff',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none',
    color: 'inherit',
    fontSize: 14,
    letterSpacing: '0.02em',
  },
  userBox: { display: 'flex', alignItems: 'center', gap: 12 },
  signoutBtn: {
    fontSize: 12,
    padding: '4px 10px',
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
