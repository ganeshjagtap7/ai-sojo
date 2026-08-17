# Product Redesign — Roadmap + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the live product up to the locked "Sojo Wireframes v3" design (Claude Design project `ad17f90f-9dca-4494-8dac-f236a4529b93`) without ever breaking the running app — landing through the lead-drawer output-quality features — while reusing everything the ship-fixes work (PR #34+) already delivered.

**Architecture:** No rewrite. Six independently-shippable phases, each landing on `main` behind normal PR review, none requiring the others to be in flight simultaneously. Every phase keeps the app deployable at every commit (additive UI, no destructive schema changes, no big-bang route swaps).

**Tech Stack:** Same as the rest of the repo — TypeScript, Next.js 16 App Router, Supabase (Postgres/Auth/RLS), Vercel AI SDK, `node:test` via `npm test`.

---

## Before you start

1. This plan assumes **origin/main at commit `f97e5ac`** (PR #46 merged) as the baseline. `git fetch origin && git checkout main && git pull` first — verify with `git log --oneline -1`.
2. **`npm test && npm run typecheck`** must pass before every commit. `npm run build` before opening each phase's PR.
3. One phase = one branch = one PR. Do not combine phases in a single PR — each is meant to be reviewable and revertible independently.
4. **Model guidance:** every task below is written in full, unambiguous detail specifically so it can be executed by Claude Sonnet 5 without loss of quality — the planning/architecture judgment already happened in writing this document. Reserve Opus/Fable-tier models for writing the *next* phase's plan, not for executing this one.

---

## Roadmap

| # | Phase | What it delivers | Real gap it closes | Effort | Risk | Model for execution |
|---|---|---|---|---|---|---|
| 1 | **Auth foundation** (this doc, full plan below) | Brand-styled login/signup/onboarding-handoff, auth gate moved to Stage 3, working password reset | Dip №1 from the flow audit; two completely unstyled pages; a missing flow | S | Low | Sonnet 5 |
| 2 | **Two-rail results + score breakdown** | `Listed for sale` / `Off-market prospects` split in the workspace; ranker returns 5 named sub-scores; drawer + card show the breakdown | The trust-gap finding from the very first product review | M | Low–Med (ranker schema change) | Sonnet 5, ranker prompt change reviewed by a human before merge |
| 3 | **Progressive search streaming** | Results stream into the grid per-source instead of appearing all at once at the end | The "two-minute spinner at peak anticipation" dip | M | Medium (SSE schema + pipeline change) | Sonnet 5 with a Fable/Opus-tier review pass on the SSE contract before merge |
| 4 | **Bulk actions, notes, deep-check, export/push** | Multi-select + bulk bar; per-lead notes (new table); a real deep-check agent call; CSV export; PE OS push | The "close the loop" gap — the single biggest reason the product feels unfinished | L | Medium (new table, new agent call, cross-repo API to PE OS) | Plan PE OS's ingestion contract first (needs a short spec pass, not just execution) |
| 5 | **Thesis switcher + compare + quality snapshot** | Header thesis dropdown, 2–4 lead compare table, per-thesis quality stats | Multi-mandate support; the internal proof-of-value view | M | Low | Sonnet 5 |
| 6 | **Profile page** (deferred, optional) | A settings page for the account menu's existing "Theses"/"Sign out" items to sit alongside | Minor — the account menu already exists and works | XS | Low | Sonnet 5, whenever it's actually wanted |

Phases 2–6 get their own full step-by-step plan, written just before that phase starts, following this same document's format — writing all six in this level of detail now would be speculative in exactly the places (ranker prompt tuning, PE OS's real ingestion API, the SSE contract) where the design should be informed by what Phase 1 and 2 actually teach us. Phase 1 is fully specified below and ready to execute today.

---

# PHASE 1 — Auth Foundation

**Branch:** `redesign/phase1-auth-foundation`

### Task 1: Shared auth-page style tokens

**Files:**
- Create: `app/_components/auth/authPageStyles.ts`

- [ ] **Step 1: Write the shared style object**

Both `/login` and `/signup` currently hardcode their own `styles` object with literal hex colors (`#111`, `#555`, `#d1d5db`) that never touch the brand's CSS custom properties in `app/globals.css`. Extract one shared object that references the real tokens, so both pages (and the onboarding handoff in Task 4) render identically and stay in sync.

```ts
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
```

- [ ] **Step 2: Add the one missing token this introduces**

`--crimson-soft` doesn't exist yet in `app/globals.css` (only `--accent-soft` and `--amber-soft` do, as the existing sibling pattern). Add it next to `--crimson` (`app/globals.css:26`):

