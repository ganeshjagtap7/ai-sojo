import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from './_components/AppHeader';
import './sojo.css';

// All /app/* routes share this layout. Auth is gated by proxy.ts, but we
// also re-check here so server components downstream can trust `user`.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app');

  // Saved-count badge for the header tab. RLS scopes to this user.
  const { count: savedCount } = await supabase
    .from('saved_leads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const initials = (user.email ?? 'U')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sojo">
      <div className="app">
        <AppHeader email={user.email ?? ''} initials={initials} savedCount={savedCount ?? 0} />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
