import { statusLabel } from '../../shared/lib/owner-ui.js';
import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';

const money = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = d => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';

// Phase 1 is web push. Email and SMS stay switched off until the owner connects their own provider in Notifications.
function Composer({ title, children, onSend, channel, limit = 180, busy }) {
  const [form, setForm] = useState({ title: '', body: '', subject: '', confirmCosts: false, image: 'cover' });
  const isPush = channel === 'push', isEmail = channel === 'email';
  const submit = e => { e.preventDefault(); onSend(form, () => setForm({ title: '', body: '', subject: '', confirmCosts: false })); };
  return <form onSubmit={submit} className="customer-form"><h4>{title}</h4>{children}
    {isPush && <label>{ot("Title")}<input required maxLength={65} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={ot("Weekend offer")}/></label>}
    {isEmail && <label>{ot("Subject")}<input required maxLength={150} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}/></label>}
    {isPush && <label>{ot("Picture")}<select value={form.image} onChange={e => setForm({ ...form, image: e.target.value })}><option value="cover">{ot("Shop cover photo")}</option><option value="none">{ot("No picture")}</option></select></label>}
    <label>{ot("Message")}<textarea required maxLength={limit} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}/></label><small className="muted">{form.body.length}/{limit}</small>
    {!isPush && <label className="perm-check"><input type="checkbox" checked={form.confirmCosts} onChange={e => setForm({ ...form, confirmCosts: e.target.checked })}/> {ot("I understand my own")} {ot(channel)} {ot("provider may charge me for this message.")}</label>}
    <button className="btn btn-green" disabled={busy || (!isPush && !form.confirmCosts)}>{busy ? ot("Sending...") : ot("Send")}</button></form>;
}

