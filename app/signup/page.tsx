import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signup } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/');

  const { error } = await searchParams;

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
        {error && <p style={styles.error}>{error}</p>}
        <form action={signup} style={styles.form}>
          <label style={styles.label}>
            Email
            <input type="email" name="email" required autoComplete="email" style={styles.input} />
          </label>
          <label style={styles.label}>
            Password
            <input type="password" name="password" required minLength={6} autoComplete="new-password" style={styles.input} />
          </label>
          <button type="submit" style={styles.button}>Create account</button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', fontFamily: 'var(--font-inter)' },
  card: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  heading: { fontSize: 24, fontWeight: 600, margin: 0 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  link: { textDecoration: 'underline', color: 'inherit' },
  error: { fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 },
  input: { padding: '0.5rem 0.75rem', fontSize: 14, borderRadius: 6, border: '1px solid #d1d5db', fontFamily: 'inherit' },
  button: { padding: '0.625rem', fontSize: 14, fontWeight: 500, borderRadius: 6, background: '#111', color: '#fff', border: 'none', cursor: 'pointer' },
};
