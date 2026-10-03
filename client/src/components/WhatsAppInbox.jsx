import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const fmtTime = iso => {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const initial = c => (c.name ? c.name.trim()[0] : '#').toUpperCase();
const dayLabel = iso => { const d = new Date(iso), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Today'; const y = new Date(n); y.setDate(n.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }); };
const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const GREEN = '#128c4a';
const Avatar = ({ c, size = 40 }) => <span aria-hidden="true" style={{ flex: '0 0 auto', width: size, height: size, borderRadius: '50%', background: 'rgba(18,140,74,.14)', color: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * .42 }}>{initial(c)}</span>;
const label = c => c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`;
const windowOpen = msgs => { const last = [...msgs].reverse().find(m => m.direction === 'inbound'); return Boolean(last) && Date.now() - new Date(last.eventAt).getTime() < 24 * 60 * 60 * 1000; };

export default function WhatsAppInbox({ token, root, canSend }) {
  const [convs, setConvs] = useState([]), [next, setNext] = useState(null), [q, setQ] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [active, setActive] = useState(null), [msgs, setMsgs] = useState([]), [older, setOlder] = useState(null), [text, setText] = useState(''), [sending, setSending] = useState(false);
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 700);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 700); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const bottom = useRef(null), scroller = useRef(null), gen = useRef(0), activeRef = useRef(null);
  activeRef.current = active;

  const loadList = useCallback(async (reset = true, before = null) => {
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (q.trim()) params.set('q', q.trim());
      if (before) params.set('before', before);
      const data = await api(`${root}/conversations?${params}`, { token });
      setConvs(prev => reset ? data.conversations : [...prev, ...data.conversations]);
      setNext(data.nextBefore); setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [root, token, q]);

  const loadThread = useCallback(async (phone, { before = null, mark = true } = {}) => {
    const g = gen.current;
    try {
      const params = new URLSearchParams({ phone, limit: '40' });
      if (before) params.set('before', before);
      const data = await api(`${root}/thread?${params}`, { token });
      if (g !== gen.current) return;
      setMsgs(prev => before ? [...data.messages, ...prev] : data.messages);
      if (before || !activeRef.current?.loaded) setOlder(data.nextBefore);
      if (!before && mark) { await api(`${root}/read`, { token, method: 'POST', body: { phone } }); setConvs(cs => cs.map(c => c.phone === phone ? { ...c, unread: 0 } : c)); }
    } catch (e) { setError(e.message); }
  }, [root, token]);

  useEffect(() => { setLoading(true); const t = setTimeout(() => loadList(true), q ? 300 : 0); return () => clearTimeout(t); }, [loadList, q]);
  useEffect(() => { // light polling while the tab is visible
    const id = setInterval(() => { if (document.visibilityState === 'visible') { loadList(true); if (activeRef.current) loadThread(activeRef.current.phone, { mark: true }); } }, 20000);
    return () => clearInterval(id);
  }, [loadList, loadThread]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs.length, active?.phone]);

  function open(c) { gen.current++; setActive({ ...c, loaded: false }); setMsgs([]); setOlder(null); setText(''); loadThread(c.phone).then(() => setActive(a => a && { ...a, loaded: true })); }
  async function send() {
    if (!active || sending || !text.trim()) return;
    setSending(true); setError('');
    try {
      const r = await api(`${root}/send`, { token, method: 'POST', body: { to: active.phone, text: text.trim(), requestId: crypto.randomUUID() } });
      setText('');
      if (r.message?.status === 'unknown' || r.message?.status === 'submitting') setError('Delivery is unconfirmed. Check the thread before sending again.');
      await loadThread(active.phone, { mark: true }); loadList(true);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  }
  const open24 = windowOpen(msgs);

  const title = c => c.name || `+${c.phone}`;
  const rows = []; let lastDay = '';
  for (const m of msgs) { const d = dayLabel(m.eventAt); if (d !== lastDay) { rows.push({ sep: d, key: 'sep-' + m.id }); lastDay = d; } rows.push({ m, key: m.id }); }
  const line = '1px solid var(--line)';
  return <section aria-label="WhatsApp inbox" style={{ marginTop: 28 }}>
    <h4 style={{ margin: '0 0 12px' }}>Inbox</h4>
    {error && <p className="notice error" role="alert" style={{ margin: '0 0 12px' }}>{error}</p>}
    <div className="wa-inbox" style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(260px,340px) 1fr', gridTemplateRows: 'minmax(0, 1fr)', border: line, borderRadius: 16, overflow: 'hidden', height: 'min(72vh, 660px)', minHeight: 380, background: 'var(--card)' }}>
      <div style={{ borderRight: narrow ? 0 : line, display: narrow && active ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: line }}><input type="search" aria-label="Search by number" placeholder="Search by number" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 999, margin: 0 }} /></div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading && !convs.length && <p style={{ padding: 18, margin: 0, textAlign: 'center', opacity: .7 }} role="status">Loading conversations...</p>}
          {!loading && !convs.length && <p style={{ padding: 18, margin: 0, textAlign: 'center', opacity: .7 }}>{q ? 'No conversation matches.' : 'No conversations yet. They appear when a customer messages your shop number.'}</p>}
          {convs.map(c => { const on = active?.phone === c.phone; return <button key={c.phone} onClick={() => open(c)} aria-current={on} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '12px 14px', border: 0, borderBottom: line, borderLeft: `3px solid ${on ? GREEN : 'transparent'}`, background: on ? 'rgba(18,140,74,.08)' : 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <Avatar c={c} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(c)}</strong><small style={{ flex: '0 0 auto', opacity: .65, color: c.unread > 0 ? GREEN : undefined }}>{fmtTime(c.lastAt)}</small></span>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: .72 }}>{c.lastDirection === 'outbound' ? 'You: ' : ''}{c.lastText.replace(/\s+/g, ' ')}</small>{c.unread > 0 && <span aria-label={`${c.unread} unread`} style={{ flex: '0 0 auto', background: GREEN, color: '#fff', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', textAlign: 'center', fontSize: 12, lineHeight: '20px', fontWeight: 600 }}>{c.unread > 99 ? '99+' : c.unread}</span>}</span>
            </span>
          </button>; })}
          {next && <div style={{ padding: 12, textAlign: 'center' }}><button className="btn" onClick={() => loadList(false, next)}>Load more conversations</button></div>}
        </div>
      </div>
      <div style={{ display: narrow && !active ? 'none' : 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'rgba(0,0,0,.025)' }}>
        {!active ? <div style={{ margin: 'auto', padding: 24, textAlign: 'center', opacity: .65 }}>Select a conversation to read and reply.</div> : <>
          <div style={{ padding: '10px 16px', borderBottom: line, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--card)' }}>
            {narrow && <button className="btn" onClick={() => { gen.current++; setActive(null); }}>Back</button>}
            <Avatar c={active} size={36} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(active)}</strong>{active.name && <small style={{ opacity: .65 }}>+{active.phone}</small>}</span>
          </div>
          <div ref={scroller} style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {older && <button className="btn" style={{ alignSelf: 'center', marginBottom: 8 }} onClick={() => loadThread(active.phone, { before: older })}>Load older messages</button>}
            {rows.map(r => r.sep ? <div key={r.key} style={{ alignSelf: 'center', margin: '10px 0 4px', padding: '3px 12px', borderRadius: 999, background: 'rgba(0,0,0,.07)', fontSize: 12, opacity: .8 }}>{r.sep}</div> : (() => { const m = r.m, out = m.direction === 'outbound'; return <div key={r.key} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: 'min(78%, 520px)', background: out ? '#d9f3e3' : 'var(--card)', border: out ? '1px solid rgba(18,140,74,.18)' : line, borderRadius: out ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '8px 12px 6px' }}>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{m.text}</div>
              <div style={{ textAlign: 'right', marginTop: 3 }}><small style={{ opacity: .6, fontSize: 11 }}>{clock(m.eventAt)}{out ? ` · ${m.status}` : ''}{m.errorCode ? ` (${m.errorCode})` : ''}</small></div>
            </div>; })())}
          </div>
          <div style={{ borderTop: line, padding: 12, background: 'var(--card)' }}>
            {!canSend ? <small style={{ opacity: .7 }}>Replies are not enabled for this shop yet.</small> : !open24 && active.loaded ? <small style={{ opacity: .75 }}>This customer has not messaged in the last 24 hours, so a free reply is not possible. Ask them to message the shop first.</small> :
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}><textarea aria-label="Reply message" placeholder="Type a reply" value={text} onChange={e => setText(e.target.value)} maxLength={4096} rows={2} style={{ flex: 1, margin: 0, resize: 'none', borderRadius: 12, padding: '10px 12px', boxSizing: 'border-box' }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} /><button className="btn" style={{ margin: 0, height: 44 }} disabled={sending || !text.trim()} onClick={send}>{sending ? 'Sending...' : 'Send'}</button></div>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}
