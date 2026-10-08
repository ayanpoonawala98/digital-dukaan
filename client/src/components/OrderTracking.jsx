import { notify } from '../lib/notifications.js';
import { useFeedbackState } from './Toasts.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from './chrome.jsx';
import { api, inr } from '../lib/api.js';
import { flowFor, statusLabel } from '../lib/order-flows.js';
import { currentBrowserSubscription, loadSavedOrders, onOrdersChanged, pushSupported, subscribeBrowser, trackingPath } from '../lib/my-orders.js';

function StatusSteps({ kind, storeType, status }) {
  const flow = flowFor(kind, storeType);
  if (status === 'cancelled') return <p className="notice error" role="status">Cancelled</p>;
  const at = flow.steps.findIndex(([k]) => k === status);
  return <div className="order-progress"><div className="order-current"><span className="order-live-dot"/><span>Current status</span><strong>{statusLabel(flow, status)}</strong><small>{at >= 0 ? `Step ${at + 1} of ${flow.steps.length}` : 'Status updated'}</small></div>
    <ol className="order-stepper" aria-label="Order progress">{flow.steps.map(([s, label], i) => <li key={s} className={i < at ? 'complete' : i === at ? 'active' : 'upcoming'} aria-current={i === at ? 'step' : undefined}><span className="step-mark" aria-hidden="true">{i < at ? '✓' : i + 1}</span><span className="step-label">{label}<small>{i < at ? 'Done' : i === at ? 'Now' : 'Next'}</small></span></li>)}</ol>
  </div>;
}

function OrderBody({ order }) {
  return <>{order.items.map((item, i) => <div className="cart-row" key={i}><strong>{item.qty} × {item.name}</strong><span>{inr(Number(item.price) * item.qty)}</span></div>)}<div className="drawer-totals">{Number(order.discount) > 0 && <div><span>Discount</span><b>-{inr(order.discount)}</b></div>}<div className="grand"><span>Total</span><b>{inr(order.total)}</b></div></div></>;
}