export function CustomerDetail({ token, storeId, id, staffMode, onClose, onChanged }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState('');
  const base = `/owner/${storeId}/customers/${id}`;
  const load = () => api(base, { token, feedback: false }).then(setData).catch(e => setError(e.message));
  useEffect(() => { setData(null); setError(''); setNotice(''); setOpen(''); load(); }, [id, storeId]);
  const run = fn => async (...args) => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(...args); await load(); onChanged?.(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const sendPush = run(async (f, reset) => { const r = await api(`${base}/push`, { token, method: 'POST', body: { title: f.title, body: f.body, image: f.image } }); setNotice(r.sent ? `Sent to ${r.sent} of ${r.devices} device(s)` : 'No device accepted it. Their browser may have notifications turned off.'); reset(); });
  const sendOther = channel => run(async (f, reset) => { await api(`${base}/message`, { token, method: 'POST', body: { channel, subject: f.subject, message: f.body, confirmCosts: f.confirmCosts } }); setNotice(`${channel === 'sms' ? 'SMS' : 'Email'} sent`); reset(); });
  const removeDevice = deviceId => run(async () => { await api(`${base}/devices/${deviceId}`, { token, method: 'DELETE' }); });
  if (error && !data) return <div className="dashboard-panel"><p className="notice error" role="alert">{ot(error)}</p><button className="btn btn-outline" onClick={onClose}>{ot("Back")}</button></div>;
  if (!data) return <div className="dashboard-panel"><p className="muted">{ot("Loading customer...")}</p></div>;
  const { customer: c, devices, orders, messages, channels } = data;
  const wa = `https://wa.me/${c.phone}`;
  const Btn = ({ ch, label }) => <button type="button" className="btn btn-outline" disabled={!channels[ch].enabled || (ch !== 'push' && staffMode)} title={channels[ch].reason} onClick={() => setOpen(open === ch ? '' : ch)}>{label}</button>;
  return <div className="dashboard-panel customer-detail">
    <button className="btn btn-outline" style={{ marginBottom: 14 }} onClick={onClose}>{ot("Back to customers")}</button>
    <h3>{c.name || ot("Unnamed customer")}</h3>
    <p>{c.phone}{c.email ? ` - ${c.email}` : ''}</p>
    <p className="muted">{c.orderCount} {ot("order(s),")} {money(c.totalSpent)} {ot("total, last order")} {when(c.lastOrderAt)}{ot(". Added from:")} {c.source}.</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <div className="inline-form"><Btn ch="push" label={ot("Send notification ({v0})", {v0: devices.length})}/><Btn ch="email" label={ot("Send email")}/><Btn ch="sms" label={ot("Send SMS")}/><a className="btn btn-outline" href={wa} target="_blank" rel="noopener noreferrer">{ot("Open WhatsApp")}</a></div>
    {['push', 'email', 'sms'].filter(ch => !channels[ch].enabled && channels[ch].reason).map(ch => <p key={ch} className="muted"><small>{ch === 'sms' ? ot("SMS") : ch[0].toUpperCase() + ch.slice(1)}: {channels[ch].reason}.</small></p>)}
    {open === 'push' && <Composer title={ot("Send a notification")} channel="push" busy={busy} onSend={sendPush}/>}
    {open === 'email' && <Composer title={ot("Send an email from your own provider")} channel="email" limit={2000} busy={busy} onSend={sendOther('email')}/>}
    {open === 'sms' && <Composer title={ot("Send an SMS from your own provider")} channel="sms" limit={160} busy={busy} onSend={sendOther('sms')}/>}
    <h4>{ot("Devices")}</h4>
    {devices.length ? <ul>{devices.map(d => <li key={d.id}>{d.label}{ot(", added")} {when(d.createdAt)} <button className="table-button" disabled={busy} onClick={() => removeDevice(d.id)()}>{ot("Remove")}</button></li>)}</ul> : <p className="muted">{ot("No browser has turned on notifications yet. It is saved automatically when the customer allows notifications after ordering.")}</p>}
    <h4>{ot("Order history")}</h4>
    {orders.length ? <div className="table-wrap"><table><thead><tr><th>{ot("Order")}</th><th>{ot("Date")}</th><th>{ot("Items")}</th><th>{ot("Status")}</th><th>{ot("Total")}</th></tr></thead><tbody>{orders.map(o => <tr key={`${o.kind}-${o.id}`}><td>#{o.number}</td><td>{when(o.createdAt)}</td><td>{o.summary}</td><td>{statusLabel(o.status)}</td><td>{money(o.total)}</td></tr>)}</tbody></table></div> : <p className="muted">{ot("No orders found for this number.")}</p>}
    {c.notes && <><h4>{ot("Notes")}</h4><p>{c.notes}</p></>}
    {messages.length > 0 && <><h4>{ot("Messages sent")}</h4><ul>{messages.map(m => <li key={m.id}>{when(m.createdAt)} - {m.channel}: {m.title ? `${m.title} - ` : ''}{m.body} ({m.sent ? 'sent' : ot("not delivered")})</li>)}</ul></>}
  </div>;
}

export function BroadcastPanel({ token, storeId, total, devices, onClose }) {
  const [channels, setChannels] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { api(`/owner/${storeId}/customers/channels`, { token, feedback: false }).then(setChannels).catch(() => {}); }, [storeId]);
  const send = async (f, reset) => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { const r = await api(`/owner/${storeId}/customers/broadcast/push`, { token, method: 'POST', body: { title: f.title, body: f.body, image: f.image } }); if (!r.devices) { setNotice('No customer devices subscribed yet. Customers get notifications after they allow them in their browser on your store page.'); return; } setNotice(`Delivered to ${r.sent} device(s) of ${r.customers} customer(s)${r.failed ? `; ${r.failed} did not accept` : ''}.`); reset(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="customer-form"><h3>{ot("Notify all customers")}</h3>
    <p className="muted">{ot("Goes to every customer who allowed notifications in their browser (")}{channels?.pushDevices ?? devices} {ot("device(s) on this page's customers). Customers who opted out are skipped. Up to 5 broadcasts an hour. Free.")}</p>
    {channels && !channels.push.configured && <p className="notice error">{ot("Push is not configured on this server yet.")}</p>}
    {error && <p className="notice error" role="alert">{ot(error)}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <Composer title={ot("Message")} channel="push" busy={busy} onSend={send}/>
    <p className="muted"><small>{ot("Email and SMS to everyone:")} {channels?.email.configured || channels?.sms.configured ? ot("use Email & SMS offers, which records consent and opt-out links.") : ot("connect your own provider in Notifications, then use Email & SMS offers.")}</small></p>
    <button className="btn btn-outline" onClick={onClose}>{ot("Close")}</button></div>;
}

// Email or SMS to the customers ticked in the list. Only opted-in customers with an address are sent to; the rest are skipped.
export function BulkMessagePanel({ token, storeId, channel, selected, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const label = channel === 'sms' ? 'SMS' : 'email';
  const eligible = selected.filter(c => c.optInStatus === 'opted_in' && (channel === 'sms' ? c.phone : c.email));
  const send = async (f, reset) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const r = await api(`/owner/${storeId}/customers/broadcast/message`, { token, method: 'POST', body: { channel, customerIds: selected.map(c => c.id), subject: f.subject, message: f.body, confirmCosts: f.confirmCosts }, feedback: false });
      setNotice(`Sent to ${r.sent} customer(s)${r.failed ? `; ${r.failed} not accepted by your provider` : ''}${r.skipped.length ? `; ${r.skipped.length} skipped (not opted in, no ${channel === 'sms' ? 'phone' : 'email'}, or no provider)` : ''}.`);
      reset(); onDone?.();
    } catch (e) { setError(e.message || ot("Could not send")); } finally { setBusy(false); }
  };
  return <div className="customer-form"><h3>{channel === 'sms' ? ot("SMS") : ot("Email")} {ot("to")} {selected.length} {ot("selected customer(s)")}</h3>
    <p className="muted">{eligible.length} {ot("of")} {selected.length} {ot("can receive this")} {label} {ot("(opted in and have")} {channel === 'sms' ? ot("a phone number") : ot("an email")}{ot("). The others are skipped. Sent through your own")} {label} {ot("provider, which may charge you. Up to 100 customers and 5 bulk sends an hour.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <Composer title={ot("Message")} channel={channel} limit={channel === 'sms' ? 160 : 2000} busy={busy} onSend={send}/>
    <button type="button" className="btn btn-outline" onClick={onClose}>{ot("Close")}</button></div>;
}
