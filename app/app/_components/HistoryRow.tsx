'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface HistoryRowProps {
  searchId: string;
  thesisId: string;
  needsSwitch: boolean; // the search belongs to a thesis that isn't active
  label: string;
  status: string;
  statusColor: string;
  agoText: string;
  leadCount: number;
}

export function HistoryRow({
  searchId,
  thesisId,
  needsSwitch,
  label,
  status,
  statusColor,
  agoText,
  leadCount,
}: HistoryRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // A search can only be viewed when its own thesis is active. If this
      // search belongs to a different thesis, activate that thesis first, then
      // open it — instead of dumping the user on the Theses page to guess which
      // one to switch to.
      if (needsSwitch) {
        const res = await fetch('/api/app/theses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thesisId }),
        });
        if (!res.ok) throw new Error('activate failed');
      }
      router.push(`/app?search=${searchId}`);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="history-row"
      style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: busy ? 'wait' : 'pointer' }}
    >
      <div>
        <div style={{ fontSize: 15, marginBottom: 2 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--faint)', letterSpacing: '0.03em' }}>
          <span style={{ color: statusColor }}>● {status}</span> · {agoText}
          {needsSwitch ? ' · different thesis' : ''}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-instrument), serif', fontSize: 22, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {leadCount}
      </div>
      <div className="h-leads-label" style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 10.5, color: 'var(--faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        leads
      </div>
      <span className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
        {failed ? 'Try again' : busy ? 'Opening…' : 'Open'}
      </span>
    </button>
  );
}
