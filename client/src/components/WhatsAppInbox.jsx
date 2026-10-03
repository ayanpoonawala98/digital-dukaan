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

  return <section aria-label="WhatsApp inbox" style={{ marginTop: 18 }}>
    <h4>Inbox</h4>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(240px,340px) 1fr', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', height: 'min(70vh, 640px)', minHeight: 360, gridTemplateRows: 'minmax(0, 1fr)' }} className="wa-inbox">
      <div style={{ borderRight: '1px solid var(--line)', display: narrow && active ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 10 }}><input aria-label="Search by number" placeholder="Search by number" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%' }} /></div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && !convs.length && <p style={{ padding: 12 }} role="status">Loading conversations...</p>}
          {!loading && !convs.length && <p style={{ padding: 12 }}>{q ? 'No conversation matches.' : 'No conversations yet. They appear when a customer messages your shop number.'}</p>}
          {convs.map(c => <button key={c.phone} onClick={() => open(c)} aria-current={active?.phone === c.phone} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 0, borderBottom: '1px solid var(--line)', background: active?.phone === c.phone ? 'var(--card-2, rgba(0,0,0,.05))' : 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(c)}</strong><small>{fmtTime(c.lastAt)}</small></span>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}><small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: .75 }}>{c.lastDirection === 'outbound' ? 'You: ' : ''}{c.lastText}</small>{c.unread > 0 && <span aria-label={`${c.unread} unread`} style={{ background: '#128c4a', color: '#fff', borderRadius: 999, minWidth: 20, padding: '0 6px', textAlign: 'center', fontSize: 12, lineHeight: '20px' }}>{c.unread > 99 ? '99+' : c.unread}</span>}</span>
          </button>)}
          {next && <button className="btn" style={{ margin: 10 }} onClick={() => loadList(false, next)}>Load more conversations</button>}
        </div>
      </div>
      <div style={{ display: narrow && !active ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!active ? <p style={{ padding: 20, opacity: .7 }}>Select a conversation to read and reply.</p> : <>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center' }}>{narrow && <button className="btn" onClick={() => { gen.current++; setActive(null); }}>Back</button>}<strong>{label(active)}</strong></div>
          <div ref={scroller} style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {older && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => loadThread(active.phone, { before: older })}>Load older messages</button>}
            {msgs.map(m => <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '78%', background: m.direction === 'outbound' ? 'rgba(18,140,74,.14)' : 'rgba(0,0,0,.06)', borderRadius: 12, padding: '8px 12px' }}>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</div>
              <small style={{ opacity: .65 }}>{new Date(m.eventAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{m.direction === 'outbound' ? ` · ${m.status}` : ''}{m.errorCode ? ` (${m.errorCode})` : ''}</small>
            </div>)}
            
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: 10 }}>
            {!canSend ? <small>Replies are not enabled for this shop yet.</small> : !open24 && active.loaded ? <small>This customer has not messaged in the last 24 hours, so a free reply is not possible. Ask them to message the shop first.</small> :
              <div style={{ display: 'flex', gap: 8 }}><textarea aria-label="Reply message" value={text} onChange={e => setText(e.target.value)} maxLength={4096} rows={2} style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} /><button className="btn" disabled={sending || !text.trim()} onClick={send}>{sending ? 'Sending...' : 'Send'}</button></div>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}
