import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';

const ACTIONS = { created: 'Link generated', emailed: 'Link emailed', used: 'Password set from link' };
const when = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Superadmin: generate a one-time set-password link for an owner. The URL is shown once; only its hash is stored.
export default function SetupLinkPanel({ owner, token }) {
  const [status, setStatus] = useState(null), [link, setLink] = useState(null), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(''), [note, setNote] = useState(''), [copied, setCopied] = useState(false);
  const load = () => api(`/admin/users/${owner.userId}/setup-link`, { token, feedback: false }).then(setStatus).catch(() => {});
  useEffect(() => { load(); }, [owner.userId]);
  const body = { ownerEmail: owner.email, confirm: true };
  const generate = async () => {
    setBusy('gen'); setNote(''); setCopied(false);
    try { const r = await api(`/admin/users/${owner.userId}/setup-link`, { method: 'POST', token, body, feedback: false }); setLink({ url: r.url, expiresAt: r.expiresAt }); setStatus(r); setConfirm(false); }
    catch (e) { setNote(e.message); } finally { setBusy(''); }
  };
  const email = async () => {
    setBusy('mail'); setNote('');
    try { const r = await api(`/admin/users/${owner.userId}/welcome-email`, { method: 'POST', token, body, feedback: false }); setNote(r.welcomeEmail.message); setLink(null); await load(); }
    catch (e) { setNote(e.message); } finally { setBusy(''); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setNote('Copy failed. Select the link and copy it by hand.'); } };
  return <div className="client-pay" style={{ marginBottom: 16 }}>
    <h4>Set-password link</h4>
    <p className="muted">{status?.active ? `A link is active until ${when(status.expiresAt)}. It works once.` : 'No active link. Generate one to let this owner choose their own password.'}</p>
    {link && <div className="notice" role="status"><p><strong>Copy this now. It is shown only once.</strong> Valid until {when(link.expiresAt)}, works once.</p>
      <input readOnly value={link.url} onFocus={e => e.target.select()} aria-label="One-time set-password link" style={{ width: '100%', marginBottom: 8 }}/>
      <button className="btn btn-outline btn-small" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>}
    {confirm
      ? <div className="remove-confirm" role="alertdialog" aria-label="Confirm new link"><p>Make a new link for <strong>{owner.email}</strong>? Any older link stops working.</p>
          <button className="btn btn-green btn-small" disabled={!!busy} onClick={generate}>{busy === 'gen' ? 'Generating...' : 'Generate link'}</button> <button className="btn btn-outline btn-small" onClick={() => setConfirm(false)}>Cancel</button></div>
      : <div className="inline-form" style={{ gap: 8 }}><button className="btn btn-outline btn-small" disabled={!!busy} onClick={() => setConfirm(true)}>Generate new link</button><button className="btn btn-outline btn-small" disabled={!!busy} onClick={email}>{busy === 'mail' ? 'Sending...' : 'Email a new link'}</button></div>}
    {note && <p className="notice" role="status">{note}</p>}
    {status?.events?.length > 0 && <ul className="client-pay-list">{status.events.map((e, i) => <li key={i}><strong>{ACTIONS[e.action] || e.action}</strong><span>{when(e.at)} · {e.by}</span></li>)}</ul>}
  </div>;
}