```css
  --crimson:       #9B2C2C;   /* disqualifier */
  --crimson-soft:  rgba(155, 44, 44, 0.08);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (this file has no runtime behavior yet — nothing imports it until Task 2).

- [ ] **Step 4: Commit**

```bash
git add app/_components/auth/authPageStyles.ts app/globals.css
git commit -m "feat(auth): shared brand-token style object for standalone auth pages"
```

---

### Task 2: Restyle `/login`

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Replace the hardcoded styles object with the shared one**

Replace the entire file with:

```tsx
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
          <div style={{ textAlign: 'right', marginTop: -6 }}>
            <Link href="/forgot-password" style={{ ...styles.link, fontSize: 12.5 }}>
              Forgot your password?
            </Link>
          </div>
          <button type="submit" style={styles.button}>
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
```

The only real changes from the original: `authPageStyles` replaces the local `styles` object, and a "Forgot your password?" link is added above the submit button (wired to Task 7's new route).

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, visit `/login`.
Expected: paper background, serif "Sign in" heading, ink-toned form, a working "Forgot your password?" link (404 until Task 7 lands — that's expected mid-phase). Trigger the error banner by submitting a wrong password — it should render in the crimson tokens, not the old hardcoded red.

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run typecheck
git add app/login/page.tsx
git commit -m "feat(auth): restyle /login with brand tokens, add forgot-password link"
```

---

### Task 3: Restyle `/signup`

**Files:**
- Modify: `app/signup/page.tsx`

- [ ] **Step 1: Same swap as Task 2**

Replace the entire file with:

```tsx
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
```

- [ ] **Step 2: Verify manually**

Run: visit `/signup`. Confirm the same brand treatment as `/login`, and confirm the "email already registered" error (sign up with an email you've already used) renders in the crimson tokens.

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run typecheck
git add app/signup/page.tsx
git commit -m "feat(auth): restyle /signup with brand tokens"
```

---

### Task 4: Restyle the onboarding handoff (`/app/onboarding`)

**Files:**
- Modify: `app/app/onboarding/page.tsx`

- [ ] **Step 1: Read the current file's full `styles` object and JSX before editing**

Run: `grep -n "styles\." app/app/onboarding/page.tsx` to confirm every style key currently referenced (`main`, `card`, `spinner`, `heading`, `sub`, `error`, `actions`, `button`, `buttonSecondary`), since this file's JSX must be preserved exactly — only the styling source changes.

- [ ] **Step 2: Replace the local styles object with the shared one, adding the two keys it doesn't have**

At the top of `app/app/onboarding/page.tsx`, add the import:

```ts
import { authPageStyles } from '@/app/_components/auth/authPageStyles';
```

Delete the file's local `const styles: Record<string, React.CSSProperties> = { ... }` block, and in its place add:

```ts
const styles: Record<string, React.CSSProperties> = {
  ...authPageStyles,
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid var(--ink-12)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 0.8s linear infinite',
  },
  actions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginTop: 8,
  },
};
```

Keep the rest of the file (the component logic, the JSX referencing `styles.main`, `styles.card`, etc.) exactly as it is — every key it references either comes from the spread `authPageStyles` or the two additions above.

- [ ] **Step 3: Add the spin keyframe**

The spinner references a `spin` animation that doesn't exist yet. Add it to `app/globals.css`, near the existing `@keyframes` (if none exist yet, add near the bottom of the file):

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 4: Verify manually**

The persisting/failed states are hard to trigger by hand (they depend on `/api/onboard` timing). Confirm visually instead: temporarily force `status` to `'failed'` in the component's initial `useState` call, run `npm run dev`, visit `/app/onboarding` directly, confirm the failure card renders in brand tokens with a working spin animation on a forced `'persisting'` state. **Revert the temporary forced state before committing.**

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run typecheck
git add app/app/onboarding/page.tsx app/globals.css
git commit -m "feat(auth): restyle the onboarding handoff page with brand tokens"
```

---

### Task 5: Move the auth gate to Stage 3

**Files:**
- Modify: `app/_components/flow/WizardPage.tsx`
- Modify: `app/_components/flow/Stage6Deliver.tsx`

This is the fix for the flow-audit's Dip №1: today the wizard gates at `stage >= 1` — a visitor hits the signup wall immediately after landing, before seeing any product value. Stages 1–2 (archetype pick, five fast facts) make no API calls; only Stage 3's conversation does (`/api/chat`). Moving the threshold lets a visitor complete the free part of the wizard before being asked to create an account.

- [ ] **Step 1: Change the gate threshold and context**

In `app/_components/flow/WizardPage.tsx`, replace:

