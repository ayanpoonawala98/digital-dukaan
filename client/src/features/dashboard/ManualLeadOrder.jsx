import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, inr } from '../../shared/lib/api.js';
import Busy from '../../shared/components/Busy.jsx';

// Owner/staff-entered order (phone / walk-in, no storefront). Opens as a popup over the Orders
// list so the list stays put; lands in the Orders list like a customer order.
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

  const close = () => { setOpen(false); setCustomerName(''); setCustomerPhone(''); setRows([{ id: '', qty: 1 }]); setError(''); };
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const byId = new Map(products.map(p => [String(p.id), p]));
  const total = rows.reduce((s, r) => s + (byId.get(String(r.id))?.price || 0) * (Number(r.qty) || 0), 0);
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async e => {
    e.preventDefault();
    const items = rows.filter(r => r.id && Number(r.qty) > 0).map(r => ({ id: Number(r.id), qty: Number(r.qty) }));
    if (!items.length) { setError(ot('Add at least one item')); return; }
    setBusy(true); setError('');
    try {
      await api(`/owner/${storeId}/leads`, { method: 'POST', token, feedback: false, body: { customerName, customerPhone, items } });
      close(); onCreated?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (storeType !== 'retail') return null; // service exposure held: retail only for now
  if (!open) return <button type="button" className="btn btn-green btn-small" onClick={() => setOpen(true)}>{ot("Add order")}</button>;
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={ot("Add an order yourself")} onClick={close}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <button type="button" className="modal-close" aria-label={ot("Close")} onClick={close}><X/></button>
      <h2>{ot("Add an order yourself")}</h2>
      <p className="muted" style={{ marginTop: -12 }}>{ot("For phone or walk-in customers. The order lands in this list like any customer order.")}</p>
      <form onSubmit={submit}>
        {rows.map((r, i) => <div key={i} className="manual-order-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={r.id} onChange={e => setRow(i, { id: e.target.value })} required style={{ flex: '1 1 220px' }}>
            <option value="">{ot("Choose a product")}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} - {inr(p.price)}{p.stock !== null && p.stock !== undefined ? ` (${p.stock})` : ''}</option>)}
          </select>
          <input type="number" min="1" max="99" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} style={{ width: 70 }} aria-label={ot("Qty")}/>
          {rows.length > 1 && <button type="button" className="btn btn-outline btn-small" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>{ot("Remove")}</button>}
        </div>)}
        <div><button type="button" className="btn btn-outline btn-small" onClick={() => setRows(rs => [...rs, { id: '', qty: 1 }])}>{ot("Add item")}</button></div>
        <label style={{ display: 'block' }}>{ot("Customer name (optional)")}<input value={customerName} maxLength={100} onChange={e => setCustomerName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}/></label>
        <label style={{ display: 'block' }}>{ot("Customer phone (optional)")}<input value={customerPhone} maxLength={20} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 ..." style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}/></label>
        <strong>{ot("Total")}: {inr(total)}</strong>
        {loadError && <p className="notice error">{loadError}</p>}
        {error && <p className="notice error">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy ? ot("Saving...") : ot("Save order")}</Busy></button>
          <button type="button" className="btn btn-outline" onClick={close}>{ot("Cancel")}</button>
        </div>
      </form>
    </div>
  </div>;
}
