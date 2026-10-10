import React, { useEffect, useState } from 'react';
import { api, inr } from '../../shared/lib/api.js';
import { Notice } from '../../shared/components/chrome.jsx';
import Busy from '../../shared/components/Busy.jsx';
import LoadSkeleton from '../../shared/components/LoadSkeleton.jsx';
import './clients.css';

const FILTERS = [['all', 'All'], ['trial', 'Trial'], ['active', 'Active'], ['past_due', 'Past due'], ['overdue', 'Overdue'], ['due', 'Due this month'], ['paid', 'Paid this month'], ['suspended', 'Suspended']];
const LABEL = { trial: 'Trial', active: 'Active', past_due: 'Past due', suspended: 'Suspended' };
const MONTH = { trial: 'Free trial', paid: 'Paid', due: 'Due', suspended: 'Suspended', no_fee: 'No fee set' };
const thisMonth = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);

function ClientCard({ c, token, onChanged, setMsg }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [pays, setPays] = useState([]);
  const [busy, setBusy] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const [confirmMail, setConfirmMail] = useState(false);
  const run = async (key, fn, ok) => { setBusy(key); setMsg({}); try { await fn(); if (ok) setMsg({ success: ok }); await onChanged(); if (open) await loadPays(); } catch (e) { setMsg({ error: e.message }); } finally { setBusy(''); } };
  const loadPays = async () => { const r = await api(`/admin/clients/${c.userId}/payments`, { token, feedback: false }); setPays(r.payments); };
  const toggle = async () => { if (!open) { setForm({ plan: c.plan, monthlyFee: c.monthlyFee, trialStart: c.trialStart, trialEnd: c.trialEnd, status: c.status, storeLimit: c.storeLimit, notes: c.notes }); try { await loadPays(); } catch (e) { setMsg({ error: e.message }); } } setOpen(!open); };
  const save = e => { e.preventDefault(); run('save', () => api(`/admin/clients/${c.userId}`, { method: 'PATCH', token, body: { ...form, monthlyFee: Number(form.monthlyFee), storeLimit: Number(form.storeLimit) }, feedback: false }), 'Client saved.'); };
  const paidMonths = pays.map(p => p.month);
  const tone = c.overdue ? 'bad' : c.monthPayment === 'due' ? 'warn' : c.trialEndingSoon ? 'warn' : 'ok';
  return <article className={`client-card ${tone}`}>
    <div className="client-head" onClick={toggle} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle()} aria-expanded={open}>
      <div className="client-id"><strong>{c.name}</strong><span>{c.email}</span><small>{c.stores.map(s => s.name).join(', ') || 'No store yet'}</small></div>
      <div className="client-facts">
        <span className={`status ${c.effectiveStatus === 'active' || c.effectiveStatus === 'trial' ? 'live' : 'paused'}`}>{LABEL[c.effectiveStatus]}</span>
        <span className={`pay-pill ${c.monthPayment}${c.overdue ? ' overdue' : ''}`}>{c.overdue ? 'Overdue' : MONTH[c.monthPayment]}</span>
        <span className="client-meta">{c.inTrial ? `${c.trialDaysLeft} day${c.trialDaysLeft === 1 ? '' : 's'} left in trial` : `${c.plan} · ${inr(c.monthlyFee)}/mo`}</span>
        <span className="client-meta">Stores {c.storesUsed}/{c.storeLimit}</span>
      </div>
    </div>
    {open && form && <div className="client-body">
      <form className="client-form" onSubmit={save}>
        <label>Plan<input value={form.plan} maxLength={60} onChange={e => setForm({ ...form, plan: e.target.value })}/></label>
        <label>Monthly fee (Rs)<input type="number" min="0" value={form.monthlyFee} onChange={e => setForm({ ...form, monthlyFee: e.target.value })}/></label>
        <label>Trial starts<input type="date" value={form.trialStart} onChange={e => setForm({ ...form, trialStart: e.target.value })}/></label>
        <label>Trial ends<input type="date" value={form.trialEnd} onChange={e => setForm({ ...form, trialEnd: e.target.value })}/></label>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option></select></label>
        <label>Store limit<input type="number" min="0" max="100" value={form.storeLimit} onChange={e => setForm({ ...form, storeLimit: e.target.value })}/></label>
        <label className="wide">Notes<input value={form.notes} maxLength={500} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
        <button className="btn btn-green btn-small" disabled={!!busy}><Busy active={busy === 'save'}>{busy === 'save' ? 'Saving...' : 'Save changes'}</Busy></button>
      </form>
      <div className="client-pay">
        <h4>Payments</h4>
        <div className="client-pay-add"><input type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month to mark paid"/>
          <button className="btn btn-green btn-small" disabled={!!busy || paidMonths.includes(month)} onClick={() => run('pay', () => api(`/admin/clients/${c.userId}/payments`, { method: 'POST', token, body: { month }, feedback: false }), `${month} marked paid (${inr(c.monthlyFee)}).`)}><Busy active={busy === 'pay'}>{paidMonths.includes(month) ? 'Already paid' : `Mark ${month} paid`}</Busy></button>
          <button className="btn btn-outline btn-small" disabled={!!busy} onClick={() => setConfirmMail(true)}>Send payment mail</button></div>
        {confirmMail && <div className="remove-confirm" role="alertdialog" aria-label="Confirm payment mail"><p>Email <strong>{c.email}</strong> their subscription status now?</p><button className="btn btn-outline btn-small" onClick={() => setConfirmMail(false)}>Cancel</button><button className="btn btn-green btn-small" disabled={!!busy} onClick={() => { setConfirmMail(false); run('mail', () => api(`/admin/clients/${c.userId}/payment-mail`, { method: 'POST', token, feedback: false }), `Payment mail sent to ${c.email}.`); }}>Send</button></div>}
        {pays.length ? <ul className="client-pay-list">{pays.map(p => <li key={p.id}><strong>{p.month}</strong><span>{inr(p.amount)} · {p.method} · {p.paidOn}</span><button className="table-button" disabled={!!busy} onClick={() => run('undo' + p.id, () => api(`/admin/clients/${c.userId}/payments/${p.id}`, { method: 'DELETE', token, feedback: false }), `${p.month} payment removed.`)}>Undo</button></li>)}</ul> : <p className="muted">No payments recorded yet.</p>}
      </div>
    </div>}
  </article>;
}

