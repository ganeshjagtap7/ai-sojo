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
}
interface UserMessage { role: 'user'; text: string; }
type ConvoItem = AIMessage | UserMessage | { role: 'user-pushback-of'; text: string };

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

export function Stage3Converse() {
  const { state, dispatch } = useFlow();
  const [history, setHistory] = useState<ConvoItem[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(true);
  const [currentMode, setCurrentMode] = useState<Mode>('elicit');
  const [activeBucket, setActiveBucket] = useState<BucketKey>('opening');
  const [sessionComplete, setSessionComplete] = useState(false);
  const convoRef = useRef<HTMLDivElement>(null);
  const sentOpenerRef = useRef(false);

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, [history, typing]);

  // Seed with the hardcoded opener. /api/chat won't accept empty messages, and
  // the opener is deterministic anyway — no reason to round-trip to the model.
  useEffect(() => {
    if (sentOpenerRef.current) return;
    sentOpenerRef.current = true;
    setHistory([{ role: 'ai', text: OPENER_TEXT, mode: 'elicit' }]);
    setTyping(false);
  }, []);

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
            if (ev.type === 'text-delta' && typeof ev.delta === 'string') {
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

      if (streamError && !opened) {
        setHistory((h) => [...h, { role: 'ai', text: `(error: ${streamError})`, mode: 'elicit' } as AIMessage]);
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
          return [
            ...h.slice(0, -1),
            {
              ...last,
              mode: lastTool!.mode ?? last.mode,
              teach: lastTool!.teachCard ?? undefined,
              pushbackOf: lastTool!.pushbackOf ?? undefined,
            } as AIMessage,
          ];
        });
        if (lastTool.sessionComplete) setSessionComplete(true);
      }
    } catch (err) {
      setHistory((h) => [...h, { role: 'ai', text: `(network error: ${err instanceof Error ? err.message : 'unknown'})`, mode: 'elicit' } as AIMessage]);
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
      </aside>

      <div className="s3-main">
        <div className="s3-convo" ref={convoRef}>
          <div className="s3-convo-inner">
            {history.map((h, i) => {
              if (h.role === 'ai') {
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
