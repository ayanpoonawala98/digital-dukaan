import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bike, ShoppingBag, Store, Plus, Minus, Trash2, Printer, X, Clock, Receipt, History, Percent, CircleCheck, Search, Settings2 } from 'lucide-react';
import { api } from '../../shared/lib/api.js';
import { lineText } from './MenuBits.jsx';
import { gstView, billMoney } from './gst.js';
import './tables.css';

const inr = n => '₹' + (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const ago = d => { if (!d) return ''; const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return ot('just now'); if (m < 60) return ot('{mins} min', {mins:m}); const h = Math.floor(m / 60); return h < 24 ? ot('{hours} h {mins} min', {hours:h,mins:m%60}) : ot('{days} d', {days:Math.floor(h/24)}); };
const when = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const CH = { delivery: ['Delivery', Bike], takeaway: ['Takeaway', ShoppingBag], counter: ['Counter sale', Store] };
const label = s => s.kind === 'table' ? ot('Table {v0}', {v0:s.n}) : ot(CH[s.kind][0]);
const opt = l => [lineText(l), l.note && `Note: ${l.note}`].filter(Boolean).join(' ');
const paidText = b => Array.isArray(b.payments) && b.payments.length > 1 ? 'Paid: ' + b.payments.map(p => `${String(p.mode).toUpperCase()} ${inr(p.amount)}`).join(', ') : `Paid by ${String(b.paymentMode === 'split' ? 'split' : b.paymentMode).toUpperCase()}`;
const billText = (bill, lines, charges, store) => {
  const rows = [store.name, ...shopLines(store), `${bill.title} - Bill #${bill.billNo}`, new Date(bill.paidAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }), ''];
  for (const l of lines) rows.push(`${l.qty} x ${l.name}${opt(l) ? ' ' + opt(l) : ''} - ${inr(l.qty * l.price)}`);
  rows.push('', `Subtotal: ${inr(bill.subtotal)}`);
  for (const c of charges) rows.push(`${c.label}: ${inr(c.amount)}`);
  if (bill.discount > 0) rows.push(`Discount: -${inr(bill.discount)}`);
  if (bill.gstPct > 0) rows.push(`CGST ${bill.gstPct / 2}%: ${inr(bill.cgst)}${bill.gstMode === 'inclusive' ? ot(' (incl.)') : ''}`, `SGST ${bill.gstPct / 2}%: ${inr(bill.sgst)}${bill.gstMode === 'inclusive' ? ot(' (incl.)') : ''}`);
  if (Number(bill.roundOff)) rows.push(`Round off: ${Number(bill.roundOff) > 0 ? '+' : '-'}${inr(Math.abs(bill.roundOff))}`);
  rows.push(`Total: ${inr(bill.total)}`, paidText(bill));
  rows.push('', 'Thank you, visit again!');
  return rows.join('\n');
};
// Receipt header lines shared by the on-screen bill, the printout and the WhatsApp text.
const shopLines = store => [store.address, store.phone ? `Ph: ${store.phone}` : '', store.gstin ? `GSTIN ${store.gstin}` : ''].filter(Boolean);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Prints through an isolated iframe holding only the receipt, so mobile browsers never print the app page (which came out blank).
function printReceipt(bill, lines, charges, store, saved) {
  const gst = bill.gstPct, incl = bill.gstMode === 'inclusive', row = (a, b, cls = '') => `<div class="r ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const body = `<h1>${esc(store.name)}</h1>${shopLines(store).length ? `<p class="c">${shopLines(store).map(esc).join('<br>')}</p>` : ''}<p class="c">${esc(bill.title)}${saved ? ' - Bill #' + esc(bill.billNo) : ''}<br>${esc(new Date(bill.paidAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</p><hr>`
    + lines.map(l => row(`${l.qty} x ${l.name}`, inr(l.qty * l.price)) + (opt(l) ? `<div class="o">${esc(opt(l))}</div>` : '')).join('') + '<hr>' + row('Subtotal', inr(bill.subtotal))
    + charges.map(c => row(c.label, inr(c.amount))).join('') + (bill.discount > 0 ? row('Discount', '-' + inr(bill.discount)) : '')
    + (gst > 0 ? row(`CGST ${gst / 2}%${incl ? ' (incl.)' : ''}`, inr(bill.cgst)) + row(`SGST ${gst / 2}%${incl ? ' (incl.)' : ''}`, inr(bill.sgst)) : '') + (Number(bill.roundOff) ? row('Round off', (bill.roundOff > 0 ? '+' : '-') + inr(Math.abs(bill.roundOff))) : '') + '<hr>' + row('TOTAL', inr(bill.total), 'big')
    + (saved ? `<p class="c">${paidText(bill)}</p>` : '') + '<p class="c">Thank you, visit again!</p>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{margin:0;padding:2mm;width:74mm;font:13px/1.35 "Courier New",monospace;color:#000;background:#fff}h1{font-size:16px;text-align:center;margin:0 0 4px}.c{text-align:center;margin:4px 0}hr{border:0;border-top:1px dashed #000;margin:6px 0}.r{display:flex;justify-content:space-between;gap:8px}.r span:first-child{flex:1;min-width:0;word-break:break-word}.big{font-size:16px;font-weight:700}.o{padding-left:10px;font-size:11px}</style></head><body>${body}</body></html>`;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:200mm;border:0';
  document.body.appendChild(f);
  const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.print(); } setTimeout(() => f.remove(), 60000); };
  if (doc.readyState === 'complete') setTimeout(go, 150); else f.onload = () => setTimeout(go, 150);
}


function NewOrder({ kind, table, menu, base, token, onClose, onDone, addTo }) {
  const [f, setF] = useState({ name: '', phone: '', address: '', note: '' });
  const [qty, setQty] = useState({});
  const [vr, setVr] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = menu.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  const picked = menu.filter(m => qty[m.id] > 0);
  const vprice = m => { const vs = Array.isArray(m.variants) ? m.variants : []; if (!vs.length) return Number(m.price); return Number((vs.find(v => v.name === (vr[m.id] || vs[0].name)) || vs[0]).price); };
  const total = picked.reduce((a, m) => a + vprice(m) * qty[m.id], 0);
  const bump = (id, d) => setQty(v => ({ ...v, [id]: Math.max(0, Math.min(99, (v[id] || 0) + d)) }));
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api(addTo ? `${base}/restaurant-orders/${addTo.id}/items` : `${base}/restaurant-orders`, { token, method: 'POST', feedback: false, body: addTo ? { items: picked.map(m => ({ id: m.id, qty: qty[m.id], variant: (m.variants && m.variants.length) ? (vr[m.id] || m.variants[0].name) : undefined })) } : { orderType: kind === 'table' ? 'dine-in' : kind, tableNumber: kind === 'table' ? table : undefined, customerName: f.name, customerPhone: f.phone, deliveryAddress: f.address, note: f.note, items: picked.map(m => ({ id: m.id, qty: qty[m.id], variant: (m.variants && m.variants.length) ? (vr[m.id] || m.variants[0].name) : undefined })) } });
      onDone();
    } catch (e) { setErr(ot(e.message || 'Could not create the order')); setBusy(false); }
  };
  const title = addTo ? ot('Add items - Order #{id}', {id:addTo.orderNumber || addTo.id}) : kind === 'table' ? ot('New order - Table {table}', {table}) : ot('New {type} order', {type:ot(CH[kind]?.[0] || kind)});
  return <div className="tv-modal" role="dialog" aria-label={title} onClick={onClose}><div className="tv-receipt tv-new" onClick={e => e.stopPropagation()}>
    <h4>{title}</h4>
    <p className="tv-note">{addTo ? ot("New items are added to this order and show in the Kitchen.") : ot("Goes to the Kitchen like a customer order.")}</p>
    {!addTo && kind !== 'table' && <div className="tv-form">
      <input placeholder={ot("Customer name")} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={100}/>
      <input placeholder={kind === 'delivery' ? ot("Phone (required)") : ot("Phone (optional)")} inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={20}/>
      {kind === 'delivery' && <input placeholder={ot("Delivery address")} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} maxLength={500}/>}
    </div>}
    <input className="tv-search" placeholder={ot("Search menu")} value={q} onChange={e => setQ(e.target.value)}/>
    <ul className="tv-lines tv-menu">{list.slice(0, 80).map(m => <li key={m.id}><span className="n">{m.name}{Array.isArray(m.variants) && m.variants.length > 0 ? <select value={vr[m.id] || m.variants[0].name} onChange={e => setVr({ ...vr, [m.id]: e.target.value })}>{m.variants.map(v => <option key={v.name} value={v.name}>{v.name} - {inr(v.price)}</option>)}</select> : <small>{inr(m.price)}</small>}</span><span className="q"><button type="button" aria-label={ot("Remove {v0}", {v0: m.name})} onClick={() => bump(m.id, -1)}><Minus size={14}/></button><b>{qty[m.id] || 0}</b><button type="button" aria-label={ot("Add {v0}", {v0: m.name})} onClick={() => bump(m.id, 1)}><Plus size={14}/></button></span></li>)}</ul>
    <input placeholder={ot("Note for the kitchen (optional)")} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={200}/>
    {err && <p className="notice error">{ot(err)}</p>}
    <div className="tv-cta"><button className="btn btn-outline" onClick={onClose}>{ot("Cancel")}</button><button className="btn btn-green" disabled={busy || !picked.length} onClick={submit}>{busy ? ot("Sending…") : addTo ? ot("Add to order · {v0}", {v0: inr(total)}) : ot("Send to kitchen · {v0}", {v0: inr(total)})}</button></div>
  </div></div>;
}

