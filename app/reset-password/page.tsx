import { redirect } from 'next/navigation';
import { updatePassword } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import { PasswordField } from '@/app/_components/auth/PasswordField';
import { authPageStyles as styles } from '@/app/_components/auth/authPageStyles';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // No session means either an expired/invalid reset link or a direct visit
  // with nothing to reset — send them back to request a fresh link rather
  // than showing a form that will just fail on submit.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/forgot-password?error=' + encodeURIComponent('This link has expired or is invalid. Request a new one.'));
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Set a new password</h1>

        {error && <p style={styles.error}>{error}</p>}

        <form action={updatePassword} style={styles.form}>
          <PasswordField
            name="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="At least 6 characters"
            labelStyle={styles.label}
            inputStyle={styles.input}
          />
          <button type="submit" style={styles.button}>
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}