export default function Clients({ token }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({});
  const [digestBusy, setDigestBusy] = useState(false);
  const load = async (quiet = true) => { if (!quiet) setLoading(true); try { setData(await api(`/admin/clients?status=${filter}&q=${encodeURIComponent(q)}`, { token, feedback: false })); } catch (e) { setMsg({ error: e.message }); } finally { setLoading(false); } };
  useEffect(() => { const t = setTimeout(() => load(false), q ? 250 : 0); return () => clearTimeout(t); }, [filter, q]);
  const s = data?.summary, al = data?.alerts;
  const sendDigest = async () => { setDigestBusy(true); setMsg({}); try { const r = await api('/admin/clients-digest', { method: 'POST', token, feedback: false }); setMsg({ success: r.message }); } catch (e) { setMsg({ error: e.message }); } finally { setDigestBusy(false); } };
  return <div className="clients">
    <Notice error={msg.error} success={msg.success}/>
    {loading && !data ? <LoadSkeleton label="Loading clients" cards={4} rows={3}/> : data && <>
      <div className="stat-grid">{[['Clients', s.total], ['In trial', s.trial], ['Due this month', s.dueThisMonth], ['Overdue', s.pastDue], ['Paid this month', s.paidThisMonth], ['Monthly recurring', inr(s.monthlyRecurring)]].map(([l, v]) => <div className="stat-card" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
      {(al.overdue.length > 0 || al.trialsEndingSoon.length > 0) && <section className="dashboard-panel client-alerts" role="status">
        {al.overdue.length > 0 && <p className="alert-bad"><strong>Overdue payments:</strong> {al.overdue.map(a => `${a.name} (${inr(a.monthlyFee)}, due ${a.dueDate})`).join(' · ')}</p>}
        {al.trialsEndingSoon.length > 0 && <p className="alert-warn"><strong>Trials ending soon:</strong> {al.trialsEndingSoon.map(a => `${a.name} (${a.daysLeft === 0 ? 'today' : a.daysLeft + ' day' + (a.daysLeft === 1 ? '' : 's')})`).join(' · ')}</p>}
      </section>}
      <section className="dashboard-panel">
        <div className="leads-head"><div><h3>Clients</h3><p className="muted">Every store owner: trial, plan, store limit and monthly payment. You mark payments yourself; no payment gateway is connected.</p></div><button className="btn btn-outline btn-small" disabled={digestBusy} onClick={sendDigest}><Busy active={digestBusy}>{digestBusy ? 'Sending...' : 'Email me the digest now'}</Busy></button></div>
        <div className="filter-tabs">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <input className="client-search" placeholder="Search name, email or store" value={q} onChange={e => setQ(e.target.value)} aria-label="Search clients"/>
        <div className="client-list">{data.clients.length ? data.clients.map(c => <ClientCard key={c.userId} c={c} token={token} onChanged={() => load(true)} setMsg={setMsg}/>) : <p className="muted">No clients match this filter.</p>}</div>
        <p className="muted client-foot">A monthly summary is emailed to digital.shops.website@gmail.com on the 1st (IST). Store owners never get automatic emails.</p>
      </section>
    </>}
  </div>;
}