function Receipt_({ bill, lines, charges, store, onClose, saved }) {
  const gst = bill.gstPct, incl = bill.gstMode === 'inclusive';
  return <div className="tv-modal" role="dialog" aria-label={ot("Bill")} onClick={onClose}><div className="tv-receipt" onClick={e => e.stopPropagation()}>
    <h4>{store.name}</h4>
    {shopLines(store).length > 0 && <p className="c tv-shopinfo">{shopLines(store).map((t, i) => <React.Fragment key={i}>{i > 0 && <br/>}{t}</React.Fragment>)}</p>}
    <p>{bill.title}{saved ? ` · Bill #${bill.billNo}` : ' · Draft'} · {new Date(bill.paidAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p><hr/>
    {lines.map((l, i) => <div className="r" key={i}><span>{l.qty} × {l.name}{opt(l) && <small className="tv-opt"> {opt(l)}</small>}</span><span>{inr(l.qty * l.price)}</span></div>)}<hr/>
    <div className="r"><span>{ot("Subtotal")}</span><span>{inr(bill.subtotal)}</span></div>
    {charges.map((c, i) => <div className="r" key={i}><span>{c.label}</span><span>{inr(c.amount)}</span></div>)}
    {bill.discount > 0 && <div className="r"><span>{ot("Discount")}</span><span>-{inr(bill.discount)}</span></div>}
    {gst > 0 && <><div className="r"><span>{ot("CGST")} {gst / 2}%{incl ? ot(' (incl.)') : ''}</span><span>{inr(bill.cgst)}</span></div><div className="r"><span>{ot("SGST")} {gst / 2}%{incl ? ot(' (incl.)') : ''}</span><span>{inr(bill.sgst)}</span></div></>}
    {Number(bill.roundOff) !== 0 && bill.roundOff !== undefined && <div className="r"><span>{ot("Round off")}</span><span>{bill.roundOff > 0 ? '+' : '-'}{inr(Math.abs(bill.roundOff))}</span></div>}<hr/>
    <div className="r big"><span>{ot("TOTAL")}</span><span>{inr(bill.total)}</span></div>
    {saved && <p className="c">{paidText(bill)}</p>}
    <p className="c">Thank you, visit again!</p>
    <div className="tv-cta no-print"><button className="btn btn-outline" onClick={onClose}>Close</button>{saved && <a className="btn btn-outline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(billText(bill, lines, charges, store))}`}>Share on WhatsApp</a>}<button className="btn btn-green" onClick={() => printReceipt(bill, lines, charges, store, saved)}><Printer size={16}/> {saved ? 'Reprint (80mm)' : 'Print (80mm)'}</button></div>
  </div></div>;
}

export default function TablesView({ token, storeId, staffMode = false, canBill = true }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('orders');
  const [edit, setEdit] = useState({ qty: {}, added: [], charges: [], disc: { type: 'flat', value: '' } });
  const [gst, setGst] = useState(() => Number(localStorage.getItem(`dd-gst-${storeId}`) ?? 5));
  const [pick, setPick] = useState('');
  const [pay, setPay] = useState('cash');
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState({ cash: '', upi: '', card: '' });
  const [day, setDay] = useState(null);
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newOrd, setNewOrd] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [hDate, setHDate] = useState('');
  const [cfg, setCfg] = useState(null);
  const base = `/owner/${storeId}`;
  const selRef = useRef(sel); selRef.current = sel;

  const load = useCallback(async () => { try { setData(await api(`${base}/tables`, { token, feedback: false })); api(`${base}/tables/day-summary`, { token, feedback: false }).then(setDay).catch(() => {}); setErr(''); } catch (e) { setErr(ot(e.message || 'Could not load tables')); } }, [base, token]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setEdit({ qty: {}, added: [], charges: [], disc: { type: 'flat', value: '' } }); setForm(null); setPick(''); setHist(null); setSplit(false); setParts({ cash: '', upi: '', card: '' }); }, [sel?.kind, sel?.n, sel?.oid]);

  const allOrders = useMemo(() => { if (!data || !sel) return []; return sel.kind === 'table' ? (data.tables.find(t => t.number === sel.n)?.orders || []) : (data.channels[sel.kind]?.orders || []); }, [data, sel]);
  const perOrder = sel?.kind === 'delivery' || sel?.kind === 'takeaway';
  const orders = useMemo(() => perOrder ? (allOrders.find(o => o.id === sel.oid) ? allOrders.filter(o => o.id === sel.oid) : allOrders.slice(0, 1)) : allOrders, [allOrders, perOrder, sel]);
  const baseLines = useMemo(() => orders.flatMap(o => (o.items || []).map((it, idx) => ({ key: `${o.id}|${idx}`, orderId: o.id, itemIdx: idx, productId: it.productId || null, name: it.name, variant: it.variant, addons: it.addons, note: it.note, price: Number(it.price), qty: Number(it.qty) }))), [orders]);
  const lines = useMemo(() => [...baseLines.map(l => ({ ...l, qty: edit.qty[l.key] ?? l.qty })), ...edit.added.map(a => ({ key: 'p' + a.key, productId: a.productId, name: a.name, variant: a.variant, price: a.price, qty: a.qty, addedKey: a.key }))].filter(l => l.qty > 0), [baseLines, edit]);
  const gv = gstView(data, gst);
  const partList = ['cash', 'upi', 'card'].map(k => ({ mode: k, amount: Math.round(Number(parts[k] || 0) * 100) / 100 })).filter(p => p.amount > 0);
  const partSum = Math.round(partList.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  const m = billMoney(lines, edit.charges, edit.disc, gv);
  const setQty = (l, d) => { if (l.orderId) setEdit(e => ({ ...e, qty: { ...e.qty, [l.key]: Math.max(0, l.qty + d) } })); else setEdit(e => ({ ...e, added: e.added.map(a => a.key === l.addedKey ? { ...a, qty: Math.max(0, a.qty + d) } : a) })); };
  const addItem = val => {
    const [id, vname] = String(val).split('|'), p = data.menu.find(x => String(x.id) === id); if (!p) return;
    const vs = Array.isArray(p.variants) ? p.variants : [], v = vs.length ? vs.find(x => x.name === vname) : null; if (vs.length && !v) return;
    const key = `${p.id}|${v ? v.name : ''}`, price = Number(v ? v.price : p.price);
    setEdit(e => e.added.some(a => a.key === key) ? { ...e, added: e.added.map(a => a.key === key ? { ...a, qty: a.qty + 1 } : a) } : { ...e, added: [...e.added, { key, productId: p.id, variant: v ? v.name : undefined, name: p.name, price, qty: 1 }] }); setPick('');
  };
  const payload = () => ({ channel: sel.kind, tableNumber: sel.kind === 'table' ? sel.n : undefined, orderIds: orders.map(o => o.id), lines: lines.map(l => l.orderId ? { orderId: l.orderId, itemIdx: l.itemIdx, name: l.name, qty: l.qty, productId: l.productId } : { productId: l.productId, variant: l.variant, qty: l.qty }), charges: edit.charges.map(c => ({ label: c.label, amount: Number(c.amount) })), discount: { type: edit.disc.type, value: Number(edit.disc.value || 0) }, gstPct: gv.rate, ...(split ? { payments: partList } : { paymentMode: pay }) });
  const draftBill = () => ({ title: label(sel), subtotal: m.sub, discount: m.d, gstPct: gv.rate, gstMode: gv.mode, cgst: m.half, sgst: m.half, roundOff: m.roundOff, total: m.total, paymentMode: split ? 'split' : pay, payments: split ? partList : [] });
  const settle = async () => {
    if (busy || !lines.length) return;
    if (split && Math.abs(partSum - m.total) > 0.005) { setErr(`Payments add up to ${inr(partSum)} but the total is ${inr(m.total)}`); return; }
    let reason = '';
    if (baseLines.some(b => (edit.qty[b.key] ?? b.qty) < b.qty)) { reason = (window.prompt('Some ordered items were removed or reduced. Reason (for example: customer returned dish)') || '').trim(); if (reason.length < 3) { setErr(ot('Add a short reason to bill fewer items than ordered')); return; } }
    setBusy(true); setErr('');
    try { const { bill, warnings } = await api(`${base}/table-bills`, { token, method: 'POST', body: { ...payload(), ...(reason ? { adjustReason: reason } : {}) }, feedback: false }); setPreview({ saved: true, bill: { ...bill, title: label(sel) }, lines: bill.lines, charges: bill.charges }); await load(); setSel(null); if (warnings?.length) setErr(warnings.map(w => w.message).join(' ')); }
    catch (e) { setErr(ot(e.message || 'Could not save the bill')); } finally { setBusy(false); }
  };
  const clearTable = async () => { if (!orders.length || !window.confirm(ot("Cancel {v0} open order{v1} and free this table? Use \"Paid\" instead if the customer paid.", {v0: orders.length, v1: orders.length > 1 ? 's' : ''}))) return; setBusy(true); try { for (const o of orders) await api(`${base}/restaurant-orders/${o.id}`, { token, method: 'PATCH', body: { status: 'cancelled' }, feedback: false } ); await load(); } catch (e) { setErr(ot(e.message || 'Could not clear')); } finally { setBusy(false); } };
  const holdTable = async held => { setBusy(true); try { await api(`${base}/tables/${sel.n}/hold`, { token, method: 'POST', body: { held }, feedback: false }); await load(); } catch (e) { setErr(ot(e.message || 'Could not update the table')); } finally { setBusy(false); } };
  const loadHist = async (d) => { setHist(null); try { const q = (sel.kind === 'table' ? `channel=table&table=${sel.n}` : `channel=${sel.kind}`) + (d ? `&date=${d}` : ''); setHist((await api(`${base}/tables/history?${q}`, { token, feedback: false })).bills); } catch (e) { setHist([]); setErr(e.message); } };
  const openHist = () => { setTab('history'); loadHist(hDate); };
  const saveCount = async () => { const n = Number(cfg); if (!Number.isInteger(n) || n < 1 || n > 100) { setErr(ot('Tables must be 1 to 100')); return; } try { await api(`${base}/business`, { token, method: 'PATCH', body: { tableCount: n }, feedback: false }); setCfg(null); await load(); } catch (e) { setErr(e.message); } };

  if (!data) return <div className="tv"><div className="tv-main">{err ? <p className="notice error">{ot(err)}</p> : <p className="tv-empty">{ot("Loading tables…")}</p>}</div></div>;
  const occupied = data.tables.filter(t => t.occupied).length, running = data.tables.reduce((s, t) => s + t.total, 0);
  const cur = sel && (sel.kind === 'table' ? data.tables.find(t => t.number === sel.n) : data.channels[sel.kind]);
  const occ = sel && (orders.length > 0 || (sel.kind === 'table' && !!cur?.held));
  const since = orders[0]?.createdAt;
  const Panel = sel && <aside className="tv-panel" aria-label={label(sel)}>
    <header><div><span className={`tv-chip ${occ ? 'occ' : 'vac'}`}>{sel.kind === 'table' ? (occ ? ot("Occupied") : ot("Vacant")) : (occ ? ot("Open") : ot("No open orders"))}</span><h3>{label(sel)}</h3>{occ && <small><Clock size={13}/> {ago(since)} · {orders.length} {ot("order")}{orders.length > 1 ? 's' : ''}</small>}</div><button className="tv-x" onClick={() => setSel(null)} aria-label={ot("Close")}><X size={18}/></button></header>
    {canBill && sel.kind !== 'counter' && <div className="tv-addrow"><button type="button" className="btn btn-outline" onClick={() => setNewOrd(true)}><Plus size={15}/> {ot("New order")}{sel.kind === 'table' ? ot(" for Table {v0}", {v0: sel.n}) : ''}</button>{sel.kind === 'table' && orders.length > 0 && <button type="button" className="btn btn-outline" onClick={clearTable}>{ot("Vacate table (cancel orders)")}</button>}{sel.kind === 'table' && orders.length === 0 && !cur?.held && <button type="button" className="btn btn-outline" onClick={() => holdTable(true)}>{ot("Mark occupied")}</button>}{sel.kind === 'table' && cur?.held && <button type="button" className="btn btn-outline" onClick={() => holdTable(false)}>{ot("Free table")}</button>}</div>}
    {tab === 'bill' && perOrder && allOrders.length > 0 && <div className="tv-pick" role="group" aria-label={ot("Choose order to bill")}><small>{ot("Each")} {sel.kind} {ot("order gets its own bill")}</small><div>{allOrders.map(o => <button key={o.id} type="button" className={o.id === orders[0]?.id ? 'on' : ''} onClick={() => setSel({ kind: sel.kind, oid: o.id })}>#{o.orderNumber || o.id} · {inr(o.total)} · <em className={`tv-st ${o.status}`}>{o.status}</em></button>)}</div></div>}
    <div className="tv-tabs"><button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}><ShoppingBag size={14}/> {ot("Orders")}</button><button className={tab === 'bill' ? 'on' : ''} onClick={() => setTab('bill')}><Receipt size={14}/> {ot("Bill")}</button><button className={tab === 'history' ? 'on' : ''} onClick={openHist}><History size={14}/> {ot("History")}</button></div>
    {tab === ot("orders") && <div className="tv-orders">{allOrders.length > 0 && <p className="tv-note">{perOrder ? ot("Tap an order to bill it.") : ot("Tap an order to open the bill.")}</p>}{allOrders.map(o => <div className="tv-order tv-click" role="button" tabIndex={0} key={o.id} onClick={() => { if (perOrder) setSel({ kind: sel.kind, oid: o.id }); setTab('bill'); }}><div><strong>{ot("Order #")}{o.orderNumber || o.id}</strong><span className={`tv-st ${o.status}`}>{o.status}</span></div><p>{(o.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}</p>{canBill && !['cancelled','delivered','picked-up','served'].includes(o.status) && <button type="button" className="btn btn-outline tv-add" onClick={e => { e.stopPropagation(); setAddTo(o); }}><Plus size={14}/> {ot("Add items")}</button>}{(o.customerName || o.deliveryAddress) && <small>{[o.customerName, o.customerPhone, o.deliveryAddress].filter(Boolean).join(' · ')}</small>}{o.note && <small>{ot("Note:")} {o.note}</small>}</div>)}{!orders.length && <p className="tv-empty">{ot("No open orders. Use New order above, or add items from the Bill tab.")}</p>}</div>}
    {tab === 'history' && <div className="tv-orders"><div className="tv-date"><label>{ot("Date")} <input type="date" value={hDate} max={new Date().toISOString().slice(0, 10)} onChange={e => { setHDate(e.target.value); loadHist(e.target.value); }}/></label>{hDate && <button type="button" className="tv-link" onClick={() => { setHDate(''); loadHist(''); }}>{ot("All dates")}</button>}</div><p className="tv-note">{ot("Every billed order stays here and in Sales. Nothing is deleted.")}</p>{hist === null && <p className="tv-empty">{ot("Loading…")}</p>}{hist?.length === 0 && <p className="tv-empty">{hDate ? ot("No bills on this date.") : ot("No bills yet.")}</p>}{hist?.map(h => <button className="tv-hist" key={h.id} onClick={() => setPreview({ saved: true, bill: { ...h, title: label(sel) }, lines: h.lines, charges: h.charges })}><strong>#{h.billNo}</strong><span>{when(h.paidAt)} · {h.paymentMode.toUpperCase()}</span><b>{inr(h.total)}</b></button>)}</div>}
    {tab === 'bill' && <div className="tv-bill">
      {canBill && <div className="tv-add"><Search size={15}/><select value={pick} onChange={e => addItem(e.target.value)} aria-label="Add item"><option value="">Add item to bill…</option>{data.menu.flatMap(p => Array.isArray(p.variants) && p.variants.length ? p.variants.map(v => <option key={`${p.id}|${v.name}`} value={`${p.id}|${v.name}`}>{p.name} ({v.name}) · {inr(v.price)}</option>) : [<option key={p.id} value={p.id}>{p.name} · {inr(p.price)}</option>])}</select></div>}
      <ul className="tv-lines">{lines.map(l => <li key={l.key}><span className="n">{l.name}{opt(l) && <small className="tv-opt">{opt(l)}</small>}<small>{inr(l.price)} each</small></span><span className="q">{canBill ? <><button onClick={() => setQty(l, -1)} aria-label="Less"><Minus size={14}/></button><b>{l.qty}</b><button onClick={() => setQty(l, 1)} aria-label="More"><Plus size={14}/></button></> : <b>{l.qty}</b>}</span><span className="a">{inr(l.qty * l.price)}</span>{canBill && <button className="rm" onClick={() => { if (window.confirm(`Remove ${l.name} (${l.qty}) from this bill? Nothing is saved until you save the order.`)) setQty(l, -l.qty); }} aria-label={`Remove ${l.name}`}><Trash2 size={15}/></button>}</li>)}{!lines.length && <li className="tv-empty">No items yet.</li>}</ul>
      <div className="tv-adj">{edit.charges.map((c, i) => <div key={i}><span>{c.label}</span><b>+ {inr(c.amount)}</b><button onClick={() => setEdit(e => ({ ...e, charges: e.charges.filter((_, j) => j !== i) }))} aria-label="Remove charge"><X size={14}/></button></div>)}{m.d > 0 && <div><span>Discount{edit.disc.type === 'pct' ? ` ${edit.disc.value}%` : ''}</span><b className="neg">− {inr(m.d)}</b><button onClick={() => setEdit(e => ({ ...e, disc: { type: 'flat', value: '' } }))} aria-label="Remove discount"><X size={14}/></button></div>}
        {canBill && !form && <div className="tv-links"><button className="tv-link" onClick={() => setForm({ k: 'charge', label: 'Service charge', v: '' })}><Plus size={13}/> Add charge</button><button className="tv-link" onClick={() => setForm({ k: 'disc', type: 'pct', v: '' })}><Percent size={13}/> Discount</button></div>}
        {form?.k === 'charge' && <form className="tv-form" onSubmit={e => { e.preventDefault(); const a = Number(form.v); if (a > 0) setEdit(x => ({ ...x, charges: [...x.charges, { label: form.label.trim() || 'Charge', amount: a }] })); setForm(null); }}><input aria-label="Charge name" value={form.label} maxLength={40} onChange={e => setForm({ ...form, label: e.target.value })}/><input aria-label="Amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="₹" autoFocus value={form.v} onChange={e => setForm({ ...form, v: e.target.value })}/><button className="btn btn-green btn-small">Add</button><button type="button" className="tv-x" onClick={() => setForm(null)} aria-label="Cancel"><X size={16}/></button></form>}
        {form?.k === 'disc' && <form className="tv-form" onSubmit={e => { e.preventDefault(); const a = Number(form.v); setEdit(x => ({ ...x, disc: { type: form.type, value: a > 0 ? a : '' } })); setForm(null); }}><select aria-label="Discount type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="pct">%</option><option value="flat">₹</option></select><input aria-label="Discount" type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={form.v} onChange={e => setForm({ ...form, v: e.target.value })}/><button className="btn btn-green btn-small">Apply</button><button type="button" className="tv-x" onClick={() => setForm(null)} aria-label="Cancel"><X size={16}/></button></form>}
      </div>
      <div className="tv-sum"><div><span>Subtotal</span><b>{inr(m.sub)}</b></div>{(m.ch > 0 || m.d > 0) && <div><span>Charges − discount</span><b>{m.ch - m.d < 0 ? '− ' + inr(m.d - m.ch) : inr(m.ch - m.d)}</b></div>}{gv.rate > 0 && <><div><span>CGST {gv.rate / 2}%{gv.mode === 'inclusive' ? ' (incl.)' : ''}</span><b>{inr(m.half)}</b></div><div><span>SGST {gv.rate / 2}%{gv.mode === 'inclusive' ? ' (incl.)' : ''}</span><b>{inr(m.half)}</b></div></>}{Number(m.roundOff) !== 0 && <div><span>Round off</span><b>{m.roundOff > 0 ? '+' : '-'}{inr(Math.abs(m.roundOff))}</b></div>}<div className="t"><span>Total</span><b>{inr(m.total)}</b></div></div>
      <div className="tv-gst">{gv.fixed ? <span>{gv.rate ? `GST ${gv.rate}% ${gv.mode}` : 'GST off'}</span> : <>GST <select value={gst} onChange={e => { setGst(+e.target.value); localStorage.setItem(`dd-gst-${storeId}`, e.target.value); }}>{[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}</select></>}{canBill && !split && <span className="tv-pay" role="group" aria-label="Payment mode">{['cash', 'upi', 'card'].map(p => <button key={p} type="button" className={pay === p ? 'on' : ''} onClick={() => setPay(p)}>{p.toUpperCase()}</button>)}</span>}{canBill && <button type="button" className="tv-link" onClick={() => setSplit(v => !v)}>{split ? 'Single payment' : 'Split payment'}</button>}</div>
      {canBill && split && <div className="tv-split" role="group" aria-label="Split payment">{['cash', 'upi', 'card'].map(k => <label key={k}>{k.toUpperCase()}<input type="number" min="0" step="0.01" inputMode="decimal" placeholder="₹0" value={parts[k]} onChange={e => setParts({ ...parts, [k]: e.target.value })}/><button type="button" className="tv-link" onClick={() => setParts({ ...parts, [k]: String(Math.max(0, Math.round((m.total - (partSum - Number(parts[k] || 0))) * 100) / 100)) })}>Rest</button></label>)}<small className={Math.abs(partSum - m.total) > 0.005 ? 'neg' : ''}>{Math.abs(partSum - m.total) > 0.005 ? `${inr(Math.abs(m.total - partSum))} ${partSum < m.total ? 'left to collect' : 'too much'}` : 'Matches the total'}</small></div>}
      {err && <p className="notice error">{err}</p>}
      <div className="tv-cta"><button className="btn btn-outline" disabled={!lines.length} onClick={() => setPreview({ saved: false, bill: draftBill(), lines, charges: edit.charges.map(c => ({ label: c.label, amount: c.amount })) })}><Printer size={16}/> Print bill</button>{canBill && <button className="btn btn-green" disabled={busy || !lines.length || (split && Math.abs(partSum - m.total) > 0.005)} onClick={settle}><CircleCheck size={16}/> {busy ? 'Saving…' : sel.kind === 'table' ? 'Paid · vacate table' : 'Paid · close bill'}</button>}</div>
    </div>}
  </aside>;
  return <div className={`tv ${sel ? 'has-sel' : ''}`}>
    <div className="tv-main">
      {err && !sel && <p className="notice error">{ot(err)}</p>}
      {data.hiddenOrders > 0 && <p className="notice error">{data.hiddenOrders} {ot("older open order(s) are not shown here. Cancel or bill the oldest ones to see them.")}</p>}
      <div className="tv-stats"><div><b>{occupied}</b><span>{ot("Occupied")}</span></div><div><b>{data.tables.length - occupied}</b><span>{ot("Vacant")}</span></div><div><b>{inr(running)}</b><span>{ot("Running bills")}</span></div>{day && day.count > 0 && <div className="tv-day"><b>{inr(day.total)}</b><span>{ot("Today ·")} {day.count} {ot("bills · Cash")} {inr(day.byMode?.cash)} {ot("· UPI")} {inr(day.byMode?.upi)} {ot("· Card")} {inr(day.byMode?.card)}</span></div>}<div className="tv-legend"><i className="g"/> {ot("Vacant")} <i className="r"/> {ot("Occupied")}</div></div>
      <h4 className="tv-h">{ot("Order channels")}</h4>
      <div className="tv-channels">{Object.entries(CH).map(([k, [n, Icon]]) => { const c = data.channels[k]; return <button key={k} className={`tv-ch ${sel?.kind === k ? 'sel' : ''}`} onClick={() => { setSel({ kind: k }); setTab('orders'); }}><Icon size={20}/><span><strong>{ot(n)}</strong><small>{c.open ? ot("{v0} open · {v1}", {v0: c.open, v1: inr(c.total)}) : k === 'counter' ? ot("Tap to bill a walk-in") : ot("No open orders")}</small></span></button>; })}</div>
      <h4 className="tv-h">{ot("Dine-in tables")}{!staffMode && <button className="tv-link tv-cfg" onClick={() => setCfg(String(data.tableCount))}><Settings2 size={13}/> {data.tableCount} {ot("tables")}</button>}</h4>
      {cfg !== null && <form className="tv-form tv-cfgform" onSubmit={e => { e.preventDefault(); saveCount(); }}><label>{ot("Number of tables")}<input type="number" min="1" max="100" value={cfg} onChange={e => setCfg(e.target.value)}/></label><button className="btn btn-green btn-small">{ot("Save")}</button><button type="button" className="tv-x" onClick={() => setCfg(null)} aria-label={ot("Cancel")}><X size={16}/></button></form>}
      {!data.tables.length && <p className="tv-empty">{ot("No tables set up yet.")}</p>}
      <div className="tv-grid">{data.tables.map(t => <button key={t.number} className={`tv-table ${t.occupied ? 'occ' : 'vac'} ${sel?.kind === 'table' && sel.n === t.number ? 'sel' : ''}`} onClick={() => { setSel({ kind: 'table', n: t.number }); setTab('orders'); }}><span className="no">{t.number}</span>{t.request && <i className={`tv-dot ${t.request}`} title={t.request === 'bill' ? ot("Wants the bill") : ot("Calling waiter")} aria-label={t.request === 'bill' ? ot("Wants the bill") : ot("Calling waiter")}/>}<span className="st">{t.occupied ? ot("Occupied") : ot("Vacant")}</span>{t.occupied ? <><b>{inr(t.total)}</b><small>{ago(t.since)}</small></> : <small>{ot("Tap to open")}</small>}</button>)}</div>
    </div>
    {Panel}
    {addTo && sel && data && <NewOrder kind={sel.kind} table={sel.n} addTo={addTo} menu={data.menu || []} base={base} token={token} onClose={() => setAddTo(null)} onDone={() => { setAddTo(null); load(); }}/>}
      {newOrd && sel && data && <NewOrder kind={sel.kind} table={sel.n} menu={data.menu || []} base={base} token={token} onClose={() => setNewOrd(false)} onDone={() => { setNewOrd(false); load(); }}/>}
      {preview && <Receipt_ {...preview} store={data} onClose={() => setPreview(null)}/>}
  </div>;
}
