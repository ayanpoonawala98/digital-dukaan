import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { normalizePhone, newClaimSecret } from '../lib/phone-verify.js';
import { st } from '../lib/storefront-i18n.js';

const POLL_MS = 2500;
export const Spinner = ({ label }) => <span className="ds-spin" role="img" aria-label={label || st('Loading')}/>;
const isOff = e => e?.status === 404; // the server answers 404 only while verification is off for this store

// "Verify with WhatsApp" under a phone field. Renders nothing only when this store has verification switched off.
// The session is a Secure HttpOnly cookie, so this component never sees or stores a token.
// onState({ required, verified }) lets the checkout hold the submit button. onPhone(phone) fills the field from a verified session.
export default function PhoneVerify({ slug, phone, onState, onPhone }) {
  const [mode, setMode] = useState('loading'); // loading | off | error | idle | waiting | verified
  const [challenge, setChallenge] = useState(null), [note, setNote] = useState(''), [starting, setStarting] = useState(false);
  const norm = normalizePhone(phone);
  const gen = useRef(0), claim = useRef(''), inflight = useRef(false), [opened, setOpened] = useState(false);
  // Parent callbacks are read through refs, so a new inline function on every parent render can never retrigger the session check.
  const cb = useRef({}); cb.current = { onState, onPhone };
  const apply = useCallback(m => { setMode(m); cb.current.onState?.({ required: m !== 'off', verified: m === 'verified' }); }, []);

  // Any change of store or phone invalidates everything in flight and drops back to "not verified" at once.
  const check = useCallback(() => {
    const g = ++gen.current; setChallenge(null); setNote(''); apply('loading');
    api(`/public/stores/${slug}/verify/session`, { feedback: false }).then(r => {
      if (g !== gen.current) return;
      if (r.verified && !norm) cb.current.onPhone?.(r.phone); // a verified browser fills its own number
      apply(r.verified && r.phone === norm ? 'verified' : 'idle');
    }).catch(e => { if (g !== gen.current) return; if (e?.status === 403) setNote(e.message || ''); apply(isOff(e) ? 'off' : 'error'); });
  }, [slug, norm, apply]);
  useEffect(() => { check(); return () => { gen.current++; }; }, [check]);

  // Single-flight polling: the next request starts only after the previous one finished.
  useEffect(() => {
    if (mode !== 'waiting' || !challenge) return undefined;
    const g = gen.current, end = Date.now() + challenge.expiresInSeconds * 1000;
    const timer = setInterval(async () => {
      if (g !== gen.current || inflight.current) return;
      if (Date.now() > end) { clearInterval(timer); setNote(st('The code expired. Start again.')); apply('idle'); return; }
      inflight.current = true;
      try {
        const r = await api(`/public/stores/${slug}/verify/status`, { method: 'POST', body: { challengeId: challenge.challengeId, claimSecret: claim.current }, feedback: false });
        if (g !== gen.current) return;
        if (r.status === 'blocked') { clearInterval(timer); setNote(st('This phone number cannot be used to order from this shop.')); apply('idle'); }
        else if (r.status === 'verified') { clearInterval(timer); setNote(''); apply('verified'); }
        else if (r.status === 'expired') { clearInterval(timer); setNote(st('The code expired. Start again.')); apply('idle'); }
      } catch { /* keep trying until it expires */ } finally { inflight.current = false; }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [mode, challenge, slug, apply]);

  if (mode === 'off' || mode === 'loading') return null;
  if (mode === 'error') return <div className="drawer-hint"><p className="notice warn" role="status">{note || st('Could not check phone verification.')} <button type="button" className="link-btn" onClick={check}>{st('Try again')}</button></p></div>;
  const start = async () => {
    if (starting) return;
    if (!norm) { setNote(st('Enter your phone number first.')); return; }
    setNote(''); setOpened(false); setStarting(true); const g = gen.current; claim.current = newClaimSecret();
    // One tap: the WhatsApp tab is opened inside the tap (browsers only allow that there) and pointed at the link once the code is ready.
    // If the browser blocks it, the waiting screen still shows the Open WhatsApp button.
    let win = null; try { win = window.open('about:blank', '_blank'); } catch { win = null; }
    const drop = () => { try { win?.close(); } catch { /* already closed */ } };
    try {
      const c = await api(`/public/stores/${slug}/verify/start`, { method: 'POST', body: { phone, claimSecret: claim.current }, feedback: false });
      if (g !== gen.current) { drop(); return; }
      let ok = false;
      if (win && !win.closed) { try { win.opener = null; win.location.href = c.link; ok = true; } catch { ok = false; } }
      setOpened(ok); setChallenge(c); apply('waiting');
    } catch (e) { drop(); if (g === gen.current) setNote(e.message); } finally { setStarting(false); }
  };
  const logout = async all => {
    setNote(''); const g = gen.current;
    try { await api(`/public/stores/${slug}/verify/logout`, { method: 'POST', body: all ? { all: true } : {}, feedback: false }); }
    catch (e) { if (g === gen.current) setNote(e.message || st('Could not log out. Try again.')); return; } // still verified: say so, never pretend
    gen.current++; apply('idle');
  };
  if (mode === 'verified') return <p className="drawer-hint" role="status">✓ {st('Phone verified with WhatsApp')} <button type="button" className="link-btn" onClick={() => logout(false)}>{st('Change number')}</button> · <button type="button" className="link-btn" onClick={() => logout(true)}>{st('Log out on all devices')}</button>{note && <span className="notice warn" role="alert"> {note}</span>}</p>;
  if (mode === 'waiting' && challenge) return <div className="drawer-hint" role="status">
    <p>{opened ? st('WhatsApp opened. Send the ready-made message, then come back here. Only send it if you started this yourself.') : st('Send the ready-made WhatsApp message, then come back here. Only send it if you started this yourself.')}</p>
    <a className={`btn ${opened ? 'btn-outline' : 'btn-green'}`} href={challenge.link} target="_blank" rel="noopener noreferrer">{st('Open WhatsApp')}</a>
    {challenge.qrSvg && <div className="desktop-only" style={{ width: 160, marginTop: 8 }} aria-label={st('Scan with your phone')} dangerouslySetInnerHTML={{ __html: challenge.qrSvg }}/>}
    <p className="ds-wait" aria-live="polite"><Spinner label={st('Waiting for your message...')}/> {st('Waiting for your message...')} <button type="button" className="link-btn" onClick={() => { gen.current++; setChallenge(null); apply('idle'); }}>{st('Start again')}</button></p>
  </div>;
  return <div className="drawer-hint"><button type="button" className="btn btn-green" style={{ marginBottom: 10 }} onClick={start} disabled={starting} aria-busy={starting}>{starting && <Spinner/>}{starting ? st('Starting...') : st('Verify with WhatsApp')}</button>{note && <p className="notice warn" role="status">{note}</p>}</div>;
}