// Registers every saved order of this browser under its push subscription (the customer's identity).
function pushErrorMessage(e) {
  const m = String(e?.message || '');
  if (e?.name === 'NotAllowedError') return 'Notifications are blocked. Allow them for this site in your browser settings.';
  if (e?.name === 'AbortError' || e?.name === 'NotSupportedError' || e?.name === 'InvalidStateError') return 'This browser could not set up notifications. Try Chrome or Safari, or turn on notifications for the browser.';
  if (/went wrong/i.test(m)) return 'Could not turn on order updates right now. Please try again in a moment.';
  return m || 'Could not turn on order updates. Please try again.';
}
function PushControl({ slug, orders, onChange }) {
  const [state, setState] = useState('idle'), [err, setErr] = useFeedbackState('');
  const supported = pushSupported();
  const orderKey = orders.map(o => `${o.kind}:${o.id}:${o.token}`).join('|');
  useEffect(() => {
    let active = true;
    setState('idle');
    if (!supported) return;
    if (Notification.permission === 'denied') { setState('denied'); return; }
    (async () => {
      try {
        const sub = await currentBrowserSubscription();
        if (!sub || !orders.length) return;
        const states = await Promise.all(orders.map(o => api(`/public/stores/${encodeURIComponent(slug)}/${o.kind === 'lead' ? 'lead-orders' : 'restaurant-orders'}/${o.id}/push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, { token: o.token, feedback: false })));
        if (active) setState(states.every(s => s.enrolled) ? 'on' : 'idle');
      } catch { if (active) setState('idle'); }
    })();
    return () => { active = false; };
  }, [slug, supported, orderKey]);
  if (!supported) return null;
  const on = async () => {
    setErr(''); setState('busy');
    try {
      const sub = await subscribeBrowser(slug);
      await api(`/public/stores/${encodeURIComponent(slug)}/my-orders/push-subscription`, { method: 'POST', body: { endpoint: sub.endpoint, keys: sub.keys, orders: orders.map(o => ({ kind: o.kind, id: o.id, token: o.token })) } });
      try { localStorage.setItem(`dd-push-on-${slug}`, sub.endpoint); } catch {}
      setState('on'); onChange?.();
    } catch (e) { setState(Notification.permission === 'denied' ? 'denied' : 'idle'); if (Notification.permission !== 'denied') setErr(pushErrorMessage(e)); }
  };
  const off = async () => {
    setErr(''); setState('busy');
    try {
      const sub = await currentBrowserSubscription();
      if (sub) await api(`/public/stores/${encodeURIComponent(slug)}/my-orders/push-subscription`, { method: 'DELETE', body: { endpoint: sub.endpoint } });
      try { localStorage.removeItem(`dd-push-on-${slug}`); } catch {}
      setState('idle');
    } catch (e) { setState('on'); setErr(e.message); }
  };
  return <div className="push-prompt push-prompt-inline anim-up">{state === 'denied'
    ? <div className="push-text"><strong>Notifications are blocked.</strong><span>Enable them for this site in your browser settings to get order updates.</span></div>
    : state === 'on'
      ? <><div className="push-text"><strong>Order notifications on</strong><span>You will get a browser notification when the store updates an order.</span></div><button className="btn-ghost" onClick={off}>Turn off</button></>
      : <><div className="push-text"><strong>Get order updates</strong><span>One tap, no login. Notifications only cover your orders.</span></div><button className="btn btn-green btn-small" onClick={on} disabled={state === 'busy' || !orders.length}>{state === 'busy' ? 'Turning on...' : 'Notify me'}</button></>}
  </div>;
}

function usePoll(load, active, ms = 30000) {
  useEffect(() => {
    let alive = true, timer, first = true;
    const run = async () => {
      if (!alive) return;
      // Always fetch once on open (the tab may start in the background); pause only repeat polls while hidden.
      if (!first && document.hidden) { timer = setTimeout(run, ms); return; }
      first = false;
      const again = await load();
      if (alive && again) timer = setTimeout(run, ms);
    };
    if (active) run();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, active, ms]);
}

export function OrderTracking({ kind = 'restaurant' }) {
  const { slug, id } = useParams();
  const [data, setData] = useState(null), [error, setError] = useFeedbackState(''), [updated, setUpdated] = useState(null), [copied, setCopied] = useState(false);
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  useEffect(() => {
    document.title = 'Track your order - Digital Shop';
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  const load = useCallback(async () => {
    if (!token) { setError('Open the private tracking link from your order confirmation, or use My Orders on the store page.'); return false; }
    try {
      const result = await api(`/public/stores/${encodeURIComponent(slug)}/${kind === 'lead' ? 'lead-orders' : 'restaurant-orders'}/${id}`, { token });
      setData(result); setError(''); setUpdated(new Date());
      return !flowFor(kind, result.store?.storeType).done.includes(result.order.status);
    } catch (e) { setError(e.message); return false; }
  }, [slug, id, kind, token]);
  usePoll(load, true);
  const copy = async () => { try { await navigator.clipboard.writeText(window.location.href); notify('success', 'Link copied.'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { notify('error', 'Could not copy the link. Please copy it manually.'); } };
  const saved = [{ kind, id: Number(id), token }];
  const flow = flowFor(kind, data?.store?.storeType);
  return <><Header shop={slug} business={data?.store || data?.restaurant}/><main className="container" style={{ maxWidth: 760, paddingTop: 40, paddingBottom: 60 }}>
    <span className="kicker">YOUR ORDER</span><h1>Order #{data?.order?.orderNumber ?? id}</h1>
    {error && <p className="notice error" role="alert">{error}</p>}{!data && !error && <p role="status">Loading your order...</p>}
    {data && <section className="dashboard-panel"><h2>{data.store?.name || data.restaurant.name}</h2>
      <div role="status" aria-live="polite"><h3>{statusLabel(flow, data.order.status)}</h3><p>{flow.note[data.order.status] || ''}</p></div>
      <StatusSteps kind={kind} storeType={data.store?.storeType} status={data.order.status}/>
      {kind === 'restaurant' && <p>{data.order.orderType}{data.order.tableNumber ? ` · Table ${data.order.tableNumber}` : ''}</p>}
      <OrderBody order={data.order}/>
      <PushControl slug={slug} orders={token ? [...saved, ...loadSavedOrders(slug).filter(o => !(o.kind === kind && o.id === Number(id)))] : []}/>
      <p><small>Last checked: {updated ? updated.toLocaleTimeString('en-IN') : '-'} · updates automatically while open</small></p>
      <div className="tracking-actions"><button className="btn btn-outline btn-small" onClick={load}>Refresh</button><button className="btn btn-outline btn-small" onClick={copy}>{copied ? 'Copied' : 'Copy tracking link'}</button><Link className="btn btn-outline btn-small" to={`/store/${slug}/orders`}>My orders</Link><Link className="btn btn-outline btn-small" to={`/store/${slug}`}>Back to store</Link></div>
    </section>}
  </main></>;
}

export function MyOrdersPage() {
  const { slug } = useParams();
  const [saved, setSaved] = useState(() => loadSavedOrders(slug)), [data, setData] = useState(null), [error, setError] = useFeedbackState(''), [updated, setUpdated] = useState(null);
  useEffect(() => { document.title = 'My orders - Digital Shop'; setSaved(loadSavedOrders(slug)); return onOrdersChanged(() => setSaved(loadSavedOrders(slug))); }, [slug]);
  const load = useCallback(async () => {
    try {
      const sub = await currentBrowserSubscription();
      const result = await api(`/public/stores/${encodeURIComponent(slug)}/my-orders`, { method: 'POST', body: { endpoint: sub?.endpoint || '', orders: saved.map(o => ({ kind: o.kind, id: o.id, token: o.token })) } });
      setData(result); setError(''); setUpdated(new Date());
      return result.orders.some(o => !flowFor(o.kind, result.store?.storeType).done.includes(o.status));
    } catch (e) { setError(e.message); return false; }
  }, [slug, saved]);
  usePoll(load, true);
  const orders = data?.orders || [];
  return <><Header shop={slug} business={data?.store || data?.restaurant}/><main className="container" style={{ maxWidth: 760, paddingTop: 40, paddingBottom: 60 }}>
    <span className="kicker">{data?.store?.name || 'MY ORDERS'}</span><h1>My orders</h1>
    <p>Orders placed from this browser. No login needed. Status updates appear here automatically.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading your orders...</p>}
    {data && !orders.length && <div className="empty-state"><h3>No orders yet</h3><p>Orders you place on this store from this browser will show up here.</p><Link className="btn btn-outline btn-small" to={`/store/${slug}`}>Browse the store</Link></div>}
    {orders.map(o => { const flow = flowFor(o.kind, data.store?.storeType); return <section className="dashboard-panel" key={`${o.kind}-${o.id}`} style={{ marginBottom: 16 }}>
      <h3>Order #{o.orderNumber ?? o.id} · {inr(o.total)}</h3><small>{new Date(o.createdAt).toLocaleString('en-IN')}</small>
      <div role="status" aria-live="polite"><strong>{statusLabel(flow, o.status)}</strong></div>
      <StatusSteps kind={o.kind} storeType={data.store?.storeType} status={o.status}/>
      <OrderBody order={o}/>
      {o.path && <Link className="btn btn-outline btn-small" to={o.path}>Open tracking page</Link>}
    </section>; })}
    <PushControl slug={slug} orders={saved} onChange={load}/>
    <p><small>Last checked: {updated ? updated.toLocaleTimeString('en-IN') : '-'} · Orders are tied to this browser's notification setting; they do not follow you to another phone.</small></p>
    <Link className="btn btn-outline btn-small" to={`/store/${slug}`}>Back to store</Link>
  </main></>;
}
export const RestaurantOrderTracking = () => <OrderTracking kind="restaurant"/>;
export const LeadOrderTracking = () => <OrderTracking kind="lead"/>;
export { trackingPath };
