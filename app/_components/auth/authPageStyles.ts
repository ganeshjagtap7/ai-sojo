// app/_components/auth/authPageStyles.ts
//
// Shared style object for the standalone auth pages (/login, /signup,
// /app/onboarding). These are server components that render inline styles,
// but CSS custom properties defined in :root (app/globals.css) are visible
// to inline styles too — so referencing var(--ink) etc. here keeps these
// pages on the same brand tokens as the rest of the marketing/wizard system
// instead of the hardcoded literals they shipped with.
import type { CSSProperties } from 'react';

export const authPageStyles: Record<string, CSSProperties> = {
  main: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '1rem',
    background: 'var(--paper)',
    fontFamily: 'var(--sans)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  heading: {
    fontFamily: 'var(--serif)',
    fontSize: 28,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    color: 'var(--ink)',
    margin: 0,
  },
  sub: {
    fontSize: 14,
    color: 'var(--ink-70)',
    margin: 0,
  },
  link: {
    textDecoration: 'underline',
    color: 'var(--accent)',
  },
  info: {
    fontSize: 13,
    padding: 12,
    borderRadius: 4,
    border: '1px solid var(--accent)',
    background: 'var(--accent-soft)',
    color: 'var(--ink)',
    margin: 0,
  },
  error: {
    fontSize: 13,
    padding: 12,
    borderRadius: 4,
    border: '1px solid var(--crimson)',
    background: 'var(--crimson-soft)',
    color: 'var(--crimson)',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink)',
  },
  input: {
    padding: '0.6rem 0.75rem',
    fontSize: 14,
    borderRadius: 4,
    border: '1px solid var(--ink-20)',
    fontFamily: 'var(--sans)',
    background: '#fff',
    color: 'var(--ink)',
  },
  button: {
    padding: '0.7rem',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 4,
    background: 'var(--ink)',
    color: 'var(--paper)',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--sans)',
  },
  buttonSecondary: {
    padding: '0.7rem',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--ink-20)',
    cursor: 'pointer',
    fontFamily: 'var(--sans)',
  },
  mono: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-40)',
  },
};
