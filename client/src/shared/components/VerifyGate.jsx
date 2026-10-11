import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { normalizePhone } from '../lib/phone-verify.js';
import { st } from '../lib/storefront-i18n.js';
import PhoneVerify from './PhoneVerify.jsx';

// Phone verification at the moment of ordering. Browsing never prompts. gate.run() is called when the customer taps the order button:
//  - verification off for this store (404)  -> onProceed() right away
//  - this browser is already verified for the phone -> onProceed() right away
//  - otherwise a modal opens (phone + "Verify with WhatsApp"), and onProceed() runs once verified.
// onProceed is always read fresh, so it sees the phone the customer just verified. The server still enforces everything.
export function useVerifyGate({ slug, phone, setPhone, onProceed, active = true, contextKey = '' }) {
  const [open, setOpen] = useState(false), [checking, setChecking] = useState(false), [go, setGo] = useState(false), [err, setErr] = useState('');
  const proceed = useRef(onProceed); proceed.current = onProceed;
  // One "intent" per tap. It is cancelled by a newer tap, by closing the modal, by the drawer closing, by a change of store or order
  // contents (contextKey), and by unmount. A cancelled intent can never open the modal or place an order.
  const gen = useRef(0), live = useRef(true);
  const cancel = () => { gen.current++; setOpen(false); setGo(false); setChecking(false); };
  useEffect(() => { live.current = true; return () => { live.current = false; gen.current++; }; }, []);
  useEffect(() => { cancel(); }, [slug, active, contextKey]);
  useEffect(() => { if (go) { setGo(false); proceed.current?.(); } }, [go]);
  const run = async () => {
    if (checking || !active) return;
    const g = ++gen.current, valid = () => live.current && g === gen.current;
    setChecking(true); setErr('');
    try {
      const r = await api(`/public/stores/${slug}/verify/session`, { feedback: false });
      if (!valid()) return;
      if (r.verified && (!normalizePhone(phone) || r.phone === normalizePhone(phone))) { if (!normalizePhone(phone)) setPhone(r.phone); setGo(true); }
      else setOpen(true);
    } catch (e) {
      if (!valid()) return;
      if (e?.status === 404) setGo(true); // verification is off for this store
      else setErr(e?.status === 403 && e.message ? e.message : st('Could not check phone verification.')); // 403 = this number is blocked here
    } finally { if (valid()) setChecking(false); }
  };
  const onState = v => { if (v.verified && live.current) { setOpen(false); setGo(true); } };
  const modal = <>
    {err && <small className="error-text" role="alert">{err}</small>}
    {open && active && createPortal(<VerifyModal slug={slug} phone={phone} setPhone={setPhone} onState={onState} onClose={cancel}/>, document.body)}
  </>; // portal: the modal can sit inside a <form> without Enter submitting the order
  return { run, checking, modal };
}

function VerifyModal({ slug, phone, setPhone, onState, onClose }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={st('Verify your phone to order')}>
      <h2>{st('Verify your phone to order')}</h2>
      <p className="drawer-hint">{st('We check your number with WhatsApp so the shop knows the order is really yours.')}</p>
      <label className="coupon-field">{st('Your phone')}<input type="tel" inputMode="tel" autoFocus value={phone} onChange={e => setPhone(e.target.value)} maxLength={25} autoComplete="tel" placeholder="+91 98765 43210"/></label>
      <PhoneVerify slug={slug} phone={phone} onState={onState} onPhone={setPhone}/>
      <button type="button" className="btn btn-outline full" onClick={onClose}>{st('Cancel')}</button>
    </div>
  </div>;
}
