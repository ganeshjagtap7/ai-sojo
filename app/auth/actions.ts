'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { friendlyAuthError } from '@/lib/errors/authError';

// Email + password sign-in. Consistent with the wizard's auth gate; magic links
// were dropped so there's a single auth method across the app.
export async function loginWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? '/app'), '/app');

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent('Email and password are required')}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const friendly = friendlyAuthError(error.message, 'login');
    redirect(`/login?error=${encodeURIComponent(friendly)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

// Email + password sign-up. Email confirmation is disabled in the Supabase
// project, so signUp returns an active session immediately — no email step.
export async function signupWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  // A direct signup (from the login page's "Create an account") is a NEW user
  // with no thesis — send them into the onboarding wizard, not the thesis-save
  // handoff (/app/onboarding). Flows that DO have a thesis to persist (Stage 6's
  // "Create account to unlock") pass next=/app/onboarding explicitly.
  const next = safeNext(String(formData.get('next') ?? '/'), '/');

  if (!email || !password) {
    redirect(`/signup?error=${encodeURIComponent('Email and password are required')}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const friendly = friendlyAuthError(error.message, 'signup');
    redirect(`/signup?error=${encodeURIComponent(friendly)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

// Request a password-reset email. Always redirects to the same "check your
// email" message regardless of whether the address has an account — Supabase
// itself doesn't disclose this (same anti-enumeration principle already
// documented in lib/errors/authError.ts for login), so neither do we.
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent('Enter your email address')}`);
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });
  // Deliberately ignore the error/success distinction from Supabase here —
  // same reasoning as above. A real send failure (misconfigured SMTP) is a
  // config problem to catch in ops monitoring, not something to surface to
  // the requester.

  redirect(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
}

// Set a new password. Only reachable with an active session -- the user
// arrives here via the emailed reset link, which /auth/callback already
// exchanged for a session before redirecting to /reset-password.
export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');

  if (!password || password.length < 6) {
    redirect(`/reset-password?error=${encodeURIComponent('Password must be at least 6 characters')}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Expired/invalid link, or a direct visit with no session.
    redirect(`/forgot-password?error=${encodeURIComponent('This link has expired or is invalid. Request a new one.')}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const friendly = friendlyAuthError(error.message, 'reset');
    redirect(`/reset-password?error=${encodeURIComponent(friendly)}`);
  }

  redirect('/login?message=' + encodeURIComponent('Password updated. Sign in with your new password.'));
}
