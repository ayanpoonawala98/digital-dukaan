import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../lib/api.js';
import { pushSupported, subscribeBrowser, currentBrowserSubscription } from '../lib/my-orders.js';
import Busy from './Busy.jsx';

// Enrolls this device for new-order alerts for one store. Only the order number and total
// are shown in the notification - never the customer's name, phone or address.
export default function OrderAlertsCard({ token, storeId, slug }) {
  const supported = pushSupported();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const sub = await currentBrowserSubscription();
      if (!sub || !live) { if (live) setEnabled(false); return; }
      try { const r = await api(`/owner/${storeId}/order-push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, { token }); if (live) setEnabled(Boolean(r.enrolled)); } catch { /* leave off */ }
    })();
    return () => { live = false; };
  }, [token, storeId]);
  const enable = async () => {
    setBusy(true); setNote('');
    try {
      const sub = await subscribeBrowser(slug);
      await api(`/owner/${storeId}/order-push-subscription`, { method: 'POST', token, body: sub });
      setEnabled(true); setNote('This device will get new-order alerts.');
    } catch (err) { setNote(err.message === 'This store has not enabled notifications yet.' ? 'Notifications are not configured on this shop yet.' : (err.message || 'Could not enable alerts on this device')); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true); setNote('');
    try {
      const sub = await currentBrowserSubscription();
      if (sub) await api(`/owner/${storeId}/order-push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', token });
      setEnabled(false); setNote('New-order alerts are off for this device.');
    } catch (err) { setNote(err.message || 'Could not update alerts'); }
    finally { setBusy(false); }
  };
  if (!supported) return null;
  return <div className="dashboard-panel order-alerts-card">
    <h3><Bell size={18}/> New-order alerts on this device</h3>
    <p className="muted">Get a push notification the moment a new order arrives at this shop. It shows only the order number and total - customer details stay inside the dashboard.</p>
    {note && <p className={enabled ? 'notice success' : 'muted'}>{note}</p>}
    {enabled
      ? <button type="button" className="btn btn-outline" disabled={busy} onClick={disable}><Busy active={busy}>{busy ? 'Updating...' : 'Turn off alerts on this device'}</Busy></button>
      : <button type="button" className="btn btn-green" disabled={busy || !slug} onClick={enable}><Busy active={busy}><Bell size={16}/> {busy ? 'Enabling...' : 'Get new-order alerts'}</Busy></button>}
  </div>;
}
