import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { ot } from '../../shared/lib/owner-i18n.js';
import { normalizePhone } from '../../shared/lib/phone-verify.js';

// Per-store block list. A blocked number cannot verify or place orders on THIS store. Other stores are not affected.
// Only effective where phone verification is enforced for the store. Owner only.
// Exact match on the full normalized international number (same rule as the server). Never compare a suffix: +1 and +91 numbers can share 10 digits.
export const samePhone = (a, b) => { const x = normalizePhone(a); return Boolean(x) && x === normalizePhone(b); };

// Every mounted view of the list reloads when any of them changes it (detail view and Customers panel stay in step).
const bus = new EventTarget();
function useBlocked(token, storeId) {
  const [list, setList] = useState(null), [truncated, setTruncated] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const gen = useRef(0), base = `/owner/${storeId}/blocked-phones`;
  const load = () => { const g = ++gen.current; return api(base, { token, feedback: false }).then(r => { if (g !== gen.current) return; setList(r.blocked || []); setTruncated(Boolean(r.truncated)); setError(''); }).catch(e => { if (g === gen.current) setError(e.message); }); };
  useEffect(() => { setList(null); setTruncated(false); load(); const on = () => load(); bus.addEventListener('changed', on); return () => { gen.current++; bus.removeEventListener('changed', on); }; }, [storeId, token]);
  // Resolves true only when the change was saved, so callers can keep what the owner typed after a failure.
  const act = async fn => { if (busy) return false; setBusy(true); setError(''); try { await fn(); bus.dispatchEvent(new Event('changed')); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); } };
  return { list, truncated, error, busy,
    block: phone => act(() => api(base, { token, method: 'POST', body: { phone } })),
    unblock: phone => act(() => api(`${base}/${encodeURIComponent(phone)}`, { token, method: 'DELETE' })) };
}

export function BlockToggle({ token, storeId, phone }) {
  const { list, error, busy, block, unblock } = useBlocked(token, storeId);
  if (!list) return error ? <p className="notice error" role="alert">{ot(error)}</p> : null;
  const entry = list.find(b => samePhone(b.phone, phone));
  return <div>{entry
    ? <p><span className="notice warn">{ot("Blocked: this number cannot order from your shop.")}</span> <button type="button" className="btn btn-outline" disabled={busy} onClick={() => unblock(entry.phone)}>{ot("Unblock")}</button></p>
    : <p><button type="button" className="btn btn-outline" disabled={busy} onClick={() => block(phone)}>{ot("Block this customer")}</button></p>}
    <p className="muted">{ot("A blocked number cannot verify or order from this shop. It does not affect other shops. Works where phone verification is on.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}</div>;
}

export function BlockedPhonesPanel({ token, storeId }) {
  const { list, truncated, error, busy, block, unblock } = useBlocked(token, storeId);
  const [phone, setPhone] = useState('');
  return <details className="customer-blocked"><summary>{ot("Blocked numbers")}{list ? ` (${list.length}${truncated ? '+' : ''})` : ''}</summary>
    <p className="muted">{ot("A blocked number cannot verify or order from this shop. It does not affect other shops. Works where phone verification is on.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}
    <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (!phone.trim()) return; if (await block(phone.trim())) setPhone(''); }}>
      <label>{ot("Phone number")}<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" maxLength={25}/></label>
      <button className="btn btn-outline" disabled={busy || !phone.trim()}>{ot("Block")}</button>
    </form>
    {list && list.map(b => <p key={b.id}>{b.phone} <button type="button" className="btn btn-outline" disabled={busy} onClick={() => unblock(b.phone)}>{ot("Unblock")}</button></p>)}
    {truncated && <p className="notice warn">{ot("Showing the 500 most recent blocked numbers. Older ones are still blocked.")}</p>}
  </details>;
}
