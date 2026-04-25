'use client';

import { useState, useTransition } from 'react';
import type { RankedLead } from '@/lib/types';

interface Props {
  lead: RankedLead;
  searchId: string | null;
  initialSaved: boolean;
}

export function SaveButton({ lead, searchId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (!saved) {
          const res = await fetch('/api/app/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead, searchId }),
          });
          if (!res.ok) throw new Error('Save failed');
          setSaved(true);
        } else {
          const res = await fetch(`/api/app/saved?leadId=${encodeURIComponent(lead.id)}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Unsave failed');
          setSaved(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          fontSize: 12,
          padding: '4px 10px',
          border: '1px solid #d1d5db',
          background: saved ? '#0E0E0C' : '#fff',
          color: saved ? '#fff' : '#0E0E0C',
          borderRadius: 4,
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.7 : 1,
        }}
      >
        {saved ? '✓ Saved' : 'Save'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#991b1b' }}>{error}</span>}
    </>
  );
}
