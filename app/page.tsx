'use client';

import { useState, useRef } from 'react';
import { SearchCriteria, RankedLead } from '@/lib/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [criteria, setCriteria] = useState<Partial<SearchCriteria> | null>(null);
  const [criteriaComplete, setCriteriaComplete] = useState(false);
  const [leads, setLeads] = useState<RankedLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [searchError, setSearchError] = useState('');
  const historyRef = useRef<Array<{ role: string; content: string }>>([]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    historyRef.current = [...historyRef.current, { role: 'user', content: input }];
    setInput('');

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyRef.current }),
    });

    // Parse SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    const streamingId = (Date.now() + 1).toString();

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

          if (event.type === 'text-delta') {
            assistantText += event.delta;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === streamingId) {
                return [...prev.slice(0, -1), { ...last, content: assistantText }];
              }
              return [...prev, { id: streamingId, role: 'assistant' as const, content: assistantText }];
            });
          } else if (event.type === 'tool-input-available' && event.toolName === 'update_criteria') {
            const { criteriaComplete: complete, criteria: c } = event.input as { criteriaComplete: boolean; criteria: SearchCriteria };
            setCriteria(c);
            if (complete) setCriteriaComplete(true);
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    if (assistantText) {
      historyRef.current = [...historyRef.current, { role: 'assistant', content: assistantText }];
    }
  }

  async function startSearch() {
    if (!criteria) return;
    setSearching(true);
    setSearchError('');
    setStatusMsg('Starting search...');

    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria }),
    });
    const { jobId } = await res.json();

    const poll = setInterval(async () => {
      const s = await fetch(`/api/search/${jobId}/status`).then((r) => r.json());
      setStatusMsg(s.progress?.message || s.status);

      if (s.status === 'complete') {
        clearInterval(poll);
        const r = await fetch(`/api/search/${jobId}/results`).then((r) => r.json());
        setLeads(r.leads ?? []);
        setSearching(false);
      }
      if (s.status === 'failed') {
        clearInterval(poll);
        setSearchError(s.error || 'Search failed. Please try again.');
        setStatusMsg('');
        setSearching(false);
      }
    }, 3000);
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AI Sojo — Deal Sourcing</h1>

      <div className="border rounded p-4 space-y-3 h-80 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block px-3 py-2 rounded-lg text-sm ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-black'}`}>
              {m.content}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="I want to buy a plumbing business in Atlanta..."
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded text-sm">Send</button>
      </form>

      {criteriaComplete && !searching && leads.length === 0 && (
        <button onClick={startSearch} className="w-full bg-green-500 text-white py-2 rounded font-medium">
          Find Leads
        </button>
      )}

      {searching && statusMsg && <p className="text-sm text-gray-400">{statusMsg}</p>}
      {searchError && (
        <div className="bg-red-900 border border-red-700 text-red-200 rounded p-3 text-sm">
          <strong>Search failed:</strong> {searchError}
        </div>
      )}

      {leads.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">{leads.length} Leads Found</h2>
          {leads.map((lead) => (
            <div key={lead.id} className="border rounded p-4 space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">{lead.businessName}</span>
                <span className="text-sm bg-green-100 text-green-800 px-2 py-0.5 rounded">{lead.matchScore}/100</span>
              </div>
              <p className="text-sm text-gray-500">{lead.city}, {lead.state}</p>
              {lead.contact.phone && <p className="text-sm">{lead.contact.phone}</p>}
              {lead.contact.email && <p className="text-sm">{lead.contact.email}</p>}
              {lead.businessDetails.estimatedRevenue && (
                <p className="text-sm text-gray-600">Est. Revenue: {lead.businessDetails.estimatedRevenue}</p>
              )}
              <p className="text-xs text-gray-400 italic">{lead.matchReason}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
