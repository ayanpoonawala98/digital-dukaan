import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useEffect, useState } from 'react';
import { api, inr } from '../../shared/lib/api.js';
import Busy from '../../shared/components/Busy.jsx';

// Owner/staff-entered order (phone / walk-in, no storefront). Lands in the Orders list like a customer order.
export default function ManualLeadOrder({ token, storeId, storeType, onCreated }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [rows, setRows] = useState([{ id: '', qty: 1 }]);

  useEffect(() => {
    if (!open || products.length || loadError) return;
    let stale = false;
    api(`/owner/${storeId}/products?pageSize=200`, { token, feedback: false })
      .then(r => { if (!stale) setProducts((r.products || []).filter(p => p.active !== false)); })
      .catch(e => { if (!stale) setLoadError(e.message); });
    return () => { stale = true; };
  }, [open, storeId, token]);

  const byId = new Map(products.map(p => [String(p.id), p]));
  const total = rows.reduce((s, r) => s + (byId.get(String(r.id))?.price || 0) * (Number(r.qty) || 0), 0);
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const reset = () => { setCustomerName(''); setCustomerPhone(''); setRows([{ id: '', qty: 1 }]); setError(''); };

  const submit = async e => {
    e.preventDefault();
    const items = rows.filter(r => r.id && Number(r.qty) > 0).map(r => ({ id: Number(r.id), qty: Number(r.qty) }));
    if (!items.length) { setError(ot('Add at least one item')); return; }
    setBusy(true); setError('');
    try {
      await api(`/owner/${storeId}/leads`, { method: 'POST', token, feedback: false, body: { customerName, customerPhone, items } });
      reset(); setOpen(false); onCreated?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (storeType !== 'retail') return null; // service exposure held: retail only for now
  if (!open) return <button type="button" className="btn btn-green btn-small" onClick={() => setOpen(true)}>{ot("Add order")}</button>;
  return <form className="manual-order-form" onSubmit={submit}>
    <h4>{ot("Add an order yourself")}</h4>
    <p className="muted">{ot("For phone or walk-in customers. The order lands in this list like any customer order.")}</p>
    {rows.map((r, i) => <div key={i} className="manual-order-row" style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={r.id} onChange={e => setRow(i, { id: e.target.value })} required>
        <option value="">{ot("Choose a product")}</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name} - {inr(p.price)}{p.stock !== null && p.stock !== undefined ? ` (${p.stock})` : ''}</option>)}
      </select>
      <input type="number" min="1" max="99" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} style={{ width: 70 }} aria-label={ot("Qty")}/>
      {rows.length > 1 && <button type="button" className="btn btn-outline btn-small" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>{ot("Remove")}</button>}
    </div>)}
    <p><button type="button" className="btn btn-outline btn-small" onClick={() => setRows(rs => [...rs, { id: '', qty: 1 }])}>{ot("Add item")}</button></p>
    <p><label style={{ display: 'block' }}>{ot("Customer name (optional)")}<input value={customerName} maxLength={100} onChange={e => setCustomerName(e.target.value)} style={{ display: 'block', marginTop: 4 }}/></label></p>
    <p><label style={{ display: 'block' }}>{ot("Customer phone (optional)")}<input value={customerPhone} maxLength={20} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 ..." style={{ display: 'block', marginTop: 4 }}/></label></p>
    <p><strong>{ot("Total")}: {inr(total)}</strong></p>
    {loadError && <p className="notice error">{loadError}</p>}
    {error && <p className="notice error">{error}</p>}
    <p>
      <button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy ? ot("Saving...") : ot("Save order")}</Busy></button>{' '}
      <button type="button" className="btn btn-outline" onClick={() => { reset(); setOpen(false); }}>{ot("Cancel")}</button>
    </p>
  </form>;
}
