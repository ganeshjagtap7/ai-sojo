'use client';

import { useEffect, useRef, useState } from 'react';
import { useFlow } from './FlowProvider';
import type { BucketKey } from '@/lib/flow/types';

type Mode = 'elicit' | 'pushback' | 'teach' | 'confirm';

interface TeachCell { n: string; name: string; body: string; }
interface TeachCard { eye: string; h: string; cells: TeachCell[]; }

interface AIMessage {
  role: 'ai';
  text: string;
  mode: Mode;
  teach?: TeachCard;
  pushbackOf?: string;
  isError?: boolean;
}
interface UserMessage { role: 'user'; text: string; }
type ConvoItem = AIMessage | UserMessage | { role: 'user-pushback-of'; text: string };

// Translate raw AI SDK / provider error payloads into a short, user-readable
// sentence. The transport sometimes hands us a JSON blob (OpenAI error shape
// nested under `error`), sometimes a string. Either way: never render raw
// JSON in the chat.
function friendlyErrorText(raw: unknown): string {
  if (!raw) return "I couldn't reach the model. Try again in a moment.";

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { /* leave as string */ }
  }

  const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;
  const inner = (obj?.error && typeof obj.error === 'object') ? obj.error as Record<string, unknown> : obj;
  const code = inner?.code as string | undefined;
  const type = inner?.type as string | undefined;

  // Also match on the message text — streamed provider errors often arrive as a
  // plain string with no code/type, so keyword detection is what actually fires.
  const text = (typeof raw === 'string' ? raw : String(inner?.message ?? '')).toLowerCase();

  if (code === 'insufficient_quota' || type === 'insufficient_quota' || text.includes('quota')) {
    return 'Our AI is briefly over capacity. Please try again in a moment.';
  }
  if (code === 'rate_limit_exceeded' || type === 'rate_limit_error' || text.includes('rate limit')) {
    return 'The AI is rate-limited right now. Give it a few seconds and try again.';
  }
  if (code === 'invalid_api_key' || code === 'invalid_request_error' || text.includes('api key') || text.includes('apikey')) {
    return 'The AI service is temporarily unavailable. Please try again shortly.';
  }
  // Never surface the raw provider error to the user.
  return "I couldn't reach the AI just now. Try again in a moment.";
}

const BUCKET_DEFS: { id: BucketKey; label: string }[] = [
  { id: 'opening', label: 'Opening posture' },
  { id: 'stickiness', label: 'What "sticky" means' },
  { id: 'archetype', label: 'Thesis shape' },
  { id: 'disqualifier', label: 'The fast no' },
  { id: 'concentration-nuance', label: 'Concentration nuance' },
  { id: 'vision', label: 'Five-year picture' },
];

const OPENER_TEXT =
  "Let's start somewhere honest. What kinds of businesses do you find yourself thinking about — either a specific idea you have, or a general shape?";

// Deterministic teach card for the archetype bucket. The 4 cells never change,
// so we render them client-side whenever the active bucket is `archetype` and
// it hasn't been filled yet — gpt-4o intermittently slips back into elicit
// mode and lists the names in prose, even when the prompt explicitly requires
// teach mode. This makes the UX robust to the LLM's mood.
const ARCHETYPE_CARD: TeachCard = {
  eye: '§ Three · Archetype',
  h: 'Which of these is closest to how you\'d think about it?',
  cells: [
    { n: 'i.',   name: 'The local monopoly',   body: 'Own the only one in a small market. Defensible by geography.' },
    { n: 'ii.',  name: 'The consolidator',     body: 'Buy #1, then #2, then #3. Defensible by scale.' },
    { n: 'iii.', name: 'The operator upgrade', body: 'Buy a sleepy business, professionalize it. Defensible by capability.' },
    { n: 'iv.',  name: 'The quiet moat',       body: 'Niche product, boring category, obscene margins.' },
  ],
};

