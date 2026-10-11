import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { setToken, normalizePhone, newSessionSecret } from '../lib/phone-verify.js';
import { st } from '../lib/storefront-i18n.js';

const POLL_MS = 2500;
const isOff = e => /Not found/i.test(e?.message || ''); // the server answers 404 only while verification is switched off

// "Verify with WhatsApp" under a phone field. Renders nothing only when the store has verification switched off.
// onState({ required, verified }) lets the checkout hold the submit button. The cart is never touched here.
export default function PhoneVerify({ slug, phone, onState }) {
  const [mode, setMode] = useState('loading'); // loading | off | error | idle | waiting | verified
  const [challenge, setChallenge] = useState(null), [note, setNote] = useState('');
  const norm = normalizePhone(phone);
  const gen = useRef(0), secret = useRef(''), inflight = useRef(false);
  const apply = useCallback(m => { setMode(m); onState?.({ required: m !== 'off', verified: m === 'verified' }); }, [onState]);

  // Any change of store or phone invalidates everything in flight and drops back to "not verified" at once.
  const check = useCallback(() => {
    const g = ++gen.current; setChallenge(null); setNote(''); apply('loading');
    api(`/public/stores/${slug}/verify/session`, { feedback: false }).then(r => {
      if (g !== gen.current) return;
      apply(r.verified && r.phone === norm ? 'verified' : 'idle');
    }).catch(e => { if (g === gen.current) apply(isOff(e) ? 'off' : 'error'); });
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
        const r = await api(`/public/stores/${slug}/verify/status`, { method: 'POST', body: { challengeId: challenge.challengeId, sessionToken: secret.current }, feedback: false });
        if (g !== gen.current) return;
        if (r.status === 'verified') { clearInterval(timer); setToken(slug, secret.current); setNote(''); apply('verified'); }
        else if (r.status === 'expired') { clearInterval(timer); setNote(st('The code expired. Start again.')); apply('idle'); }
      } catch { /* keep trying until it expires */ } finally { inflight.current = false; }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [mode, challenge, slug, apply]);

  if (mode === 'off' || mode === 'loading') return null;
  if (mode === 'error') return <div className="drawer-hint"><p className="notice warn" role="status">{st('Could not check phone verification.')} <button type="button" className="link-btn" onClick={check}>{st('Try again')}</button></p></div>;
  const start = async () => {
    if (!norm) { setNote(st('Enter your phone number first.')); return; }
    setNote(''); const g = gen.current; secret.current = newSessionSecret();
    try { const c = await api(`/public/stores/${slug}/verify/start`, { method: 'POST', body: { phone }, feedback: false }); if (g !== gen.current) return; setChallenge(c); apply('waiting'); }
    catch (e) { if (g === gen.current) setNote(e.message); }
  };
  const change = async () => { gen.current++; try { await api(`/public/stores/${slug}/verify/logout`, { method: 'POST', feedback: false }); } catch { /* already gone */ } setToken(slug, ''); apply('idle'); };
  if (mode === 'verified') return <p className="drawer-hint" role="status">✓ {st('Phone verified with WhatsApp')} <button type="button" className="link-btn" onClick={change}>{st('Change number')}</button></p>;
  if (mode === 'waiting' && challenge) return <div className="drawer-hint" role="status">
    <p>{st('Send the ready-made WhatsApp message, then come back here. Only send it if you started this yourself.')}</p>
    <a className="btn btn-green" href={challenge.link} target="_blank" rel="noopener noreferrer">{st('Open WhatsApp')}</a>
    {challenge.qrSvg && <div className="desktop-only" style={{ width: 160, marginTop: 8 }} aria-label={st('Scan with your phone')} dangerouslySetInnerHTML={{ __html: challenge.qrSvg }}/>}
    <p>{st('Waiting for your message...')} <button type="button" className="link-btn" onClick={() => { gen.current++; setChallenge(null); apply('idle'); }}>{st('Cancel')}</button></p>
  </div>;
  return <div className="drawer-hint"><button type="button" className="btn btn-outline" onClick={start}>{st('Verify with WhatsApp')}</button>{note && <p className="notice warn" role="status">{note}</p>}</div>;
}
