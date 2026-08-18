import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loginWithPassword } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { PasswordField } from '@/app/_components/auth/PasswordField';
import { authPageStyles as styles } from '@/app/_components/auth/authPageStyles';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error, message, next } = await searchParams;

  const safeDest = safeNext(next ?? '/app', '/app');
  if (user) redirect(safeDest);

  // Returning users skip the onboarding handoff and go straight to /app.
  const nextPath = safeDest;

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

        <form action={loginWithPassword} style={styles.form}>
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
            autoComplete="current-password"
            placeholder="Enter your password"
            labelStyle={styles.label}
            inputStyle={styles.input}
          />
          {process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === 'true' && (
            <div style={{ textAlign: 'right', marginTop: -6 }}>
              <Link href="/forgot-password" style={{ ...styles.link, fontSize: 12.5 }}>
                Forgot your password?
              </Link>
            </div>
          )}
          <button type="submit" style={styles.button}>
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
