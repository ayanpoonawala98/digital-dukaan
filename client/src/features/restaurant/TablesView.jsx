import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bike, ShoppingBag, Store, Plus, Minus, Trash2, Printer, X, Clock, Receipt, History, Percent, CircleCheck, Search, Settings2 } from 'lucide-react';
import { api } from '../../shared/lib/api.js';
import './tables.css';

const inr = n => '₹' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const ago = d => { if (!d) return ''; const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return 'just now'; if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d`; };
const when = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const CH = { delivery: ['Delivery', Bike], takeaway: ['Takeaway', ShoppingBag], counter: ['Counter sale', Store] };
const label = s => (s.kind === 'table' ? `Table ${s.n}` : CH[s.kind][0]);
const money = (lines, charges, disc, gst) => {
  const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), ch = charges.reduce((a, c) => a + Number(c.amount || 0), 0);
  let d = disc.type === 'pct' ? sub * Number(disc.value || 0) / 100 : Number(disc.value || 0);
  d = Math.max(0, Math.min(d || 0, sub + ch));
  const taxable = sub + ch - d, half = Math.round(taxable * gst / 200 * 100) / 100;
  return { sub, ch, d, half, total: Math.round(taxable + half * 2) };
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Prints through an isolated iframe holding only the receipt, so mobile browsers never print the app page (which came out blank).
function printReceipt(bill, lines, charges, store, saved) {
  const gst = bill.gstPct, row = (a, b, cls = '') => `<div class="r ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const body = `<h1>${esc(store.name)}</h1><p class="c">${esc(bill.title)}${saved ? ' - Bill #' + esc(bill.billNo) : ''}<br>${esc(new Date(bill.paidAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</p><hr>`
    + lines.map(l => row(`${l.qty} x ${l.name}`, inr(l.qty * l.price))).join('') + '<hr>' + row('Subtotal', inr(bill.subtotal))
    + charges.map(c => row(c.label, inr(c.amount))).join('') + (bill.discount > 0 ? row('Discount', '-' + inr(bill.discount)) : '')
    + (gst > 0 ? row(`CGST ${gst / 2}%`, inr(bill.cgst)) + row(`SGST ${gst / 2}%`, inr(bill.sgst)) : '') + '<hr>' + row('TOTAL', inr(bill.total), 'big')
    + (saved ? `<p class="c">Paid by ${esc(String(bill.paymentMode).toUpperCase())}</p>` : '') + `<p class="c">${store.gstin ? 'GSTIN ' + esc(store.gstin) + '<br>' : ''}Thank you, visit again!</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{margin:0;padding:2mm;width:74mm;font:13px/1.35 "Courier New",monospace;color:#000;background:#fff}h1{font-size:16px;text-align:center;margin:0 0 4px}.c{text-align:center;margin:4px 0}hr{border:0;border-top:1px dashed #000;margin:6px 0}.r{display:flex;justify-content:space-between;gap:8px}.r span:first-child{flex:1;min-width:0;word-break:break-word}.big{font-size:16px;font-weight:700}</style></head><body>${body}</body></html>`;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.print(); } setTimeout(() => f.remove(), 60000); };
  if (doc.readyState === 'complete') setTimeout(go, 150); else f.onload = () => setTimeout(go, 150);
}

