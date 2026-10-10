import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Bell, BellOff, Bike, ChefHat, Clock, ListOrdered, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { api, inr } from '../../shared/lib/api.js';
import { lineText } from './MenuBits.jsx';
import { KotButton } from './kot-print.jsx';
import { VegDot } from './MenuBits.jsx';

export const STEPS = { 'dine-in': ['new', 'accepted', 'preparing', 'ready', 'served'], takeaway: ['new', 'accepted', 'preparing', 'ready', 'picked-up'], delivery: ['new', 'accepted', 'preparing', 'ready', 'out-for-delivery', 'delivered'] };
const LABEL = { new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', served: 'Served', 'out-for-delivery': 'Out for delivery', delivered: 'Delivered', 'picked-up': 'Picked up', cancelled: 'Cancelled' };
const NEXT_LABEL = { accepted: 'Accept', preparing: 'Start preparing', ready: 'Mark ready', served: 'Mark served', 'out-for-delivery': 'Out for delivery', delivered: 'Mark delivered', 'picked-up': 'Picked up' };
const DONE = ['served', 'delivered', 'picked-up', 'cancelled'];
export const statusText = s => LABEL[s] || s;
export const stepsFor = o => STEPS[o.orderType] || STEPS['dine-in'];
export const nextStatus = o => { const steps = stepsFor(o), i = steps.indexOf(o.status); return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null; };
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`; };

const TYPE_INFO = { 'dine-in': ['Dine-in', UtensilsCrossed], takeaway: ['Takeaway', ShoppingBag], delivery: ['Delivery', Bike] };
function TypeChip({ o }) {
  const [label, Icon] = TYPE_INFO[o.orderType] || [o.orderType || 'Order', UtensilsCrossed];
  return <span className={`ro-type t-${o.orderType}`}><Icon size={16}/><b>{label}</b>{o.orderType === 'dine-in' && o.tableNumber ? <em>Table {o.tableNumber}</em> : null}</span>;
}
export function OrderDetails({ o, kitchen = false }) {
  return <div className="rorder-details">
    <ul className="rorder-items">{(o.items || []).map((i, idx) => <li key={idx}>
      <strong>{i.qty} × {i.name}</strong>{lineText(i) && <span className="rorder-opts"> {lineText(i)}</span>}
      {i.note && <div className="rorder-note">Note: {i.note}</div>}
      {i.answers?.length > 0 && <div className="rorder-opts">{i.answers.map(a => `${a.label}: ${a.value}`).join(', ')}</div>}
    </li>)}</ul>
    {o.note && <div className="rorder-note strong">Order note: {o.note}</div>}
    <div className="rorder-who">
      {o.orderType === 'dine-in' ? <b>Table {o.tableNumber}</b> : <><b>{o.customerName}</b>{o.customerPhone && <> · <a href={`tel:${o.customerPhone}`}>{o.customerPhone}</a></>}{o.deliveryAddress && <div>{o.deliveryAddress}</div>}</>}
      {o.orderType === 'takeaway' && o.estimateMinutes ? <div className="muted">Promised ready in about {o.estimateMinutes} min</div> : null}
    </div>
    {!kitchen && <div className="rorder-totals muted">Items {inr(o.subtotal)}{Number(o.discount) > 0 && <> · Discount -{inr(o.discount)}</>}{Number(o.deliveryFee) > 0 && <> · Delivery {inr(o.deliveryFee)}</>} · <b>Total {inr(o.total)}</b></div>}
  </div>;
}

function useBeep() {
  const ctx = useRef(null);
  return useCallback(() => {
    try {
      ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
      const c = ctx.current, o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(c.currentTime + 0.25);
    } catch { /* sound is optional */ }
  }, []);
}

// Waiter call / bill request: a longer, softer two-tone bell, repeated, so it differs from the short new-order beep and is hard to miss.
function useRing() {
  const ctx = useRef(null);
  return useCallback(kind => {
    try {
      ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
      const c = ctx.current, t0 = c.currentTime + 0.02;
      const notes = kind === 'bill' ? [659, 784, 988] : [784, 988];
      for (let r = 0; r < 4; r++) notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(), start = t0 + r * 0.95 + i * 0.32;
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(0.22, start + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
        o.start(start); o.stop(start + 0.95);
      });
    } catch { /* sound is optional */ }
  }, []);
}

function SoldOutPanel({ token, storeId }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState(null), [q, setQ] = useState(''), [err, setErr] = useState(''), [busyId, setBusyId] = useState(null);
  const load = useCallback(async () => { try { setItems((await api(`/owner/${storeId}/menu-availability`, { token, feedback: false })).items); setErr(''); } catch (e) { setErr(e.message); } }, [storeId, token]);
  useEffect(() => { if (open) load(); }, [open, load]);
  const toggle = async it => { setBusyId(it.id); try { await api(`/owner/${storeId}/menu-availability/${it.id}`, { token, method: 'POST', body: { soldOut: !it.soldOut }, feedback: false }); await load(); } catch (e) { setErr(e.message); } finally { setBusyId(null); } };
  const out = (items || []).filter(i => i.soldOut), shown = (items || []).filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  return <div className="soldout-panel">
    <button type="button" className="btn btn-outline btn-small" aria-expanded={open} onClick={() => setOpen(o => !o)}><Ban size={14}/> Sold out today{items ? ` (${out.length})` : ''}</button>
    {open && <div className="soldout-body">
      {err && <p className="notice error" role="alert">{err}</p>}
      <p className="muted">Tap a dish to mark it sold out for today. It greys out on the menu and cannot be ordered. It comes back tomorrow, or tap again.</p>
      <input type="search" placeholder="Search dishes" value={q} onChange={e => setQ(e.target.value)} aria-label="Search dishes"/>
      {!items ? <p className="muted">Loading...</p> : <div className="soldout-list">{shown.map(i => <button key={i.id} type="button" disabled={busyId === i.id} className={`soldout-chip ${i.soldOut ? 'on' : ''}`} aria-pressed={i.soldOut} onClick={() => toggle(i)}><VegDot veg={i.veg}/>{i.name}<em>{i.soldOut ? 'Sold out' : 'Available'}</em></button>)}{!shown.length && <p className="muted">No dishes match.</p>}</div>}
    </div>}
  </div>;
}

function KitchenBoard({ token, storeId, onStatus, busy, staffMode }) {
  const [orders, setOrders] = useState([]), [requests, setRequests] = useState([]), [sound, setSoundState] = useState(() => { try { return localStorage.getItem(`dd-kitchen-alert-${storeId}`) === '1'; } catch { return false; } }), [err, setErr] = useState('');
  const setSound = fn => setSoundState(prev => { const v = typeof fn === 'function' ? fn(prev) : fn; try { localStorage.setItem(`dd-kitchen-alert-${storeId}`, v ? '1' : '0'); } catch { /* optional */ } return v; });
  const buzz = useCallback(p => { try { navigator.vibrate?.(p); } catch { /* optional */ } }, []);
  const seen = useRef(null), seenReq = useRef(null), beep = useBeep(), ring = useRing(), soundRef = useRef(false);
  soundRef.current = sound;
  // Only the changed card updates; no full re-fetch.
  const apply = fresh => { if (fresh) setOrders(prev => prev.map(x => (x.id === fresh.id ? { ...x, ...fresh } : x)).filter(x => !DONE.includes(x.status))); };
  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api(`/owner/${storeId}/restaurant-orders?pageSize=100&page=1`, { token }), api(`/owner/${storeId}/table-requests`, { token })]);
      const open = (o.orders || []).filter(x => !DONE.includes(x.status)).reverse();
      const ids = new Set(open.map(x => x.id));
      if (seen.current && [...ids].some(id => !seen.current.has(id)) && soundRef.current) { beep(); buzz([300, 120, 300]); }
      seen.current = ids; setOrders(open); setRequests(r.requests || []); setErr('');
      const reqIds = new Set((r.requests || []).map(x => x.id));
      if (seenReq.current && soundRef.current) { const fresh = (r.requests || []).filter(x => !seenReq.current.has(x.id)); if (fresh.length) { ring(fresh.every(x => x.kind === 'bill') ? 'bill' : 'waiter'); buzz([500, 150, 500, 150, 500]); } }
      seenReq.current = reqIds;
    } catch (e) { setErr(e.message); }
  }, [storeId, token, beep, ring, buzz]);
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, [load]);
  const clearRequest = async r => { try { await api(`/owner/${storeId}/table-requests/${r.id}`, { method: 'PATCH', token }); load(); } catch (e) { setErr(e.message); } };
  const cols = [['new', 'New'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready']];
  return <div className="kitchen">
    <div className="kitchen-bar"><span className="muted">Updates every 12 seconds. Showing open orders only. Sound and vibration alert for new orders and waiter or bill calls; keep this screen open and tap Sound on once (browsers need a tap to allow sound). Your choice is remembered.</span>
      <button type="button" className="btn btn-outline btn-small" onClick={() => { setSound(s => !s); if (!sound) { beep(); buzz(200); } }}>{sound ? <><Bell size={14}/> Sound on</> : <><BellOff size={14}/> Sound off</>}</button></div>
    {err && <p className="notice error" role="alert">{err}</p>}
    <SoldOutPanel token={token} storeId={storeId}/>
    {requests.length > 0 && <div className="table-requests" role="alert">{requests.map(r => <div key={r.id} className={`table-request ${r.kind}`}><strong>Table {r.tableNumber}</strong> {r.kind === 'bill' ? 'wants the bill' : 'is calling the waiter'} <small>{ago(r.createdAt)}</small><button type="button" className="btn btn-small btn-outline" onClick={() => clearRequest(r)}>Done</button></div>)}</div>}
    <div className="kitchen-cols">{cols.map(([st, title]) => { const list = orders.filter(o => o.status === st); return <section key={st} className="kitchen-col"><h4>{title} <span>{list.length}</span></h4>
      {list.length === 0 ? <p className="muted">Nothing here.</p> : list.map(o => { const nx = nextStatus(o); return <article key={o.id} className={`kitchen-card type-${o.orderType}`}>
        <header><b>#{o.orderNumber ?? o.id}</b><span className="rorder-type">{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}</span><small>{ago(o.createdAt)}</small></header>
        <OrderDetails o={o} kitchen/>
        <div className="kitchen-actions"><KotButton token={token} storeId={storeId} order={o}/>{nx && <button type="button" className="btn btn-green btn-small" disabled={busy} onClick={async () => { apply(await onStatus(o, nx)); }}>{NEXT_LABEL[nx]}</button>}<button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={async () => { if (window.confirm(`Cancel order #${o.orderNumber ?? o.id}?`)) { apply(await onStatus(o, 'cancelled')); } }}>Cancel</button></div>
      </article>; })}</section>; })}</div>
  </div>;
}