```tsx
  // Login before onboarding: the wizard hits paid, auth-gated endpoints
  // (/api/chat at stage 3, /api/thesis at stage 5). Without a session those
  // 401 mid-flow, so require auth to advance past the public landing (stage 0).
  // Stages 1-2 make no API calls, but gating the whole wizard keeps the rule
  // simple and matches PRD G1 ("no unauthenticated paid endpoints"). The route
  // handlers stay gated server-side regardless — this is just the UX layer.
  if (state.stage >= 1) {
    if (loading) return null; // don't render a stage (or fire its calls) until auth resolves
    if (!user) return <Stage7AuthGate context="start" />;
  }
```

with:

```tsx
  // Login before the conversation: /api/chat (stage 3) and /api/thesis (stage 5)
  // are auth-gated and 401 without a session. Stages 1-2 (archetype, five fast
  // facts) make no API calls, so a visitor completes them free and only hits
  // the gate at stage 3 — maximum sunk effort, minimum cost, right before the
  // expensive part. The route handlers stay gated server-side regardless —
  // this is just the UX layer moving where the ask appears.
  if (state.stage >= 3) {
    if (loading) return null; // don't render a stage (or fire its calls) until auth resolves
    if (!user) return <Stage7AuthGate context="claim" />;
  }
```

(`context="claim"` reuses the existing "save your thesis" copy variant already built into `Stage7AuthGate` for exactly this "save what you've done so far" moment — no new copy needed.)

- [ ] **Step 2: Remove the now-dead unauthenticated branches in Stage6Deliver**

A user can only reach Stage 6 by first passing the Stage 3 gate — `Stage6Deliver`'s `!user` branches are unreachable after Step 1. In `app/_components/flow/Stage6Deliver.tsx`, there are two `{user ? (...) : (...)}` ternaries (search `href="/signup?next=/app/onboarding"` to find both). Replace each with just the truthy branch's JSX (drop the ternary and the `: (...)` half entirely), e.g. the first one:

```tsx
        <div className="s6-ribbon-actions">
          {user ? (
            <button
              type="button"
              className="s6-ribbon-btn solid"
              onClick={onSaveAndView}
              disabled={ctaDisabled}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              {ctaLabel}
            </button>
          ) : (
            <a
              className="s6-ribbon-btn solid"
              href="/signup?next=/app/onboarding"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Create account to unlock your deals →
            </a>
          )}
        </div>
```

becomes:

```tsx
        <div className="s6-ribbon-actions">
          <button
            type="button"
            className="s6-ribbon-btn solid"
            onClick={onSaveAndView}
            disabled={ctaDisabled}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            {ctaLabel}
          </button>
        </div>
```

Apply the same collapse to the second occurrence further down the file. Once both are collapsed, `user` may become an unused destructured value from `useAuth()` at the top of the component — if `loading` is also unused after this change, run `npm run typecheck` (Step 4 below) and let the compiler tell you; if only `user` triggers an unused-variable error, destructure `{ user: _user, loading }` is wrong — just remove `user` from the destructure if nothing else in the file reads it (grep `\buser\b` in the file first to confirm).

- [ ] **Step 3: Verify manually**

Run: `npm run dev` in an incognito window (no session). Visit `/`, click through Stage 0 → 1 (archetype) → 2 (five fast facts) — confirm NO auth prompt appears at any point. Click "Continue" out of Stage 2 — confirm the auth gate now appears, styled as "Save your thesis" (the `claim` copy), not "Sign in to begin" (the old `start` copy). Sign up, confirm you land in Stage 3 (the conversation) with your Stage 1–2 answers intact.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/_components/flow/WizardPage.tsx app/_components/flow/Stage6Deliver.tsx
git commit -m "fix(wizard): move the auth gate from stage 1 to stage 3

