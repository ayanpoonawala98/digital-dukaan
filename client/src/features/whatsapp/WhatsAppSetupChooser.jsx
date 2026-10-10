import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { SETUP_COPY as C, waTestLink, loadSetupState, saveSetupState } from './setup-choice.js';

// Copy-only chooser. It adds no provider support, sending or credential collection: basic WhatsApp needs only the shop number,
// and the automation card points at the provider card that already exists below.
export default function WhatsAppSetupChooser({ storeId, token, shopNumber }) {
  const [state, setState] = useState(() => loadSetupState(storeId));
  const [open, setOpen] = useState('');
  const [provider, setProvider] = useState(null); // null = unknown, true/false = real status from the provider card's API
  useEffect(() => { setState(loadSetupState(storeId)); setOpen(''); }, [storeId]);
  useEffect(() => { let live = true; setProvider(null); api(`/owner/${storeId}/whatsapp-byo/status`, { token, feedback: false }).then(r => { if (live) setProvider(Boolean(r?.connected)); }).catch(() => { if (live) setProvider(null); }); return () => { live = false; }; }, [storeId, token]);
  const update = patch => { const next = { ...state, ...patch }; setState(next); saveSetupState(storeId, next); };
  const link = waTestLink(shopNumber);
  if (state.later && !state.basicDone) return <p className="wa-choice-later"><button type="button" className="btn btn-outline btn-small" onClick={() => update({ later: false })}>{ot(C.heading)}</button></p>;
  return <section className="wa-choice dashboard-panel" aria-labelledby="wa-choice-h">
    <h3 id="wa-choice-h">{ot(C.heading)}</h3>
    <div className="wa-choice-grid">
      <article className="wa-choice-card">
        <h4>{ot(C.basic.title)}</h4>
        <p>{ot(C.basic.description)}</p>
        {state.basicDone && <p className="notice" role="status">{ot(C.basic.success)}</p>}
        <button type="button" className="btn btn-green" aria-expanded={open === 'basic'} onClick={() => setOpen(open === 'basic' ? '' : 'basic')}>{ot(C.basic.cta)}</button>
        {open === 'basic' && <ol className="wa-steps">
          <li><b>{ot(C.basic.steps[0])}</b><span>{link ? ot("Your shop number: +{v0}", {v0:String(shopNumber).replace(/\D/g, '')}) : ot("No shop number saved yet. Add it in Shop settings first.")}</span></li>
          <li><b>{ot(C.basic.steps[1])}</b>{link ? <a className="btn btn-outline btn-small" href={link} target="_blank" rel="noopener noreferrer">{ot("Open test link")}</a> : <span>{ot("Available once your number is saved.")}</span>}</li>
          <li><b>{ot(C.basic.steps[2])}</b><button type="button" className="btn btn-green btn-small" disabled={!link || state.basicDone} onClick={() => update({ basicDone: true, later: false })}>{state.basicDone ? ot("Saved") : ot(C.basic.steps[2])}</button></li>
        </ol>}
      </article>
      <article className="wa-choice-card">
        <h4>{ot(C.auto.title)}</h4>
        <p>{ot(C.auto.description)}</p>
        {provider !== null && <p className="wa-state" role="status"><span className={provider ? 'status live' : 'status paused'}>{provider ? ot(C.auto.states[1]) : ot(C.auto.states[0])}</span></p>}
        <button type="button" className="btn btn-outline" aria-expanded={open === 'auto'} onClick={() => setOpen(open === 'auto' ? '' : 'auto')}>{ot(C.auto.cta)}</button>
        {open === 'auto' && <><ol className="wa-steps">{C.auto.steps.map(s => <li key={s}><b>{ot(s)}</b></li>)}</ol><p className="muted">{ot(C.auto.helper)}</p></>}
      </article>
    </div>
    <p><button type="button" className="btn btn-outline btn-small" onClick={() => update({ later: true })}>{ot(C.later)}</button></p>
  </section>;
}
