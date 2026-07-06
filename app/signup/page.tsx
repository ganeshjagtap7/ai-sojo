import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signupWithPassword } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error, message, next } = await searchParams;

  if (user) redirect(next ?? '/app/onboarding');

  const nextPath = next ?? '/app/onboarding';

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Create account</h1>
        <p style={styles.sub}>
          Already have one?{' '}
          <Link href="/login" style={styles.link}>
            Sign in
          </Link>
        </p>

        {message && <p style={styles.info}>{message}</p>}
        {error && <p style={styles.error}>{error}</p>}

        <form action={signupWithPassword} style={styles.form}>
          <input type="hidden" name="next" value={nextPath} />
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
          <label style={styles.label}>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              style={styles.input}
              placeholder="At least 6 characters"
            />
          </label>
          <button type="submit" style={styles.button}>
            Create account
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
};
