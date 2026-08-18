import Link from 'next/link';
import { requestPasswordReset } from '@/app/auth/actions';
import { authPageStyles as styles } from '@/app/_components/auth/authPageStyles';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; email?: string }>;
}) {
  const { error, sent, email } = await searchParams;

  if (sent === '1') {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.mono}>Check your email</div>
          <h1 style={styles.heading}>Check your email</h1>
          <p style={styles.sub}>
            We sent a reset link to <strong>{email ?? 'your email'}</strong>. It expires in 1 hour.
          </p>
          <Link href="/login" style={styles.link}>
            ← Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.mono}>Reset password</div>
        <h1 style={styles.heading}>Reset your password</h1>
        <p style={styles.sub}>
          Enter the email on your account and we&apos;ll send you a reset link.
        </p>

        {error && <p style={styles.error}>{error}</p>}

        <form action={requestPasswordReset} style={styles.form}>
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
            Send reset link
          </button>
        </form>
        <Link href="/login" style={styles.link}>
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
