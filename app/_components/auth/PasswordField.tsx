'use client';

import { useState } from 'react';

// Password input with a show/hide eye toggle, shared by the login and signup
// pages (server components render it fine). Replaces the old bare <input> whose
// bullet placeholder ("••••••••") made an EMPTY field look pre-filled.
export function PasswordField({
  name,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder,
  autoFocus,
  labelStyle,
  inputStyle,
}: {
  // Uncontrolled (form-action pages) pass `name`; controlled callers (the
  // in-wizard gate) pass `value` + `onChange`. Supporting both keeps the eye
  // toggle in one place instead of duplicating it per form.
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  placeholder?: string;
  autoFocus?: boolean;
  labelStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}) {
  const [show, setShow] = useState(false);

  return (
    <label style={labelStyle}>
      Password
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{ ...inputStyle, width: '100%', paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: '#6b7280',
          }}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
