'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Only allow relative redirects (guard against open-redirect via ?next=).
function safeNext(raw: string, fallback: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}

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
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

// Email + password sign-up. Email confirmation is disabled in the Supabase
// project, so signUp returns an active session immediately — no email step.
export async function signupWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? '/app/onboarding'), '/app/onboarding');

  if (!email || !password) {
    redirect(`/signup?error=${encodeURIComponent('Email and password are required')}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
