/**
 * Maps a raw Supabase auth error message to calm, user-safe copy for the login
 * and signup screens. The routes previously surfaced `error.message` verbatim,
 * so users saw transport noise like "fetch failed" or terse SDK strings like
 * "Invalid login credentials".
 *
 * Note on "email not found": Supabase returns the SAME "Invalid login
 * credentials" for both a wrong password and an unknown email (deliberate
 * anti-enumeration). Login therefore can't truthfully say "email not found" —
 * we show one combined message that also nudges account creation.
 */
export type AuthContext = 'login' | 'signup';

export function friendlyAuthError(rawMessage: string, context: AuthContext): string {
  const m = (rawMessage ?? '').toLowerCase();

  // Network / transport failures (Supabase client couldn't reach the server).
  if (
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('econn')
  ) {
    return "We couldn't reach the server. Check your connection and try again.";
  }

  // Rate limiting — common to both flows.
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts — please wait a moment and try again.';
  }

  if (context === 'login') {
    if (m.includes('invalid login credentials') || m.includes('invalid credential')) {
      return 'Email or password is incorrect. New here? Create an account below.';
    }
    if (m.includes('email not confirmed')) {
      return 'Please confirm your email address before signing in.';
    }
    return "We couldn't sign you in. Please try again.";
  }

  // context === 'signup'
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already')) {
    return 'That email is already registered — try signing in instead.';
  }
  if (m.includes('password') && (m.includes('at least') || m.includes('should be') || m.includes('weak') || m.includes('6 char'))) {
    return 'Please choose a password with at least 6 characters.';
  }
  return "We couldn't create your account. Please try again.";
}
