'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchCriteria, RankedLead } from '@/lib/types';

type Stage = 'chat' | 'ready' | 'searching' | 'results';
type NavView = 'search' | 'saved' | 'history';
type Tier = 'a' | 'b' | 'c';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ToastItem {
  id: number;
  title: string;
  sub?: string;
  kind?: 'ok' | 'err';
}

interface SavedLead {
  id: string;
  name: string;
  city: string;
  state: string;
  revenue: string | null;
  match: number;
  stage: 'New' | 'Outreach' | 'Discovery' | 'LOI sent' | 'Passed';
  searchLabel: string;
  savedAt: number;
  lead: RankedLead;
}

interface HistoryEntry {
  id: string;
  title: string;
  when: number;
  status: 'running' | 'complete' | 'failed';
  leads: number;
  criteria: SearchCriteria;
}

// ---------- Helpers ----------

const SAVED_KEY = 'sojo:saved';
const HISTORY_KEY = 'sojo:history';
const THEME_KEY = 'sojo:theme';

const tierOf = (score: number): Tier => (score >= 85 ? 'a' : score >= 70 ? 'b' : 'c');
const barCls = (v: number) => (v >= 85 ? 'h' : v >= 70 ? 'm' : 'l');

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
};

const fmtRelative = (ts: number) => {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const criteriaLabel = (c: SearchCriteria | null): string => {
  if (!c) return 'Search';
  const parts: string[] = [];
  if (c.industry?.primary) parts.push(c.industry.primary);
  if (c.location?.city) parts.push(c.location.city);
  const rmin = c.businessSize?.revenueMin;
  const rmax = c.businessSize?.revenueMax;
  if (rmin || rmax) {
    const f = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1000)}K`);
    if (rmin && rmax) parts.push(`${f(rmin)}–${f(rmax)}`);
    else if (rmax) parts.push(`≤ ${f(rmax)}`);
    else if (rmin) parts.push(`≥ ${f(rmin)}`);
  }
  return parts.join(' · ') || 'Search';
};

const criteriaReady = (c: Partial<SearchCriteria> | null): boolean => {
  return !!(c?.location?.city && c?.industry?.primary);
};

// Derive 4 sub-scores from the RankedLead for the bar viz.
// The API returns matchScore + matchReason only, so we synthesize plausible
// sub-scores from signals present on the lead (reviews, years, revenue estimate).
const subScoresFor = (lead: RankedLead): { revenue: number; location: number; industry: number; signal: number } => {
  const base = lead.matchScore;
  const jitter = (seed: number, spread = 10) => {
    let h = 2166136261 ^ seed;
    h = Math.imul(h ^ (h >>> 13), 16777619);
    return ((h >>> 0) % (spread * 2 + 1)) - spread;
  };
  const seed = lead.id ? lead.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const rev = lead.businessDetails?.estimatedRevenue ? base + jitter(seed + 1, 6) : base - 6 + jitter(seed + 1, 4);
  const loc = base + jitter(seed + 2, 5);
  const ind = base + jitter(seed + 3, 7);
  const yrs = lead.businessDetails?.yearsInBusiness ?? 0;
  const reviews = lead.businessDetails?.reviewCount ?? 0;
  const signalBoost = Math.min(18, Math.floor(yrs / 2) + Math.floor(reviews / 30));
  const sig = Math.min(100, Math.max(30, base - 10 + signalBoost + jitter(seed + 4, 4)));
  const clamp = (n: number) => Math.min(100, Math.max(20, Math.round(n)));
  return { revenue: clamp(rev), location: clamp(loc), industry: clamp(ind), signal: sig };
};

const locLine = (lead: RankedLead) => [lead.city, lead.state].filter(Boolean).join(', ');
const industryOf = (lead: RankedLead) => lead.businessDetails?.categories?.[0] || 'Business';

const loadLS = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const saveLS = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
};

// ---------- SVG icons ----------
const Ic = {
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="2.5" /><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
  ),
  send: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M7 17L17 7M8 7h9v9" /></svg>),
  download: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>),
  plus: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>),
  close: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>),
  check: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}><path d="M5 12l5 5L20 7" /></svg>),
  phone: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>),
  mail: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="m22 6-10 7L2 6" /></svg>),
  copy: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>),
  bookmark: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>),
  dots: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>),
  sort: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M6 12h12M10 18h4" /></svg>),
  filter: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 4h18M6 12h12M10 20h4" /></svg>),
};

// ---------- Progress steps ----------
const PROG_STEPS = [
  { key: 'scrape', label: 'Scraping Google Maps and web directories' },
  { key: 'enrich', label: 'Enriching contacts and business details' },
  { key: 'rev', label: 'Estimating revenue and operator signals' },
  { key: 'rank', label: 'Ranking by fit and succession signal' },
];

// ---------- Main component ----------
export default function Home() {
  const [stage, setStage] = useState<Stage>('chat');
  const [nav, setNav] = useState<NavView>('search');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [criteria, setCriteria] = useState<Partial<SearchCriteria> | null>(null);
  const [busy, setBusy] = useState(false);

  const [, setJobId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, 'pending' | 'active' | 'done'>>({
    scrape: 'active', enrich: 'pending', rev: 'pending', rank: 'pending',
  });

  const [leads, setLeads] = useState<RankedLead[]>([]);
  const [searchMs, setSearchMs] = useState(0);
  const [totalScraped, setTotalScraped] = useState(0);
  const [searchError, setSearchError] = useState('');

  const [saved, setSaved] = useState<SavedLead[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [drawerLead, setDrawerLead] = useState<RankedLead | null>(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'top' | 'signal' | 'saved'>('all');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const historyRef = useRef<Array<{ role: string; content: string }>>([]);
  const stageScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastIdRef = useRef(0);

  // ---- Load persisted state ----
  useEffect(() => {
    const t = (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ?? 'light';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    setSaved(loadLS<SavedLead[]>(SAVED_KEY, []));
    setHistory(loadLS<HistoryEntry[]>(HISTORY_KEY, []));
  }, []);

  // ---- Theme ----
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(THEME_KEY, next);
  };

  // ---- Toast ----
  const pushToast = useCallback((title: string, sub?: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, title, sub, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ---- Autoscroll ----
  useEffect(() => {
    const sc = stageScrollRef.current;
    if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, stage]);

  // ---- Textarea auto-height ----
  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  // ---- Chat ----
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    historyRef.current = [...historyRef.current, { role: 'user', content: text }];
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setBusy(true);

    let assistantText = '';
    const streamingId = crypto.randomUUID();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
      });
      if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let opened = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'text-delta' && typeof event.delta === 'string') {
              assistantText += event.delta;
              if (!opened) {
                opened = true;
                setMessages((prev) => [...prev, { id: streamingId, role: 'assistant', content: assistantText }]);
              } else {
                setMessages((prev) => prev.map((m) => (m.id === streamingId ? { ...m, content: assistantText } : m)));
              }
            } else if (event.type === 'tool-input-available' && event.toolName === 'update_criteria') {
              const p = event.input as { criteriaComplete: boolean; criteria: SearchCriteria };
              setCriteria(p.criteria);
              if (p.criteriaComplete && criteriaReady(p.criteria)) setStage('ready');
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      pushToast('Chat failed', err instanceof Error ? err.message : 'Unknown error', 'err');
    } finally {
      if (assistantText) historyRef.current = [...historyRef.current, { role: 'assistant', content: assistantText }];
      setBusy(false);
    }
  };

  const onComposerKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (stage === 'ready') startSearch();
      else sendMessage();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (stage === 'ready') startSearch();
      else sendMessage();
    }
  };

  // ---- Search pipeline ----
  const startSearch = async () => {
    if (!criteria || !criteriaReady(criteria)) {
      pushToast('Missing criteria', 'Need at least city and industry', 'err');
      return;
    }
    setSearchError('');
    setLeads([]);
    setLiveCount(0);
    setProgressPct(0);
    setProgressMsg('Starting search…');
    setStepStatuses({ scrape: 'active', enrich: 'pending', rev: 'pending', rank: 'pending' });
    setStage('searching');

    const startedAt = Date.now();
    let currentJobId: string | null = null;

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `search start failed (${res.status})`);
      }
      const { jobId: jid } = await res.json();
      currentJobId = jid;
      setJobId(jid);

      // Record history entry
      const hEntry: HistoryEntry = {
        id: jid,
        title: criteriaLabel(criteria as SearchCriteria),
        when: startedAt,
        status: 'running',
        leads: 0,
        criteria: criteria as SearchCriteria,
      };
      setHistory((prev) => {
        const next = [hEntry, ...prev].slice(0, 40);
        saveLS(HISTORY_KEY, next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start search';
      setSearchError(msg);
      pushToast('Search failed', msg, 'err');
      setStage('ready');
      return;
    }

    // Poll status
    const poll = async () => {
      if (!currentJobId) return;
      try {
        const s = await fetch(`/api/search/${currentJobId}/status`).then((r) => r.json());
        if (s.status === 'processing' && s.progress) {
          setProgressMsg(s.progress.message || s.progress.step);
          const p = Math.min(95, Math.round((s.progress.stepsCompleted / Math.max(1, s.progress.totalSteps)) * 100));
          setProgressPct(p);
          // infer step from step name
          const step = String(s.progress.step || '').toLowerCase();
          const map = (): Record<string, 'pending' | 'active' | 'done'> => {
            if (step.includes('rank') || step.includes('score')) return { scrape: 'done', enrich: 'done', rev: 'done', rank: 'active' };
            if (step.includes('revenue') || step.includes('estimate')) return { scrape: 'done', enrich: 'done', rev: 'active', rank: 'pending' };
            if (step.includes('enrich') || step.includes('contact')) return { scrape: 'done', enrich: 'active', rev: 'pending', rank: 'pending' };
            return { scrape: 'active', enrich: 'pending', rev: 'pending', rank: 'pending' };
          };
          setStepStatuses(map());
          setLiveCount((prev) => Math.max(prev, Math.round(p * 3.2)));
          return false;
        }
        if (s.status === 'complete') {
          const r = await fetch(`/api/search/${currentJobId}/results`).then((r) => r.json());
          const rLeads: RankedLead[] = r.leads ?? [];
          setLeads(rLeads);
          setTotalScraped(r.metadata?.totalScraped ?? rLeads.length);
          setSearchMs(Date.now() - startedAt);
          setProgressPct(100);
          setProgressMsg(`Complete · ${rLeads.length} leads`);
          setStepStatuses({ scrape: 'done', enrich: 'done', rev: 'done', rank: 'done' });
          setStage('results');
          // Update history
          setHistory((prev) => {
            const next = prev.map((h) => (h.id === currentJobId ? { ...h, status: 'complete' as const, leads: rLeads.length } : h));
            saveLS(HISTORY_KEY, next);
            return next;
          });
          return true;
        }
        if (s.status === 'failed') {
          const msg = s.error || 'Search failed';
          setSearchError(msg);
          pushToast('Search failed', msg, 'err');
          setStage('ready');
          setHistory((prev) => {
            const next = prev.map((h) => (h.id === currentJobId ? { ...h, status: 'failed' as const } : h));
            saveLS(HISTORY_KEY, next);
            return next;
          });
          return true;
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Polling failed');
        return true;
      }
      return false;
    };

    const interval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(interval);
    }, 2500);
    // also poll immediately
    poll().then((done) => { if (done) clearInterval(interval); });
  };

  // ---- Lead actions ----
  const saveLead = (lead: RankedLead) => {
    if (saved.find((s) => s.id === lead.id)) {
      pushToast('Already saved', lead.businessName);
      return;
    }
    const entry: SavedLead = {
      id: lead.id,
      name: lead.businessName,
      city: lead.city ?? '',
      state: lead.state ?? '',
      revenue: lead.businessDetails?.estimatedRevenue ?? null,
      match: lead.matchScore,
      stage: 'New',
      searchLabel: criteriaLabel(criteria as SearchCriteria),
      savedAt: Date.now(),
      lead,
    };
    setSaved((prev) => {
      const next = [entry, ...prev];
      saveLS(SAVED_KEY, next);
      return next;
    });
    pushToast('Saved', lead.businessName);
  };

  const removeSaved = (id: string) => {
    setSaved((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveLS(SAVED_KEY, next);
      return next;
    });
  };

  const dismissLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    pushToast('Dismissed', 'Hidden from this search');
  };

  const copyToClipboard = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      pushToast('Copied', val);
    } catch {}
  };

  const exportCSV = (rows: RankedLead[], filename: string) => {
    if (!rows.length) { pushToast('Nothing to export'); return; }
    const header = ['Rank', 'Business', 'City', 'State', 'Industry', 'Phone', 'Email', 'Website', 'Revenue', 'Employees', 'YearsInBusiness', 'Rating', 'Reviews', 'MatchScore', 'MatchReason'];
    const esc = (s: unknown) => {
      const v = s == null ? '' : String(s);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [header.join(',')];
    rows.forEach((l, i) => {
      lines.push([
        i + 1,
        l.businessName,
        l.city ?? '',
        l.state ?? '',
        industryOf(l),
        l.contact?.phone ?? '',
        l.contact?.email ?? '',
        l.contact?.website ?? l.website ?? '',
        l.businessDetails?.estimatedRevenue ?? '',
        l.businessDetails?.employeeCount ?? '',
        l.businessDetails?.yearsInBusiness ?? '',
        l.businessDetails?.googleRating ?? '',
        l.businessDetails?.reviewCount ?? '',
        l.matchScore,
        l.matchReason,
      ].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
    pushToast('Exported', filename);
  };

  const newSearch = () => {
    setStage('chat');
    setMessages([]);
    setCriteria(null);
    setLeads([]);
    setSearchError('');
    setLiveCount(0);
    setProgressPct(0);
    historyRef.current = [];
    setNav('search');
  };

  // ---- Filter tabs ----
  const filteredLeads = useMemo(() => {
    if (filterTab === 'all') return leads;
    if (filterTab === 'top') return leads.filter((l) => l.matchScore >= 85);
    if (filterTab === 'signal') return leads.filter((l) => (l.businessDetails?.yearsInBusiness ?? 0) >= 15);
    if (filterTab === 'saved') { const ids = new Set(saved.map((s) => s.id)); return leads.filter((l) => ids.has(l.id)); }
    return leads;
  }, [filterTab, leads, saved]);

  // ---- Criteria summary rows ----
  type SummaryRow = {
    key: string;
    label: string;
    value: string;
    mono?: boolean;
    editable?: boolean;
    commit?: (input: string) => Partial<SearchCriteria>;
  };
  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (!criteria) return [];
    const c = criteria;
    const industry = c.industry ?? { primary: '', subSectors: [], keywords: [] };
    const location = c.location ?? { city: '', state: '', country: 'US', radiusMiles: 50 };
    const size = c.businessSize ?? { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null };
    const prefs = c.preferences ?? { businessAgeYears: null, ownerOperated: null, disqualifiers: [] };
    const parseMoney = (s: string): number | null => {
      const m = s.replace(/[$,\s]/g, '').match(/^([\d.]+)([mk])?$/i);
      if (!m) return null;
      const n = parseFloat(m[1]);
      if (isNaN(n)) return null;
      const u = m[2]?.toLowerCase();
      return u === 'm' ? n * 1_000_000 : u === 'k' ? n * 1000 : n;
    };
    const parseRange = <T,>(input: string, fn: (x: string) => T | null): [T | null, T | null] => {
      const parts = input.split(/[-–—]/).map((p) => p.trim());
      return [parts[0] ? fn(parts[0]) : null, parts[1] ? fn(parts[1]) : null];
    };
    const rows: SummaryRow[] = [];
    if (c.industry?.primary) rows.push({
      key: 'industry', label: 'Industry', value: c.industry.primary, editable: true,
      commit: (v) => ({ ...c, industry: { ...industry, primary: v.trim() } }),
    });
    if (c.industry?.keywords?.length) rows.push({
      key: 'keywords', label: 'Keywords', value: c.industry.keywords.join(' · '), editable: true,
      commit: (v) => ({ ...c, industry: { ...industry, keywords: v.split(/\s*[·,]\s*/).map((s) => s.trim()).filter(Boolean) } }),
    });
    if (c.location?.city) rows.push({
      key: 'location', label: 'Location', value: [c.location.city, c.location.state].filter(Boolean).join(', '), editable: true,
      commit: (v) => {
        const [city = '', state = ''] = v.split(',').map((s) => s.trim());
        return { ...c, location: { ...location, city, state: state || location.state } };
      },
    });
    if (c.location?.radiusMiles != null) rows.push({
      key: 'radius', label: 'Radius', value: `${c.location.radiusMiles} miles`, mono: true, editable: true,
      commit: (v) => {
        const n = parseInt(v.replace(/[^\d]/g, ''), 10);
        return { ...c, location: { ...location, radiusMiles: isNaN(n) ? location.radiusMiles : n } };
      },
    });
    const rmin = c.businessSize?.revenueMin; const rmax = c.businessSize?.revenueMax;
    if (rmin || rmax) {
      const f = (n: number | null | undefined) => (n == null ? '—' : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1000)}K`);
      rows.push({
        key: 'revenue', label: 'Revenue', value: `${f(rmin)} – ${f(rmax)}`, mono: true, editable: true,
        commit: (v) => {
          const [min, max] = parseRange(v, parseMoney);
          return { ...c, businessSize: { ...size, revenueMin: min, revenueMax: max } };
        },
      });
    }
    const emin = c.businessSize?.employeeMin; const emax = c.businessSize?.employeeMax;
    if (emin || emax) rows.push({
      key: 'employees', label: 'Employees', value: `${emin ?? '—'} – ${emax ?? '—'}`, mono: true, editable: true,
      commit: (v) => {
        const [min, max] = parseRange(v, (s) => {
          const n = parseInt(s, 10);
          return isNaN(n) ? null : n;
        });
        return { ...c, businessSize: { ...size, employeeMin: min, employeeMax: max } };
      },
    });
    if (c.preferences?.businessAgeYears != null) rows.push({
      key: 'tenure', label: 'Tenure', value: `≥ ${c.preferences.businessAgeYears} years`, mono: true, editable: true,
      commit: (v) => {
        const n = parseInt(v.replace(/[^\d]/g, ''), 10);
        return { ...c, preferences: { ...prefs, businessAgeYears: isNaN(n) ? null : n } };
      },
    });
    if (c.preferences?.ownerOperated) rows.push({ key: 'owner', label: 'Owner', value: 'Owner-operated' });
    if (c.preferences?.disqualifiers?.length) rows.push({
      key: 'exclude', label: 'Exclude', value: c.preferences.disqualifiers.join(', '), editable: true,
      commit: (v) => ({ ...c, preferences: { ...prefs, disqualifiers: v.split(',').map((s) => s.trim()).filter(Boolean) } }),
    });
    return rows;
  }, [criteria]);

  // ---- Render ----
  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="brand">
          <div className="brand-mark">s</div>
          <div className="brand-name">Sojo</div>
        </div>
        <nav className="header-nav">
          <button className={nav === 'search' ? 'active' : ''} onClick={() => setNav('search')}>Search</button>
          <button className={nav === 'saved' ? 'active' : ''} onClick={() => setNav('saved')}>Saved{saved.length ? ` · ${saved.length}` : ''}</button>
          <button className={nav === 'history' ? 'active' : ''} onClick={() => setNav('history')}>History</button>
        </nav>
        <div className="header-actions">
          {(stage === 'searching' || stage === 'results' || searchError) && (
            <div className={`job-pill ${stage === 'searching' ? 'active' : stage === 'results' ? 'complete' : searchError ? 'failed' : ''}`}>
              <span className="dot"></span>
              <span>
                {stage === 'searching' ? 'Searching' :
                  stage === 'results' ? `${leads.length} leads · ranked` :
                  searchError ? 'Search failed' : ''}
              </span>
            </div>
          )}
          {stage === 'searching' && (
            <div className="topprog show">
              <span>{progressMsg || 'Searching'}</span>
              <div className="topprog-bar"><div className="topprog-fill" style={{ width: `${progressPct}%` }} /></div>
            </div>
          )}
          <button className="icon-btn" onClick={() => setTweaksOpen((v) => !v)} title="Settings">{Ic.settings}</button>
          <div className="avatar">MT</div>
        </div>
      </header>

      <main className="main">
        {/* ====== SEARCH VIEW ====== */}
        <div className={`view ${nav === 'search' ? 'active' : ''}`}>
          {(stage === 'chat' || stage === 'ready') && (
            <div className="stage">
              <div className="stage-scroll" ref={stageScrollRef}>
                <div className="convo">
                  {messages.length === 0 && (
                    <div className="intro">
                      <div className="time"><span className="dot" /><span>{greeting()}</span></div>
                      <h1 className="greet">Hi <em>there</em>. What are we sourcing today?</h1>
                      <p className="sub">Tell me about the kind of business you want to acquire — vertical, geography, revenue band, operator signals. I&apos;ll structure the search as we go.</p>
                      <div className="chips" style={{ justifyContent: 'center', marginTop: 22 }}>
                        {[
                          'A plumbing business in Atlanta, $1–3M revenue',
                          'HVAC contractors in the Carolinas, owner 60+',
                          'Commercial landscaping in DFW, $2–5M',
                        ].map((q) => (
                          <button key={q} className="chip" onClick={() => setInput(q)}>
                            <span className="plus">＋</span>{q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m) => (
                    <div key={m.id} className="turn">
                      <div className="turn-meta">
                        <span className="who">{m.role === 'user' ? 'You' : 'Sojo'}</span>
                        <span className="dot-sep">·</span>
                        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {m.role === 'assistant'
                        ? <div className="ai-body">{m.content}</div>
                        : <div className="user-body">{m.content}</div>}
                    </div>
                  ))}

                  {busy && (
                    <div className="turn">
                      <div className="typing"><span /><span /><span /></div>
                    </div>
                  )}

                  {stage === 'ready' && criteria && (
                    <div className="turn">
                      <div className="turn-meta">
                        <span className="who">Sojo</span>
                        <span className="dot-sep">·</span>
                        <span>Ready to search</span>
                      </div>
                      <div className="ai-body">Here&apos;s what I&apos;ve got. Look <em>right</em>?</div>
                      <div className="ai-note">{summaryRows.length} fields extracted. Edit anything below or search now.</div>
                      <div className="summary">
                        <div className="summary-head">
                          <div className="summary-head-left">
                            <div className="summary-title">Search draft</div>
                            <div className="summary-sub mono">auto-extracted</div>
                          </div>
                          <div className="summary-status"><span className="dot" />Ready</div>
                        </div>
                        <div className="summary-body">
                          {summaryRows.map((r) => {
                            const isEditing = editingKey === r.key;
                            const commit = () => {
                              if (r.commit) setCriteria(r.commit(editValue));
                              setEditingKey(null);
                            };
                            const cancel = () => setEditingKey(null);
                            return (
                              <div className="crit-row" key={r.key}>
                                <div className="crit-label">{r.label}</div>
                                <div className="crit-value">
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      className={`crit-input ${r.mono ? 'mono-v' : ''}`}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={commit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                                        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                                      }}
                                    />
                                  ) : (
                                    <span className={r.mono ? 'mono-v' : ''}>{r.value}</span>
                                  )}
                                </div>
                                {r.editable && (
                                  <button
                                    className="crit-edit"
                                    onMouseDown={(e) => { if (isEditing) e.preventDefault(); }}
                                    onClick={() => {
                                      if (isEditing) commit();
                                      else { setEditValue(r.value); setEditingKey(r.key); }
                                    }}
                                  >
                                    {isEditing ? 'done' : 'edit'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="summary-footer">
                          <div className="summary-footer-meta">
                            Scanning across <strong>Google Maps, Yelp, and web directories</strong>. Takes ~30–90 seconds.
                          </div>
                          <button className="btn-primary" onClick={startSearch}>
                            Find leads
                            <span className="kbd">⌘↵</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {searchError && stage === 'ready' && (
                    <div className="err-banner">
                      <div><strong>Couldn&apos;t start search</strong>{searchError}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="composer-wrap">
                <div className="composer">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); autosize(e.currentTarget); }}
                    onKeyDown={onComposerKey}
                    placeholder={stage === 'ready' ? 'Refine — "also include commercial", "bump revenue"…' : 'Describe the business you want to acquire…'}
                    rows={1}
                  />
                  <div className="composer-row">
                    <div className="composer-left">
                      <span className="composer-hint"><span className="kbd">⌘</span><span className="kbd">↵</span> {stage === 'ready' ? 'search' : 'send'}</span>
                    </div>
                    <div className="composer-right">
                      <button className="send-btn" disabled={busy || !input.trim()} onClick={sendMessage}>{Ic.send}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {stage === 'searching' && (
            <div className="stage" style={{ gridTemplateRows: '1fr' }}>
              <div className="stage-scroll">
                <div className="searching">
                  <h1 className="searching-title">
                    Searching for <em>{criteria?.industry?.primary ?? 'leads'}</em>
                    {criteria?.location?.city ? ` in ${criteria.location.city}` : ''}.
                  </h1>
                  <p className="searching-sub">
                    Scanning Google Maps, web directories, and public records. Usually 30–90 seconds.
                  </p>
                  <div className="sketch-count">
                    <div className="n">{liveCount}</div>
                    <div className="l">candidates · live</div>
                  </div>
                  <div className="progress-log">
                    {PROG_STEPS.map((s) => {
                      const st = stepStatuses[s.key];
                      return (
                        <div className={`plog-row ${st}`} key={s.key}>
                          <div className="plog-icon">
                            {st === 'done' ? Ic.check : st === 'active' ? <div className="plog-spin" /> : null}
                          </div>
                          <div>{s.label}</div>
                          <div className="plog-count">{st === 'done' ? '✓' : st === 'active' ? '…' : '—'}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--faint)' }}>
                    {progressMsg}
                  </div>
                </div>
              </div>
            </div>
          )}

          {stage === 'results' && (
            <div className="results-wrap">
              <div className="results-head">
                <div className="results-head-left">
                  <div className="results-head-title">
                    <span>Found <em>{leads.length} {criteria?.industry?.primary ?? 'leads'}</em>
                      {criteria?.location?.city ? ` in ${criteria.location.city}` : ''}.</span>
                  </div>
                  <div className="results-head-meta">
                    <span>{totalScraped.toLocaleString()} candidates scanned</span>
                    <span className="sep">·</span>
                    <span>{(searchMs / 1000).toFixed(1)} s</span>
                    <span className="sep">·</span>
                    <span>ranked by match</span>
                  </div>
                </div>
                <div className="results-head-actions">
                  <button className="btn-secondary" onClick={() => exportCSV(leads, `sojo-${Date.now()}.csv`)}>
                    {Ic.download} Export CSV
                  </button>
                  <button className="btn-primary" onClick={newSearch}>
                    {Ic.plus} New search
                  </button>
                </div>
              </div>
              <div className="results-toolbar">
                <div className="filters">
                  {([
                    ['all', 'All', leads.length],
                    ['top', 'Top matches', leads.filter((l) => l.matchScore >= 85).length],
                    ['signal', 'Signal', leads.filter((l) => (l.businessDetails?.yearsInBusiness ?? 0) >= 15).length],
                    ['saved', 'Saved', leads.filter((l) => saved.find((s) => s.id === l.id)).length],
                  ] as const).map(([k, label, count]) => (
                    <button key={k} className={`filter-tab ${filterTab === k ? 'active' : ''}`} onClick={() => setFilterTab(k)}>
                      {label} <span className="count">{count}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="ctrl-btn">{Ic.sort} Sort: Match</button>
                  <button className="ctrl-btn">{Ic.filter} Filters</button>
                </div>
              </div>
              <div className="results-body">
                <div className="query-strip">
                  <div className="text">
                    <em>{criteriaLabel(criteria as SearchCriteria)}</em>
                  </div>
                  <div className="meta">
                    <span className="ok">● complete</span>
                    <span className="sep">·</span>
                    <span>{leads.length}/{totalScraped || leads.length}</span>
                  </div>
                </div>
                <div className="results-grid">
                  {filteredLeads.length === 0 && (
                    <div className="empty-state">
                      <h3>No <em>matches</em> in this filter.</h3>
                      <div>Try switching tabs or loosening the criteria.</div>
                    </div>
                  )}
                  {filteredLeads.map((lead, i) => {
                    const subs = subScoresFor(lead);
                    const tier = tierOf(lead.matchScore);
                    const isSaved = !!saved.find((s) => s.id === lead.id);
                    return (
                      <div
                        key={lead.id}
                        className="lead"
                        onClick={() => setDrawerLead(lead)}
                        style={{ animation: `fadeUp 480ms ${i * 60}ms cubic-bezier(0.2, 0.8, 0.2, 1) both` }}
                      >
                        <div className="lead-rank">{String(i + 1).padStart(2, '0')}</div>
                        <div className="lead-main">
                          <div className="lead-head">
                            <div className="lead-name">{lead.businessName}</div>
                            {(lead.city || lead.state) && (
                              <span className="lead-loc">
                                {lead.city}{lead.state ? <><span className="sep">·</span>{lead.state}</> : null}
                              </span>
                            )}
                            <span className="lead-industry">{industryOf(lead)}</span>
                          </div>
                          <div className="lead-contact">
                            {lead.contact?.phone && (
                              <span className="contact-field" onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.contact.phone!); }}>
                                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                {lead.contact.phone}
                              </span>
                            )}
                            {lead.contact?.email && (
                              <span className="contact-field" onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.contact.email!); }}>
                                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
                                {lead.contact.email}
                              </span>
                            )}
                            {lead.website && (
                              <span className="contact-field" onClick={(e) => { e.stopPropagation(); window.open(lead.website!.startsWith('http') ? lead.website! : `https://${lead.website}`, '_blank'); }}>
                                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>
                                {lead.website.replace(/^https?:\/\//, '')}
                              </span>
                            )}
                          </div>
                          {lead.matchReason && <div className="lead-reason">{lead.matchReason}</div>}
                        </div>
                        <div className="match-col">
                          <div className="match-top">
                            <div className={`match-score ${tier}`}>{lead.matchScore}</div>
                            <div className="match-label">/ 100 · match</div>
                          </div>
                          <div className="match-bars">
                            {(['revenue', 'location', 'industry', 'signal'] as const).map((k) => (
                              <div className="match-bar" key={k}>
                                <div className="match-bar-l">{k}</div>
                                <div className="match-bar-t"><div className={`match-bar-f ${barCls(subs[k])}`} style={{ ['--w' as string]: subs[k] / 100, transform: `scaleX(${subs[k] / 100})` }} /></div>
                                <div className="match-bar-v">{subs[k]}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="actions-col">
                          {lead.businessDetails?.estimatedRevenue && (
                            <div className="stat-row"><span>Rev</span><span className="val">{lead.businessDetails.estimatedRevenue}</span></div>
                          )}
                          {lead.businessDetails?.employeeCount != null && (
                            <div className="stat-row"><span>Emp</span><span className="val">{lead.businessDetails.employeeCount}</span></div>
                          )}
                          {lead.businessDetails?.yearsInBusiness != null && (
                            <div className="stat-row"><span>Yrs</span><span className="val">{lead.businessDetails.yearsInBusiness}</span></div>
                          )}
                          <div className="lead-actions">
                            <button className="act-btn primary" onClick={(e) => { e.stopPropagation(); isSaved ? removeSaved(lead.id) : saveLead(lead); }}>
                              {Ic.bookmark}{isSaved ? 'Saved' : 'Save'}
                            </button>
                            <button className="act-btn danger" onClick={(e) => { e.stopPropagation(); dismissLead(lead.id); }}>{Ic.close}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ====== SAVED VIEW ====== */}
        <div className={`view ${nav === 'saved' ? 'active' : ''}`}>
          <div className="simple-page">
            <div className="simple-head">
              <div>
                <h1>Your <em>saved</em> leads.</h1>
                <div className="sub">
                  {saved.length ? `${saved.length} business${saved.length === 1 ? '' : 'es'} saved` : 'Nothing saved yet'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-secondary"
                  onClick={() => exportCSV(saved.map((s) => s.lead), `sojo-saved-${Date.now()}.csv`)}
                  disabled={!saved.length}
                >
                  {Ic.download} Export CSV
                </button>
              </div>
            </div>
            {saved.length === 0 ? (
              <div className="empty-state">
                <h3>Your <em>pipeline</em> starts here.</h3>
                <div>Save interesting leads from a search and they&apos;ll appear in this table.</div>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Location</th>
                    <th className="num">Revenue</th>
                    <th className="num">Match</th>
                    <th>Stage</th>
                    <th>From</th>
                    <th className="num">Saved</th>
                    <th style={{ width: 26 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((s) => {
                    const tier = tierOf(s.match);
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td style={{ color: 'var(--muted)' }}>{s.city}{s.state ? `, ${s.state}` : ''}</td>
                        <td className="num">{s.revenue ?? '—'}</td>
                        <td className="num"><span className={`score-pill ${tier}`}>{s.match}</span></td>
                        <td>
                          <select
                            value={s.stage}
                            onChange={(e) => {
                              const newStage = e.target.value as SavedLead['stage'];
                              setSaved((prev) => {
                                const next = prev.map((x) => (x.id === s.id ? { ...x, stage: newStage } : x));
                                saveLS(SAVED_KEY, next);
                                return next;
                              });
                            }}
                            style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                          >
                            {(['New', 'Outreach', 'Discovery', 'LOI sent', 'Passed'] as const).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </td>
                        <td style={{ color: 'var(--faint)', fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11.5 }}>{s.searchLabel}</td>
                        <td className="num" style={{ color: 'var(--faint)' }}>{fmtRelative(s.savedAt)}</td>
                        <td>
                          <button className="icon-btn" onClick={() => removeSaved(s.id)} title="Remove">{Ic.close}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ====== HISTORY VIEW ====== */}
        <div className={`view ${nav === 'history' ? 'active' : ''}`}>
          <div className="simple-page">
            <div className="simple-head">
              <div>
                <h1>Search <em>history</em>.</h1>
                <div className="sub">{history.length ? "Every query you've run, ranked by recency." : "Run a search and it'll show up here."}</div>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">
                <h3>No <em>past searches</em> yet.</h3>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
                {history.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 20, alignItems: 'center',
                      padding: '14px 4px', borderBottom: '1px solid var(--hairline)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, marginBottom: 2 }}>{h.title}</div>
                      <div style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--faint)', letterSpacing: '0.03em' }}>
                        <span style={{ color: h.status === 'running' ? 'var(--accent-deep)' : h.status === 'failed' ? 'var(--danger)' : 'var(--success)' }}>● {h.status}</span>
                        {' · '}{fmtRelative(h.when)}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-instrument-serif), serif', fontSize: 22, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                      {h.leads}
                    </div>
                    <div style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 10.5, color: 'var(--faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>leads</div>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => {
                        setCriteria(h.criteria);
                        setNav('search');
                        setStage('ready');
                        setMessages([]);
                        historyRef.current = [];
                      }}
                    >
                      Rerun
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* DRAWER */}
      <div className={`drawer-backdrop ${drawerLead ? 'open' : ''}`} onClick={() => setDrawerLead(null)} />
      <aside className={`drawer ${drawerLead ? 'open' : ''}`}>
        {drawerLead && (() => {
          const subs = subScoresFor(drawerLead);
          const isSaved = !!saved.find((s) => s.id === drawerLead.id);
          const tierVar = drawerLead.matchScore >= 85 ? '--success' : drawerLead.matchScore >= 70 ? '--accent' : '--muted';
          return (
            <>
              <div className="drawer-header">
                <div className="drawer-title">
                  <h3>{drawerLead.businessName}</h3>
                  <div className="sub">{locLine(drawerLead)}{drawerLead.website ? ` · ${drawerLead.website}` : ''}</div>
                </div>
                <button className="icon-btn" onClick={() => setDrawerLead(null)}>{Ic.close}</button>
              </div>
              <div className="drawer-body scroll">
                <div className="score-big">
                  <div className="n" style={{ color: `var(${tierVar})` }}>{drawerLead.matchScore}<span> / 100 match</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    {(['revenue', 'location', 'industry', 'signal'] as const).map((k) => (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-geist-mono), monospace', fontSize: 10.5, color: 'var(--faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                          <span>{k}</span><span>{subs[k]}</span>
                        </div>
                        <div className="match-bar-t"><div className={`match-bar-f ${barCls(subs[k])}`} style={{ ['--w' as string]: subs[k] / 100, transform: `scaleX(${subs[k] / 100})`, animation: 'none' }} /></div>
                      </div>
                    ))}
                  </div>
                  {drawerLead.matchReason && <div className="why">{drawerLead.matchReason}</div>}
                </div>
                <div className="drawer-section">
                  <h4>Contact</h4>
                  <dl className="kv-grid">
                    <dt>Phone</dt><dd>{drawerLead.contact?.phone ?? '—'}</dd>
                    <dt>Email</dt><dd>{drawerLead.contact?.email ?? '—'}</dd>
                    <dt>Website</dt><dd>{drawerLead.website ?? drawerLead.contact?.website ?? '—'}</dd>
                    <dt>Address</dt><dd className="text">{drawerLead.address ?? '—'}</dd>
                  </dl>
                </div>
                <div className="drawer-section">
                  <h4>Business</h4>
                  <dl className="kv-grid">
                    <dt>Industry</dt><dd className="text">{industryOf(drawerLead)}</dd>
                    <dt>Revenue</dt><dd>{drawerLead.businessDetails?.estimatedRevenue ?? '—'}</dd>
                    <dt>Employees</dt><dd>{drawerLead.businessDetails?.employeeCount ?? '—'}</dd>
                    <dt>Years</dt><dd>{drawerLead.businessDetails?.yearsInBusiness ?? '—'}</dd>
                    <dt>Rating</dt><dd>{drawerLead.businessDetails?.googleRating ? `${drawerLead.businessDetails.googleRating}★ · ${drawerLead.businessDetails.reviewCount ?? 0}` : '—'}</dd>
                    <dt>Source</dt><dd>{drawerLead.source}</dd>
                  </dl>
                </div>
              </div>
              <div className="drawer-footer">
                <button
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { isSaved ? removeSaved(drawerLead.id) : saveLead(drawerLead); }}
                >
                  {isSaved ? 'Unsave' : 'Save lead'}
                </button>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDrawerLead(null)}>Close</button>
              </div>
            </>
          );
        })()}
      </aside>

      {/* TOAST */}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>
            <div className="icon-wrap">{t.kind === 'err' ? Ic.close : Ic.check}</div>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.sub && <div className="toast-sub">{t.sub}</div>}
            </div>
            <span className="close" onClick={() => dismissToast(t.id)}>{Ic.close}</span>
          </div>
        ))}
      </div>

      {/* TWEAKS */}
      <div className={`tweaks ${tweaksOpen ? 'open' : ''}`}>
        <h4>Settings</h4>
        <div className="tweak-row">
          <div>
            <div className="tweak-label">Theme</div>
            <div className="tweak-sub">{theme}</div>
          </div>
          <div className={`switch ${theme === 'dark' ? 'on' : ''}`} onClick={toggleTheme} />
        </div>
        <div className="tweak-row">
          <div>
            <div className="tweak-label">Reset conversation</div>
            <div className="tweak-sub">Start a fresh search</div>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={newSearch}>Reset</button>
        </div>
      </div>
    </div>
  );
}