export function Stage3Converse() {
  const { state, dispatch } = useFlow();
  // Rehydrate the transcript from flow state so it survives a stage remount
  // (back-navigation). Falls back to empty for a fresh session.
  const [history, setHistory] = useState<ConvoItem[]>(() => (state.convo as ConvoItem[]) ?? []);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(true);
  const [currentMode, setCurrentMode] = useState<Mode>('elicit');
  const [activeBucket, setActiveBucket] = useState<BucketKey>('opening');
  const [sessionComplete, setSessionComplete] = useState(false);
  // Phone-only: the buckets rail collapses to a tappable bar (see .s3-buckets-*
  // in flow.css). Ignored on tablet/desktop where the rail always shows.
  const [bucketsOpen, setBucketsOpen] = useState(false);
  const convoRef = useRef<HTMLDivElement>(null);
  const sentOpenerRef = useRef(false);

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, [history, typing]);

  // Seed with the hardcoded opener. /api/chat won't accept empty messages, and
  // the opener is deterministic anyway — no reason to round-trip to the model.
  // Skip when we rehydrated a prior transcript (don't clobber it with the opener).
  useEffect(() => {
    if (sentOpenerRef.current) return;
    sentOpenerRef.current = true;
    if (history.length === 0) {
      setHistory([{ role: 'ai', text: OPENER_TEXT, mode: 'elicit' }]);
    }
    setTyping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the transcript to flow state so a stage remount (back-navigation)
  // doesn't reset the conversation — keeping the model's context intact.
  useEffect(() => {
    dispatch({ type: 'SET_CONVO', convo: history });
  }, [history, dispatch]);

  // Auto-advance to stage 4 on confirm
  useEffect(() => {
    if (sessionComplete) {
      const t = setTimeout(() => dispatch({ type: 'SET_STAGE', stage: 4 }), 1600);
      return () => clearTimeout(t);
    }
  }, [sessionComplete, dispatch]);

  async function sendToAI(messages: { role: 'user' | 'assistant'; content: string }[]) {
    setTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let aiText = '';
      let opened = false;
      let streamError: string | null = null;
      let lastTool: {
        mode?: Mode; bucket?: BucketKey; bucketValue?: string;
        pushbackOf?: string; teachCard?: TeachCard; sessionComplete?: boolean;
      } | null = null;

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
            const ev = JSON.parse(raw);
            if (ev.type === 'text-start') {
              // New text segment. With multi-step streaming the model can emit
              // text in step 1 AND step 2 — the second emission is the canonical
              // "next question" we want to show. Reset the accumulator so step 2
              // replaces step 1 instead of being appended to it (which produced
              // the doubled-prose bug).
              aiText = '';
            } else if (ev.type === 'text-delta' && typeof ev.delta === 'string') {
              aiText += ev.delta;
              if (!opened) {
                opened = true;
                setHistory((h) => [...h, { role: 'ai', text: aiText, mode: 'elicit' } as AIMessage]);
              } else {
                setHistory((h) => h.map((m, i) => (i === h.length - 1 && m.role === 'ai' ? { ...m, text: aiText } : m)));
              }
            } else if (ev.type === 'tool-input-available' && ev.toolName === 'update_session') {
              lastTool = ev.input;
            } else if (ev.type === 'error' && typeof ev.errorText === 'string') {
              streamError = ev.errorText;
            }
          } catch { /* ignore malformed */ }
        }
      }

      if (streamError) {
        // Render error in its own message no matter what — even if some text
        // started streaming first, we want the failure called out clearly.
        const friendly = friendlyErrorText(streamError);
        setHistory((h) => [...h, { role: 'ai', text: friendly, mode: 'elicit', isError: true } as AIMessage]);
      }

      if (lastTool) {
        setCurrentMode(lastTool.mode ?? 'elicit');
        if (lastTool.bucket && lastTool.bucketValue) {
          dispatch({ type: 'PATCH_BUCKETS', patch: { [lastTool.bucket]: lastTool.bucketValue } });
        }
        if (lastTool.bucket) setActiveBucket(lastTool.bucket);
        setHistory((h) => {
          const last = h[h.length - 1];
          if (!last || last.role !== 'ai') return h;
          // Force the archetype turn into teach mode with the deterministic
          // card. gpt-4o intermittently slips back into elicit and lists the
          // four archetype names in prose — overriding here keeps the UX
          // consistent regardless of LLM compliance.
          const onArchetypeTurn =
            lastTool!.bucket === 'archetype' &&
            !lastTool!.bucketValue &&
            !state.buckets.archetype;
          const mode = onArchetypeTurn ? 'teach' : (lastTool!.mode ?? last.mode);
          // teachCard is only valid for `mode: teach`. Drop stale cards from
          // the model accidentally re-emitting an old one on a different
          // bucket's turn (was producing archetype cells under disqualifier).
          const teach = onArchetypeTurn
            ? ARCHETYPE_CARD
            : mode === 'teach'
            ? lastTool!.teachCard ?? undefined
            : undefined;
          return [
            ...h.slice(0, -1),
            {
              ...last,
              mode,
              teach,
              pushbackOf: lastTool!.pushbackOf ?? undefined,
            } as AIMessage,
          ];
        });
        if (lastTool.sessionComplete) setSessionComplete(true);
      }
    } catch (err) {
      setHistory((h) => [...h, {
        role: 'ai',
        text: friendlyErrorText(err instanceof Error ? err.message : 'network'),
        mode: 'elicit',
        isError: true,
      } as AIMessage]);
    } finally {
      setTyping(false);
    }
  }

  const submit = async () => {
    const text = input.trim();
    if (!text || typing) return;
    const newUser: UserMessage = { role: 'user', text };
    const pushbackEntry = currentMode === 'pushback' && getLastPushbackOf()
      ? [{ role: 'user-pushback-of' as const, text: getLastPushbackOf()! }]
      : [];
    const nextHistory: ConvoItem[] = [...history, ...pushbackEntry, newUser];
    setHistory(nextHistory);
    setInput('');
    const convoForAI = nextHistory
      .filter((h): h is AIMessage | UserMessage => h.role === 'ai' || h.role === 'user')
      // Exclude error turns — same as the "Try again" path. Otherwise a failed
      // model call's error sentence gets sent as a prior assistant turn and
      // permanently pollutes the conversation context for every later turn.
      .filter((h) => !(h.role === 'ai' && (h as AIMessage).isError))
      .map((h) => ({
        role: h.role === 'ai' ? ('assistant' as const) : ('user' as const),
        content: h.text,
      }));
    await sendToAI(convoForAI);
  };

  function getLastPushbackOf(): string | undefined {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.role === 'ai' && h.pushbackOf) return h.pushbackOf;
    }
    return undefined;
  }

  const bucketStatus = (id: BucketKey): 'done' | 'live' | 'open' => {
    if (state.buckets[id]) return 'done';
    if (id === activeBucket) return 'live';
    const idx = BUCKET_DEFS.findIndex((b) => b.id === id);
    const actIdx = BUCKET_DEFS.findIndex((b) => b.id === activeBucket);
    return idx < actIdx ? 'done' : 'open';
  };

  const goSkip = () => dispatch({ type: 'SET_STAGE', stage: 4 });

  return (
    <div className="s3">
      <aside className="s3-rail-l">
        <button
          type="button"
          className="s3-buckets-toggle"
          onClick={() => setBucketsOpen((o) => !o)}
          aria-expanded={bucketsOpen}
        >
          <span>Thesis buckets · {Object.keys(state.buckets).length}/{BUCKET_DEFS.length}</span>
          <span className="s3-buckets-caret" aria-hidden>{bucketsOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`s3-buckets ${bucketsOpen ? 'open' : ''}`}>
          <div className="rail-h">§ Three</div>
          <div className="rail-t">Thesis buckets</div>
          {BUCKET_DEFS.map((b) => {
            const status = bucketStatus(b.id);
            return (
              <div className="bucket" key={b.id}>
                <div className="bucket-h">
                  <div className={`bucket-dot ${status}`} />
                  <div className="bucket-l">{b.label}</div>
                </div>
                {state.buckets[b.id] ? (
                  <div className="bucket-v">{state.buckets[b.id]}</div>
                ) : (
                  <div className="bucket-v empty">{status === 'live' ? 'Listening now…' : 'Not yet'}</div>
                )}
              </div>
            );
          })}
          {/* Phone-only: the right rail (with Skip) is hidden on small screens,
              so surface the escape hatch inside this collapsible panel too. */}
          <div className="s3-buckets-skip">
            <div className="escape-card">
              <div className="t">Want me to stop and just spit out a thesis?</div>
              <button onClick={goSkip}>Skip to synthesis →</button>
            </div>
          </div>
        </div>
      </aside>

      <div className="s3-main">
        <div className="s3-convo" ref={convoRef}>
          <div className="s3-convo-inner">
            {history.map((h, i) => {
              if (h.role === 'ai') {
                if (h.isError) {
                  return (
                    <div className="turn fade-in" key={i}>
                      <div
                        style={{
                          padding: '12px 16px',
                          border: '1px dashed var(--ink-12, rgba(0,0,0,0.12))',
                          borderRadius: 8,
                          background: 'var(--paper-2, rgba(0,0,0,0.02))',
                          fontSize: 14,
                          color: 'var(--ink-55, rgba(0,0,0,0.65))',
                          lineHeight: 1.5,
                          maxWidth: 560,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--sans, inherit)',
                            fontSize: 11,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--crimson, #b91c1c)',
                            marginBottom: 6,
                          }}
                        >
                          · Trouble reaching the model
                        </div>
                        {h.text}
                        <button
                          type="button"
                          onClick={() => sendToAI(
                            history
                              .filter((m): m is AIMessage | UserMessage => m.role === 'ai' || m.role === 'user')
                              .filter((m) => !(m.role === 'ai' && (m as AIMessage).isError))
                              .map((m) => ({
                                role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
                                content: m.text,
                              }))
                          )}
                          style={{
                            marginTop: 10,
                            display: 'block',
                            fontFamily: 'var(--sans, inherit)',
                            fontSize: 12,
                            padding: '4px 10px',
                            border: '1px solid var(--ink-12, rgba(0,0,0,0.2))',
                            background: 'transparent',
                            color: 'inherit',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="turn fade-in" key={i}>
                    <div className={`turn-lbl ${h.mode}`}>
                      {h.mode === 'elicit' && '· Elicit'}
                      {h.mode === 'pushback' && '· Pushback'}
                      {h.mode === 'teach' && '· Teach'}
                      {h.mode === 'confirm' && '· Confirm'}
                    </div>
                    {h.mode === 'pushback' && h.pushbackOf && (
                      <div className="pushback-quote">&quot;{h.pushbackOf}&quot;</div>
                    )}
                    <p className="ai-text">{h.text}</p>
                    {h.teach && (
                      <div className="teach-card" style={{ marginTop: 20 }}>
                        <div className="teach-eye">{h.teach.eye}</div>
                        <div className="teach-h">{h.teach.h}</div>
                        <div className="teach-grid">
                          {h.teach.cells.map((c, ci) => (
                            <div className="teach-cell" key={ci} onClick={() => { setInput(c.name); }}>
                              <div className="n">{c.n}</div>
                              <div className="name">{c.name}</div>
                              <div className="body">{c.body}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {h.mode === 'pushback' && <div className="sharpen">sharpening</div>}
                  </div>
                );
              }
              if (h.role === 'user') {
                return (
                  <div className="turn fade-in" key={i}>
                    <div className="turn-lbl">· You</div>
                    <p className="user-text">{h.text}</p>
                  </div>
                );
              }
              return null;
            })}
            {typing && (
              <div className="turn fade-in">
                <div className="turn-lbl">· Thinking</div>
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            )}
          </div>
        </div>

        {!sessionComplete && (
          <div className="s3-composer">
            <div className="s3-composer-inner">
              <textarea
                placeholder="Type anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                disabled={typing}
                rows={1}
              />
              <span className="hint">Enter ↵</span>
              <button onClick={submit} disabled={typing || !input.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>

      <aside className="s3-rail-r">
        <div className="rail-h">Mode</div>
        <div className={`mode-ind ${currentMode}`}>
          <div className="dot" />
          {currentMode === 'elicit' && 'Eliciting'}
          {currentMode === 'pushback' && 'Pushing back'}
          {currentMode === 'teach' && 'Teaching'}
          {currentMode === 'confirm' && 'Confirming'}
        </div>
        <div style={{ height: 24 }} />
        <div className="rail-h">Session</div>
        <div className="rail-t" style={{ marginBottom: 0 }}>
          {Object.keys(state.buckets).length} of {BUCKET_DEFS.length} filled
        </div>

        <div className="escape-card">
          <div className="t">Want me to stop and just spit out a thesis?</div>
          <button onClick={goSkip}>Skip to synthesis →</button>
        </div>
      </aside>
    </div>
  );
}
