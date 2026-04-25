import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sendMagicLink, signInWithGoogle } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error, message, next } = await searchParams;

  if (user) redirect(next ?? '/app');

  // Returning users skip the onboarding handoff and go straight to /app.
  const nextPath = next ?? '/app';

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Sign in</h1>
        <p style={styles.sub}>
          New here?{' '}
          <Link href="/signup" style={styles.link}>
            Create an account
          </Link>
        </p>

        {message && <p style={styles.info}>{message}</p>}
        {error && <p style={styles.error}>{error}</p>}

        <form action={signInWithGoogle} style={styles.form}>
          <input type="hidden" name="next" value={nextPath} />
          <input type="hidden" name="intent" value="login" />
          <button type="submit" style={styles.googleBtn}>
            Continue with Google
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <form action={sendMagicLink} style={styles.form}>
          <input type="hidden" name="next" value={nextPath} />
          <input type="hidden" name="intent" value="login" />
          <label style={styles.label}>
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              style={styles.input}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" style={styles.button}>
            Email me a sign-in link
          </button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', fontFamily: 'var(--font-inter)' },
  card: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '1rem' },
  heading: { fontSize: 24, fontWeight: 600, margin: 0 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  link: { textDecoration: 'underline', color: 'inherit' },
  info: { fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', margin: 0 },
  error: { fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 },
  input: { padding: '0.5rem 0.75rem', fontSize: 14, borderRadius: 6, border: '1px solid #d1d5db', fontFamily: 'inherit' },
  button: { padding: '0.625rem', fontSize: 14, fontWeight: 500, borderRadius: 6, background: '#111', color: '#fff', border: 'none', cursor: 'pointer' },
  googleBtn: { padding: '0.625rem', fontSize: 14, fontWeight: 500, borderRadius: 6, background: '#fff', color: '#111', border: '1px solid #d1d5db', cursor: 'pointer' },
  divider: { display: 'flex', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, background: '#e5e7eb' },
  dividerText: { fontSize: 12, color: '#6b7280' },
};
