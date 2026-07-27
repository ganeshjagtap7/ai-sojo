'use client';

import { useEffect, useState, useCallback } from 'react';

export interface ToastItem {
  id: number;
  title: string;
  sub?: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((title: string, sub?: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), title, sub }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, dismiss }: { toast: ToastItem; dismiss: (id: number) => void }) {
  const { id } = toast;
  // Depend on the stable id + dismiss (a useCallback), NOT a fresh inline arrow.
  // An inline `() => dismiss(id)` changed identity every parent re-render, which
  // re-ran this effect and restarted the 3800ms timer — so a toast could never
  // auto-dismiss while the parent kept re-rendering (e.g. during a search).
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), 3800);
    return () => clearTimeout(timer);
  }, [id, dismiss]);

  return (
    <div className="toast" role="status">
      <div className="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </div>
      <div>
        <div className="toast-title">{toast.title}</div>
        {toast.sub && <div className="toast-sub">{toast.sub}</div>}
      </div>
    </div>
  );
}