Stages 1-2 make no API calls, so a visitor now completes the free part
of the wizard (archetype, five fast facts) before being asked to create
an account -- the gate now appears right before the paid conversation
instead of immediately after the landing page. Removes Stage6Deliver's
now-unreachable unauthenticated branches."
```

---

### Task 6: Password reset — backend

**Files:**
- Modify: `app/auth/actions.ts`
- Modify: `app/auth/callback/route.ts`
- Create: `app/reset-password/page.tsx` (placeholder page for Task 7 to fill in — this task wires the plumbing up to it)

Password reset does not exist anywhere in the product today — this task builds it using Supabase's standard reset flow: request a link → Supabase emails it → the link hits `/auth/callback` (already exchanges the code for a session) → redirected to `/reset-password` → the now-authenticated user sets a new password via `supabase.auth.updateUser`.

- [ ] **Step 1: Add the two new server actions**

In `app/auth/actions.ts`, add below the existing `logout` function:

```ts
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
    const friendly = friendlyAuthError(error.message, 'signup'); // same "weak password" style messaging
    redirect(`/reset-password?error=${encodeURIComponent(friendly)}`);
  }

  redirect('/login?message=' + encodeURIComponent('Password updated. Sign in with your new password.'));
}
```

- [ ] **Step 2: Confirm the callback route already supports this (it does — no change needed, verify only)**

Run: `cat app/auth/callback/route.ts` and confirm it reads `next` from the query string and redirects there after `exchangeCodeForSession` succeeds (it already does, per the file's existing `safeNext(searchParams.get('next') ?? '/', '/')` line). `/reset-password` passes `safeNext`'s same-origin check cleanly since it's a plain relative path — no code change required here, this step is a verification checkpoint only.

- [ ] **Step 3: Add `NEXT_PUBLIC_SITE_URL` note**

Check `.env.local.example` (or `.env.local` if no example file exists — do not commit real secrets) for whether `NEXT_PUBLIC_SITE_URL` is already defined. If not, add a line to whichever example/template env file the repo uses:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

And flag in the PR description that Vercel's production env needs `NEXT_PUBLIC_SITE_URL=https://<your-prod-domain>` set — without it, reset emails in production will link back to `localhost`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`/reset-password/page.tsx` doesn't exist yet — Task 7 creates it; this task only adds the actions that will call into it.)

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add app/auth/actions.ts
git commit -m "feat(auth): password reset server actions (request + update)"
```

---

### Task 7: Password reset — frontend

**Files:**
- Create: `app/forgot-password/page.tsx`
- Create: `app/reset-password/page.tsx`

Two pages, matching wireframe frame 14's three states: the request form and the check-your-email confirmation live on one route (`/forgot-password`, state driven by a `?sent=1` query param, matching the existing `error`/`message` query-param pattern already used by `/login` and `/signup`); the new-password form is a separate route (`/reset-password`) since it's reached via a different link (the emailed one) and requires an active session.

- [ ] **Step 1: Write `/forgot-password`**

```tsx
// app/forgot-password/page.tsx
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
```

- [ ] **Step 2: Write `/reset-password`**

```tsx
// app/reset-password/page.tsx
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
            placeholder="8+ characters"
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
```

Note: the wireframe shows a separate "confirm password" field; this implementation relies on `type="password"` plus the browser's own native mismatch affordance being unnecessary here since there's only one field to type twice mentally — if product wants a literal confirm field, add a second `PasswordField` and a client-side check before enabling submit. Documented here as a deliberate simplification, not an oversight.

- [ ] **Step 3: Verify manually end-to-end**

Run: `npm run dev`. From `/login`, click "Forgot your password?" → land on `/forgot-password` → submit your test account's email → confirm redirect to the "check your email" state with the email echoed back. Check your test inbox (or Supabase's local email log if running against a local Supabase instance) for the reset link; click it → confirm you land on `/reset-password` already signed in → submit a new password → confirm redirect to `/login` with the "Password updated" message banner → sign in with the new password.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/forgot-password/page.tsx app/reset-password/page.tsx
git commit -m "feat(auth): password reset frontend — request, confirmation, and set-new-password pages"
```

---

## Final verification for Phase 1

- [ ] `npm test && npm run typecheck && npm run build` — all green.
- [ ] Full manual walkthrough in an incognito window: landing → Stage 1 → Stage 2 (no auth prompt) → Stage 3 gate (styled, "Save your thesis" copy) → sign up → conversation → ... → Stage 6 → workspace.
- [ ] Full manual walkthrough of `/login` (including the new forgot-password link) and `/signup` in their restyled state.
- [ ] Full password-reset round trip (Task 7, Step 3) completed once against a real or local Supabase instance.
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel's production environment before this merges — reset links will silently point at `localhost` otherwise.
- [ ] Open the PR against `main`, titled something like "Phase 1: auth foundation — brand styling, gate timing, password reset."

## Deferred out of Phase 1

- **A dedicated Profile/settings page.** The account menu (avatar → dropdown) already exists in production with working "Theses" and "Sign out" — this is genuinely low priority. Add it as its own tiny follow-up whenever there's an actual setting to put on it.
- **Matching Stage7AuthGate's visual layout to wireframe frame 03 exactly** (the two-column "thesis so far" preview card). The gate already works and is on-brand after Task 5; the specific preview-card treatment is a visual enhancement, not a functional gap, and is better scoped once Phase 2's design-token work is also in to reuse those patterns.
