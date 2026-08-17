import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signupWithPassword } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { PasswordField } from '@/app/_components/auth/PasswordField';
import { authPageStyles as styles } from '@/app/_components/auth/authPageStyles';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error, message, next } = await searchParams;

  // New users land in onboarding by default; the thesis-save handoff is only
  // used when a flow passes next=/app/onboarding explicitly (Stage 6).
  const safeDest = safeNext(next ?? '/', '/');
  if (user) redirect(safeDest);

  const nextPath = safeDest;

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
          <PasswordField
            name="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="At least 6 characters"
            labelStyle={styles.label}
            inputStyle={styles.input}
          />
          <button type="submit" style={styles.button}>
            Create account
          </button>
        </form>
      </div>
    </main>
  );
}