function Receipt_({ bill, lines, charges, store, onClose, saved }) {
  const gst = bill.gstPct;
  return <div className="tv-modal" role="dialog" aria-label="Bill" onClick={onClose}><div className="tv-receipt" onClick={e => e.stopPropagation()}>
    <h4>{store.name}</h4>
    <p>{bill.title}{saved ? ` · Bill #${bill.billNo}` : ' · Draft'} · {new Date(bill.paidAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p><hr/>
    {lines.map((l, i) => <div className="r" key={i}><span>{l.qty} × {l.name}</span><span>{inr(l.qty * l.price)}</span></div>)}<hr/>
    <div className="r"><span>Subtotal</span><span>{inr(bill.subtotal)}</span></div>
    {charges.map((c, i) => <div className="r" key={i}><span>{c.label}</span><span>{inr(c.amount)}</span></div>)}
    {bill.discount > 0 && <div className="r"><span>Discount</span><span>-{inr(bill.discount)}</span></div>}
    {gst > 0 && <><div className="r"><span>CGST {gst / 2}%</span><span>{inr(bill.cgst)}</span></div><div className="r"><span>SGST {gst / 2}%</span><span>{inr(bill.sgst)}</span></div></>}<hr/>
    <div className="r big"><span>TOTAL</span><span>{inr(bill.total)}</span></div>
    {saved && <p className="c">Paid by {bill.paymentMode.toUpperCase()}</p>}
    <p className="c">{store.gstin ? `GSTIN ${store.gstin} · ` : ''}Thank you, visit again!</p>
    <div className="tv-cta no-print"><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-green" onClick={() => printReceipt(bill, lines, charges, store, saved)}><Printer size={16}/> Print (80mm)</button></div>
  </div></div>;
}

export default function TablesView({ token, storeId, staffMode = false, canBill = true }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('bill');
  const [edit, setEdit] = useState({ qty: {}, added: [], charges: [], disc: { type: 'flat', value: '' } });
  const [gst, setGst] = useState(() => Number(localStorage.getItem(`dd-gst-${storeId}`) ?? 5));
  const [pick, setPick] = useState('');
  const [pay, setPay] = useState('cash');
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null);
  const base = `/owner/${storeId}`;
  const selRef = useRef(sel); selRef.current = sel;

  const load = useCallback(async () => { try { setData(await api(`${base}/tables`, { token, feedback: false })); setErr(''); } catch (e) { setErr(e.message || 'Could not load tables'); } }, [base, token]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setEdit({ qty: {}, added: [], charges: [], disc: { type: 'flat', value: '' } }); setForm(null); setPick(''); setHist(null); }, [sel?.kind, sel?.n]);

  const orders = useMemo(() => { if (!data || !sel) return []; return sel.kind === 'table' ? (data.tables.find(t => t.number === sel.n)?.orders || []) : (data.channels[sel.kind]?.orders || []); }, [data, sel]);
  const baseLines = useMemo(() => orders.flatMap(o => (o.items || []).map(it => ({ key: `${o.id}|${it.name}`, orderId: o.id, productId: it.productId || null, name: it.name, price: Number(it.price), qty: Number(it.qty) }))), [orders]);
  const lines = useMemo(() => [...baseLines.map(l => ({ ...l, qty: edit.qty[l.key] ?? l.qty })), ...edit.added.map(a => ({ key: 'p' + a.productId, productId: a.productId, name: a.name, price: a.price, qty: a.qty }))].filter(l => l.qty > 0), [baseLines, edit]);
  const m = money(lines, edit.charges, edit.disc, gst);
  const setQty = (l, d) => { if (l.orderId) setEdit(e => ({ ...e, qty: { ...e.qty, [l.key]: Math.max(0, l.qty + d) } })); else setEdit(e => ({ ...e, added: e.added.map(a => a.productId === l.productId ? { ...a, qty: Math.max(0, a.qty + d) } : a) })); };
  const addItem = id => { const p = data.menu.find(x => String(x.id) === String(id)); if (!p) return; setEdit(e => e.added.some(a => a.productId === p.id) ? { ...e, added: e.added.map(a => a.productId === p.id ? { ...a, qty: a.qty + 1 } : a) } : { ...e, added: [...e.added, { productId: p.id, name: p.name, price: Number(p.price), qty: 1 }] }); setPick(''); };
  const payload = () => ({ channel: sel.kind, tableNumber: sel.kind === 'table' ? sel.n : undefined, orderIds: orders.map(o => o.id), lines: lines.map(l => l.orderId ? { orderId: l.orderId, name: l.name, qty: l.qty, productId: l.productId } : { productId: l.productId, qty: l.qty }), charges: edit.charges.map(c => ({ label: c.label, amount: Number(c.amount) })), discount: { type: edit.disc.type, value: Number(edit.disc.value || 0) }, gstPct: gst, paymentMode: pay });
  const draftBill = () => ({ title: label(sel), subtotal: m.sub, discount: m.d, gstPct: gst, cgst: m.half, sgst: m.half, total: m.total, paymentMode: pay });
  const settle = async () => {
    if (busy || !lines.length) return; setBusy(true); setErr('');
    try { const { bill } = await api(`${base}/table-bills`, { token, method: 'POST', body: payload(), feedback: false }); setPreview({ saved: true, bill: { ...bill, title: label(sel) }, lines: bill.lines, charges: bill.charges }); await load(); setSel(null); }
    catch (e) { setErr(e.message || 'Could not save the bill'); } finally { setBusy(false); }
  };
  const openHist = async () => { setTab('history'); setHist(null); try { const q = sel.kind === 'table' ? `channel=table&table=${sel.n}` : `channel=${sel.kind}`; setHist((await api(`${base}/tables/history?${q}`, { token, feedback: false })).bills); } catch (e) { setHist([]); setErr(e.message); } };
  const saveCount = async () => { const n = Number(cfg); if (!Number.isInteger(n) || n < 1 || n > 100) { setErr('Tables must be 1 to 100'); return; } try { await api(`${base}/business`, { token, method: 'PATCH', body: { tableCount: n }, feedback: false }); setCfg(null); await load(); } catch (e) { setErr(e.message); } };

  if (!data) return <div className="tv"><div className="tv-main">{err ? <p className="notice error">{err}</p> : <p className="tv-empty">Loading tables…</p>}</div></div>;
  const occupied = data.tables.filter(t => t.occupied).length, running = data.tables.reduce((s, t) => s + t.total, 0);
  const cur = sel && (sel.kind === 'table' ? data.tables.find(t => t.number === sel.n) : data.channels[sel.kind]);
  const occ = sel && orders.length > 0;
  const since = orders[0]?.createdAt;
  const Panel = sel && <aside className="tv-panel" aria-label={label(sel)}>
    <header><div><span className={`tv-chip ${occ ? 'occ' : 'vac'}`}>{sel.kind === 'table' ? (occ ? 'Occupied' : 'Vacant') : (occ ? 'Open' : 'No open orders')}</span><h3>{label(sel)}</h3>{occ && <small><Clock size={13}/> {ago(since)} · {orders.length} order{orders.length > 1 ? 's' : ''}</small>}</div><button className="tv-x" onClick={() => setSel(null)} aria-label="Close"><X size={18}/></button></header>
    <div className="tv-tabs"><button className={tab === 'bill' ? 'on' : ''} onClick={() => setTab('bill')}><Receipt size={14}/> Bill</button><button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button><button className={tab === 'history' ? 'on' : ''} onClick={openHist}><History size={14}/> History</button></div>
    {tab === 'orders' && <div className="tv-orders">{orders.map(o => <div className="tv-order" key={o.id}><div><strong>Order #{o.orderNumber || o.id}</strong><span className={`tv-st ${o.status}`}>{o.status}</span></div><p>{(o.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}</p>{(o.customerName || o.deliveryAddress) && <small>{[o.customerName, o.customerPhone, o.deliveryAddress].filter(Boolean).join(' · ')}</small>}{o.note && <small>Note: {o.note}</small>}</div>)}{!orders.length && <p className="tv-empty">No open orders. Add items from the Bill tab to start a bill.</p>}</div>}
    {tab === 'history' && <div className="tv-orders"><p className="tv-note">Every billed order stays here and in Sales. Nothing is deleted.</p>{hist === null && <p className="tv-empty">Loading…</p>}{hist?.length === 0 && <p className="tv-empty">No bills yet.</p>}{hist?.map(h => <button className="tv-hist" key={h.id} onClick={() => setPreview({ saved: true, bill: { ...h, title: label(sel) }, lines: h.lines, charges: h.charges })}><strong>#{h.billNo}</strong><span>{when(h.paidAt)} · {h.paymentMode.toUpperCase()}</span><b>{inr(h.total)}</b></button>)}</div>}
    {tab === 'bill' && <div className="tv-bill">
      {canBill && <div className="tv-add"><Search size={15}/><select value={pick} onChange={e => addItem(e.target.value)} aria-label="Add item"><option value="">Add item to bill…</option>{data.menu.map(p => <option key={p.id} value={p.id}>{p.name} · {inr(p.price)}</option>)}</select></div>}
      <ul className="tv-lines">{lines.map(l => <li key={l.key}><span className="n">{l.name}<small>{inr(l.price)} each</small></span><span className="q">{canBill ? <><button onClick={() => setQty(l, -1)} aria-label="Less"><Minus size={14}/></button><b>{l.qty}</b><button onClick={() => setQty(l, 1)} aria-label="More"><Plus size={14}/></button></> : <b>{l.qty}</b>}</span><span className="a">{inr(l.qty * l.price)}</span>{canBill && <button className="rm" onClick={() => setQty(l, -l.qty)} aria-label={`Remove ${l.name}`}><Trash2 size={15}/></button>}</li>)}{!lines.length && <li className="tv-empty">No items yet.</li>}</ul>
      <div className="tv-adj">{edit.charges.map((c, i) => <div key={i}><span>{c.label}</span><b>+ {inr(c.amount)}</b><button onClick={() => setEdit(e => ({ ...e, charges: e.charges.filter((_, j) => j !== i) }))} aria-label="Remove charge"><X size={14}/></button></div>)}{m.d > 0 && <div><span>Discount{edit.disc.type === 'pct' ? ` ${edit.disc.value}%` : ''}</span><b className="neg">− {inr(m.d)}</b><button onClick={() => setEdit(e => ({ ...e, disc: { type: 'flat', value: '' } }))} aria-label="Remove discount"><X size={14}/></button></div>}
        {canBill && !form && <div className="tv-links"><button className="tv-link" onClick={() => setForm({ k: 'charge', label: 'Service charge', v: '' })}><Plus size={13}/> Add charge</button><button className="tv-link" onClick={() => setForm({ k: 'disc', type: 'pct', v: '' })}><Percent size={13}/> Discount</button></div>}
        {form?.k === 'charge' && <form className="tv-form" onSubmit={e => { e.preventDefault(); const a = Number(form.v); if (a > 0) setEdit(x => ({ ...x, charges: [...x.charges, { label: form.label.trim() || 'Charge', amount: a }] })); setForm(null); }}><input aria-label="Charge name" value={form.label} maxLength={40} onChange={e => setForm({ ...form, label: e.target.value })}/><input aria-label="Amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="₹" autoFocus value={form.v} onChange={e => setForm({ ...form, v: e.target.value })}/><button className="btn btn-green btn-small">Add</button><button type="button" className="tv-x" onClick={() => setForm(null)} aria-label="Cancel"><X size={16}/></button></form>}
        {form?.k === 'disc' && <form className="tv-form" onSubmit={e => { e.preventDefault(); const a = Number(form.v); setEdit(x => ({ ...x, disc: { type: form.type, value: a > 0 ? a : '' } })); setForm(null); }}><select aria-label="Discount type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="pct">%</option><option value="flat">₹</option></select><input aria-label="Discount" type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={form.v} onChange={e => setForm({ ...form, v: e.target.value })}/><button className="btn btn-green btn-small">Apply</button><button type="button" className="tv-x" onClick={() => setForm(null)} aria-label="Cancel"><X size={16}/></button></form>}
      </div>
      <div className="tv-sum"><div><span>Subtotal</span><b>{inr(m.sub)}</b></div>{(m.ch > 0 || m.d > 0) && <div><span>Charges − discount</span><b>{m.ch - m.d < 0 ? '− ' + inr(m.d - m.ch) : inr(m.ch - m.d)}</b></div>}{gst > 0 && <><div><span>CGST {gst / 2}%</span><b>{inr(m.half)}</b></div><div><span>SGST {gst / 2}%</span><b>{inr(m.half)}</b></div></>}<div className="t"><span>Total</span><b>{inr(m.total)}</b></div></div>
      <div className="tv-gst">GST <select value={gst} onChange={e => { setGst(+e.target.value); localStorage.setItem(`dd-gst-${storeId}`, e.target.value); }}>{[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}</select>{canBill && <span className="tv-pay" role="group" aria-label="Payment mode">{['cash', 'upi', 'card'].map(p => <button key={p} type="button" className={pay === p ? 'on' : ''} onClick={() => setPay(p)}>{p.toUpperCase()}</button>)}</span>}</div>
      {err && <p className="notice error">{err}</p>}
      <div className="tv-cta"><button className="btn btn-outline" disabled={!lines.length} onClick={() => setPreview({ saved: false, bill: draftBill(), lines, charges: edit.charges.map(c => ({ label: c.label, amount: c.amount })) })}><Printer size={16}/> Print bill</button>{canBill && <button className="btn btn-green" disabled={busy || !lines.length} onClick={settle}><CircleCheck size={16}/> {busy ? 'Saving…' : sel.kind === 'table' ? 'Paid · vacate table' : 'Paid · close bill'}</button>}</div>
    </div>}
  </aside>;
  return <div className={`tv ${sel ? 'has-sel' : ''}`}>
    <div className="tv-main">
      {err && !sel && <p className="notice error">{err}</p>}
      <div className="tv-stats"><div><b>{occupied}</b><span>Occupied</span></div><div><b>{data.tables.length - occupied}</b><span>Vacant</span></div><div><b>{inr(running)}</b><span>Running bills</span></div><div className="tv-legend"><i className="g"/> Vacant <i className="r"/> Occupied</div></div>
      <h4 className="tv-h">Order channels</h4>
      <div className="tv-channels">{Object.entries(CH).map(([k, [n, Icon]]) => { const c = data.channels[k]; return <button key={k} className={`tv-ch ${sel?.kind === k ? 'sel' : ''}`} onClick={() => { setSel({ kind: k }); setTab('bill'); }}><Icon size={20}/><span><strong>{n}</strong><small>{c.open ? `${c.open} open · ${inr(c.total)}` : k === 'counter' ? 'Tap to bill a walk-in' : 'No open orders'}</small></span></button>; })}</div>
      <h4 className="tv-h">Dine-in tables{!staffMode && <button className="tv-link tv-cfg" onClick={() => setCfg(String(data.tableCount))}><Settings2 size={13}/> {data.tableCount} tables</button>}</h4>
      {cfg !== null && <form className="tv-form tv-cfgform" onSubmit={e => { e.preventDefault(); saveCount(); }}><label>Number of tables<input type="number" min="1" max="100" value={cfg} onChange={e => setCfg(e.target.value)}/></label><button className="btn btn-green btn-small">Save</button><button type="button" className="tv-x" onClick={() => setCfg(null)} aria-label="Cancel"><X size={16}/></button></form>}
      {!data.tables.length && <p className="tv-empty">No tables set up yet.</p>}
      <div className="tv-grid">{data.tables.map(t => <button key={t.number} className={`tv-table ${t.occupied ? 'occ' : 'vac'} ${sel?.kind === 'table' && sel.n === t.number ? 'sel' : ''}`} onClick={() => { setSel({ kind: 'table', n: t.number }); setTab('bill'); }}><span className="no">{t.number}</span><span className="st">{t.occupied ? 'Occupied' : 'Vacant'}</span>{t.occupied ? <><b>{inr(t.total)}</b><small>{ago(t.since)}</small></> : <small>Tap to open</small>}</button>)}</div>
    </div>
    {Panel}
    {preview && <Receipt_ {...preview} store={data} onClose={() => setPreview(null)}/>}
  </div>;
}
