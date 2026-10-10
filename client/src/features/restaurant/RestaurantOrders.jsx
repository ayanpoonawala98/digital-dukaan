import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, ChefHat, ListOrdered } from 'lucide-react';
import { api, inr } from '../../shared/lib/api.js';
import { lineText } from './MenuBits.jsx';

export const STEPS = { 'dine-in': ['new', 'accepted', 'preparing', 'ready', 'served'], takeaway: ['new', 'accepted', 'preparing', 'ready', 'picked-up'], delivery: ['new', 'accepted', 'preparing', 'ready', 'out-for-delivery', 'delivered'] };
const LABEL = { new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', served: 'Served', 'out-for-delivery': 'Out for delivery', delivered: 'Delivered', 'picked-up': 'Picked up', cancelled: 'Cancelled' };
const NEXT_LABEL = { accepted: 'Accept', preparing: 'Start preparing', ready: 'Mark ready', served: 'Mark served', 'out-for-delivery': 'Out for delivery', delivered: 'Mark delivered', 'picked-up': 'Picked up' };
const DONE = ['served', 'delivered', 'picked-up', 'cancelled'];
export const statusText = s => LABEL[s] || s;
export const stepsFor = o => STEPS[o.orderType] || STEPS['dine-in'];
export const nextStatus = o => { const steps = stepsFor(o), i = steps.indexOf(o.status); return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null; };
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`; };

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

function KitchenBoard({ token, storeId, onStatus, busy, staffMode }) {
  const [orders, setOrders] = useState([]), [requests, setRequests] = useState([]), [sound, setSound] = useState(false), [err, setErr] = useState('');
  const seen = useRef(null), beep = useBeep(), soundRef = useRef(false);
  soundRef.current = sound;
  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api(`/owner/${storeId}/restaurant-orders?pageSize=100&page=1`, { token }), api(`/owner/${storeId}/table-requests`, { token })]);
      const open = (o.orders || []).filter(x => !DONE.includes(x.status)).reverse();
      const ids = new Set(open.map(x => x.id));
      if (seen.current && [...ids].some(id => !seen.current.has(id)) && soundRef.current) beep();
      seen.current = ids; setOrders(open); setRequests(r.requests || []); setErr('');
    } catch (e) { setErr(e.message); }
  }, [storeId, token, beep]);
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, [load]);
  const clearRequest = async r => { try { await api(`/owner/${storeId}/table-requests/${r.id}`, { method: 'PATCH', token }); load(); } catch (e) { setErr(e.message); } };
  const cols = [['new', 'New'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready']];
  return <div className="kitchen">
    <div className="kitchen-bar"><span className="muted">Updates every 12 seconds. Showing open orders only.</span>
      <button type="button" className="btn btn-outline btn-small" onClick={() => { setSound(s => !s); if (!sound) beep(); }}>{sound ? <><Bell size={14}/> Sound on</> : <><BellOff size={14}/> Sound off</>}</button></div>
    {err && <p className="notice error" role="alert">{err}</p>}
    {requests.length > 0 && <div className="table-requests" role="alert">{requests.map(r => <div key={r.id} className={`table-request ${r.kind}`}><strong>Table {r.tableNumber}</strong> {r.kind === 'bill' ? 'wants the bill' : 'is calling the waiter'} <small>{ago(r.createdAt)}</small><button type="button" className="btn btn-small btn-outline" onClick={() => clearRequest(r)}>Done</button></div>)}</div>}
    <div className="kitchen-cols">{cols.map(([st, title]) => { const list = orders.filter(o => o.status === st); return <section key={st} className="kitchen-col"><h4>{title} <span>{list.length}</span></h4>
      {list.length === 0 ? <p className="muted">Nothing here.</p> : list.map(o => { const nx = nextStatus(o); return <article key={o.id} className={`kitchen-card type-${o.orderType}`}>
        <header><b>#{o.orderNumber ?? o.id}</b><span className="rorder-type">{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}</span><small>{ago(o.createdAt)}</small></header>
        <OrderDetails o={o} kitchen/>
        <div className="kitchen-actions">{nx && <button type="button" className="btn btn-green btn-small" disabled={busy} onClick={async () => { await onStatus(o, nx); load(); }}>{NEXT_LABEL[nx]}</button>}<button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={async () => { if (window.confirm(`Cancel order #${o.orderNumber ?? o.id}?`)) { await onStatus(o, 'cancelled'); load(); } }}>Cancel</button></div>
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
        <header><b>#{o.orderNumber ?? o.id}</b><span className="rorder-type">{o.orderType === 'dine-in' ? `Dine-in · Table ${o.tableNumber}` : o.orderType}</span><span className={`rorder-status s-${o.status}`}>{statusText(o.status)}</span><small>{new Date(o.createdAt).toLocaleString('en-IN')}</small></header>
        <OrderDetails o={o}/>
        <div className="rorder-actions">
          {nx && o.status !== 'cancelled' && <button type="button" className="btn btn-green btn-small" disabled={busy} onClick={() => onStatus(o, nx)}>{NEXT_LABEL[nx]}</button>}
          <select aria-label={`Status for order ${o.id}`} value={o.status} disabled={busy} onChange={e => onStatus(o, e.target.value)}>{[...new Set([...steps, o.status, 'cancelled'])].map(s => <option key={s} value={s}>{statusText(s)}</option>)}</select>
          {actionKey === `order-${o.id}` && <span className="button-spinner"/>}
          {renderPay && renderPay(o)}
          {!staffMode && <small className="muted">In-app order (no automatic WhatsApp alert)</small>}
        </div></article>; })}</div> : <p className="empty-state">No restaurant orders yet.</p>}</>}
  </div>;
}