export default function RestaurantOrders({ orders, busy, actionKey, onStatus, onRefresh, token, storeId, staffMode, renderPay }) {
  const [view, setViewState] = useState(() => { try { return sessionStorage.getItem('dd-orders-view') === 'kitchen' ? 'kitchen' : 'list'; } catch { return 'list'; } });
  const setView = v => { setViewState(v); try { sessionStorage.setItem('dd-orders-view', v); } catch { /* optional */ } };
  return <div className="rorders">
    <div className="leads-head"><h3>Orders received in the app</h3>
      <div className="rorder-views"><button type="button" className={`btn btn-small ${view === 'list' ? 'btn-green' : 'btn-outline'}`} onClick={() => setView('list')}><ListOrdered size={14}/> Orders</button><button type="button" className={`btn btn-small ${view === 'kitchen' ? 'btn-green' : 'btn-outline'}`} onClick={() => setView('kitchen')}><ChefHat size={14}/> Kitchen view</button>
        <button className="btn btn-outline btn-small" type="button" onClick={onRefresh} disabled={busy}>Refresh orders</button></div></div>
    {view === 'kitchen' ? <KitchenBoard token={token} storeId={storeId} onStatus={onStatus} busy={busy} staffMode={staffMode}/> : <>
      <p className="muted">Dine-in, takeaway and delivery orders appear here with every detail needed to prepare and serve. Payment is handled in person.</p>
      {orders.length ? <div className="rorder-list">{orders.map(o => { const nx = nextStatus(o), steps = stepsFor(o); return <article key={o.id} className={`rorder-card status-${o.status}`}>
        <header className="ro-head"><TypeChip o={o}/><span className="ro-num">#{o.orderNumber ?? o.id}</span><span className={`rorder-status s-${o.status}`}>{statusText(o.status)}</span><small className="ro-time"><Clock size={12}/> {new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></header>
        <OrderDetails o={o}/>
        <div className="rorder-actions">
          <KotButton token={token} storeId={storeId} order={o}/>
          {nx && o.status !== 'cancelled' && <button type="button" className="btn btn-green btn-small" disabled={busy} onClick={() => onStatus(o, nx)}>{NEXT_LABEL[nx]}</button>}
          <select aria-label={`Status for order ${o.id}`} value={o.status} disabled={busy} onChange={e => onStatus(o, e.target.value)}>{[...new Set([...steps, o.status, 'cancelled'])].map(s => <option key={s} value={s}>{statusText(s)}</option>)}</select>
          {actionKey === `order-${o.id}` && <span className="button-spinner"/>}
          {renderPay && renderPay(o)}
          {!staffMode && <small className="muted">In-app order (no automatic WhatsApp alert)</small>}
        </div></article>; })}</div> : <p className="empty-state">No restaurant orders yet.</p>}</>}
  </div>;
}

