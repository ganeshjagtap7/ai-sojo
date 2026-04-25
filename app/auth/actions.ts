'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

// Magic-link signup/login. Single action — Supabase creates the user on first
// click of the link if they don't exist yet. `next` is where the user lands
// after the auth/callback PKCE exchange.
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '/app/onboarding');
  const intent = String(formData.get('intent') ?? 'signup'); // 'signup' | 'login'

  if (!email) {
    redirect(`/${intent}?error=${encodeURIComponent('Email is required')}`);
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const emailRedirectTo = origin
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    redirect(`/${intent}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/${intent}?message=${encodeURIComponent('Check your email for the sign-in link.')}`);
}

// Google OAuth. Returns a URL the user must be redirected to; we issue the
// redirect server-side so the client doesn't need any extra wiring.
export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get('next') ?? '/app/onboarding');
  const intent = String(formData.get('intent') ?? 'signup');

  const supabase = await createClient();
  const origin = await getOrigin();
  const redirectTo = origin
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error || !data?.url) {
    redirect(`/${intent}?error=${encodeURIComponent(error?.message ?? 'Google sign-in failed')}`);
  }

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
