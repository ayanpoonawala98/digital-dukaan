import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { ot } from '../../shared/lib/owner-i18n.js';

// Per-store block list. A blocked number cannot verify or place orders on THIS store. Other stores are not affected.
// Only effective where phone verification is enforced for the store. Owner only.
function useBlocked(token, storeId) {
  const [list, setList] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const base = `/owner/${storeId}/blocked-phones`;
  const load = () => api(base, { token, feedback: false }).then(r => { setList(r.blocked || []); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { setList(null); load(); }, [storeId]);
  const act = fn => async () => { if (busy) return; setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return { list, error, busy, block: phone => act(() => api(base, { token, method: 'POST', body: { phone } })), unblock: phone => act(() => api(`${base}/${encodeURIComponent(phone)}`, { token, method: 'DELETE' })) };
}
const same = (a, b) => String(a).replace(/\D/g, '').slice(-10) === String(b).replace(/\D/g, '').slice(-10);

export function BlockToggle({ token, storeId, phone }) {
  const { list, error, busy, block, unblock } = useBlocked(token, storeId);
  if (!list) return error ? <p className="notice error" role="alert">{ot(error)}</p> : null;
  const entry = list.find(b => same(b.phone, phone));
  return <p>{entry
    ? <><span className="notice warn">{ot("Blocked: this number cannot order from your shop.")}</span> <button type="button" className="btn btn-outline" disabled={busy} onClick={unblock(entry.phone)}>{ot("Unblock")}</button></>
    : <button type="button" className="btn btn-outline" disabled={busy} onClick={block(phone)}>{ot("Block this customer")}</button>}
    {error && <span className="notice error" role="alert"> {ot(error)}</span>}</p>;
}

export function BlockedPhonesPanel({ token, storeId }) {
  const { list, error, busy, block, unblock } = useBlocked(token, storeId);
  const [phone, setPhone] = useState('');
  return <details className="customer-blocked"><summary>{ot("Blocked numbers")}{list ? ` (${list.length})` : ''}</summary>
    <p className="muted">{ot("A blocked number cannot verify or order from this shop. It does not affect other shops. Works where phone verification is on.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}
    <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (!phone.trim()) return; await block(phone.trim())(); setPhone(''); }}>
      <label>{ot("Phone number")}<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" maxLength={25}/></label>
      <button className="btn btn-outline" disabled={busy || !phone.trim()}>{ot("Block")}</button>
    </form>
    {list && list.map(b => <p key={b.id}>{b.phone} <button type="button" className="btn btn-outline" disabled={busy} onClick={unblock(b.phone)}>{ot("Unblock")}</button></p>)}
  </details>;
}