const dayKey = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export function RestaurantOverview({ token, storeId, onOpen }) {
  const [orders, setOrders] = useState(null), [requests, setRequests] = useState([]), [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [o, r] = await Promise.all([api(`/owner/${storeId}/restaurant-orders?pageSize=100&page=1`, { token }), api(`/owner/${storeId}/table-requests`, { token })]);
        if (live) { setOrders(o.orders || []); setRequests(r.requests || []); setErr(''); }
      } catch (e) { if (live) setErr(e.message); }
    };
    load(); const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, [storeId, token]);
  if (err) return <div className="notice error" role="alert">{err}</div>;
  if (!orders) return null;
  const today = dayKey(Date.now()), todays = orders.filter(o => dayKey(o.createdAt) === today && o.status !== 'cancelled');
  const sales = todays.filter(o => DONE.includes(o.status)).reduce((s, o) => s + Number(o.total || 0), 0);
  const active = orders.filter(o => !DONE.includes(o.status));
  const cards = [[todays.length, "Today's orders"], [inr(sales), "Today's sales"], [active.length, 'Active orders'], [requests.length, 'Waiter / bill requests']];
  return <>
    <div className="section-heading"><div><span className="kicker">STORE SNAPSHOT</span><h2>Today at a glance</h2></div><p>Sales count served, delivered and picked-up orders.</p></div>
    <div className="stat-grid overview-stats">{cards.map(([n, l], i) => <div className="stat-card anim-up" style={{ animationDelay: `${i * 70}ms` }} key={l}><strong>{n}</strong><span>{l}</span></div>)}</div>
    <div className="dashboard-panel ro-recent">
      <div className="section-heading"><div><span className="kicker">LATEST</span><h2>Recent orders</h2></div><button type="button" className="btn btn-outline btn-small" onClick={() => onOpen('restaurant')}>Open table orders</button></div>
      {orders.length === 0 ? <p className="muted">No orders yet. Share your table QR so guests can order.</p> : <ul className="ro-recent-list">{orders.slice(0, 5).map(o => <li key={o.id}><b>#{o.orderNumber ?? o.id}</b><span>{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}</span><span className={`rorder-status s-${o.status}`}>{statusText(o.status)}</span><strong>{inr(o.total)}</strong><small>{ago(o.createdAt)}</small></li>)}</ul>}
    </div>
  </>;
}
