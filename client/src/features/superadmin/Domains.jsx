import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, RefreshCw, Search, Globe, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../app/auth.jsx';
import { api, download } from '../../shared/lib/api.js';
import { listState, LOAD_FAILED, CLIENT_GUIDES, stateLabel, toneOf, stepsOf, problemOf, recordCards, actions, age, confirmDisconnectText, flowStep, FLOW, codeText } from './domains-model.js';
import './domains.css';

const Dot = ({ tone, children }) => <span className={`dm-badge dm-${tone}`}><span className="dm-dot" aria-hidden="true"/>{children}</span>;
// Tinted alert, same pattern as System status: icon, short explanation, the raw reason kept inside as a Code line.
const Alert = ({ title, children, detail, onRetry }) => <div className="dm-alert" role="alert"><TriangleAlert size={20} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{detail && <p>Code: <code>{detail}</code></p>}{onRetry && <button type="button" className="btn btn-outline btn-small" onClick={onRetry}><RefreshCw size={14}/> Retry</button>}</div></div>;
const Guides = () => <div className="dm-guides" role="group" aria-label="Client guides"><strong>Client guides to share</strong><div className="dm-actions">{CLIENT_GUIDES.map(g => <a key={g.lang} className="btn btn-outline" href={g.href} download={g.file} lang={g.lang} type="application/pdf"><Download size={15}/> {g.label}</a>)}</div></div>;
const when = iso => iso ? `${new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST` : 'Not checked';

function Records({ d }) {
  const [copied, setCopied] = useState('');
  const copy = async (key, text) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { setCopied('failed'); } };
  const cards = recordCards(d);
  return <div className="dm-records"><h4>DNS records</h4>
    {cards.map((c, i) => <div className="dm-record" key={i} role="group" aria-label={`${c.kind} ${c.type} record`}>
      <strong>{c.kind} record</strong>
      {[['Type', c.type], ['Host', c.host], ['Value', c.value], ['TTL', c.ttlText]].map(([k, v]) => <div className="dm-rf" key={k}><span>{k}</span><code>{v}</code><button type="button" className="btn btn-outline btn-small" onClick={() => copy(`${i}${k}`, v)} aria-label={`Copy ${c.kind} record ${k}`}><Copy size={14}/> {copied === `${i}${k}` ? 'Copied' : 'Copy'}</button></div>)}
    </div>)}
    {d.records?.routingNote && <p className="dm-note" role="note"><strong>Routing records:</strong> not available yet. {d.records.routingNote}</p>}
    {d.ownershipExpiresAt && d.steps.ownership.status !== 'ok' && <p className="muted">Ownership record expires {when(d.ownershipExpiresAt)}. Use "New ownership record" to rotate it.</p>}
  </div>;
}

function Detail({ id, token, onChange, onClose }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(''), [confirm, setConfirm] = useState(false), [typed, setTyped] = useState('');
  useEffect(() => { let on = true; api(`/admin/domains/${id}`, { token, feedback: false }).then(r => on && setD(r.domain)).catch(e => on && setErr(e.message)); return () => { on = false; }; }, [id]);
  const run = async (name, path, body) => { if (busy) return; setBusy(name); setErr(''); try { const r = await api(`/admin/domains/${id}/${path}`, { method: 'POST', token, body, feedback: false }); setD(r.domain); onChange(); setConfirm(false); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  if (!d) return <div className="dashboard-panel">{err ? <><Alert title="Could not load this domain" detail={err}>Nothing was changed.</Alert><button className="btn btn-outline" onClick={onClose}>Back to list</button></> : <p role="status">Loading domain...</p>}</div>;
  const a = actions(d), problem = problemOf(d), tone = toneOf(d.state);
  return <div className="dashboard-panel dm-detail">
    <div className="dm-head"><div><h3 className="dm-host">{d.hostname}</h3><p className="muted">Store: <strong>{d.storeName || `#${d.businessId}`}</strong></p></div><Dot tone={tone}>{stateLabel(d.state)}</Dot></div>
    <ol className="dm-flow" aria-label="Progress">{FLOW.map((s, i) => <li key={s} className={i + 1 < flowStep(d) ? 'done' : i + 1 === flowStep(d) ? 'now' : ''} aria-current={i + 1 === flowStep(d) ? 'step' : undefined}>{s}</li>)}</ol>
    {d.serverSetupRequired && <div className="dm-note" role="status"><strong>Server setup required.</strong> Activation and the personalised routing records are switched off until the Digital Shop server is set up for custom domains.</div>}
    <div className="dm-steps">{stepsOf(d).map(s => <div key={s.label}><span className="muted">{s.label}</span><Dot tone={s.tone}>{s.text}</Dot></div>)}</div>
    {problem && <div className="dm-reason" role="alert"><p>{problem.step}: {problem.text}</p><p>Code: <code>{problem.code}</code></p></div>}
    <p><strong>Next:</strong> {d.nextAction}</p>
    <p className="muted">Last checked {when(d.lastCheckedAt)} ({age(d.lastCheckedAt)})</p>
    {d.state !== 'disconnected' && <Records d={d}/>}
    {err && <Alert title="That did not work">{err}</Alert>}
    <div className="dm-actions">
      <button className="btn btn-green" disabled={!a.check || !!busy} onClick={() => run('check', 'check')}><RefreshCw size={15}/> {busy === 'check' ? 'Checking...' : 'Check again'}</button>
      {a.rotate && <button className="btn btn-outline" disabled={!!busy} onClick={() => run('rotate', 'rotate')}>New ownership record</button>}
      <button className="btn btn-outline" disabled={!a.provision || !!busy} onClick={() => run('prov', 'provision')}>Start HTTPS setup</button>
      <button className="btn btn-outline" disabled={!a.activate || !!busy} onClick={() => run('act', 'activate')} title={a.activate ? '' : d.serverSetupRequired ? 'Available after server setup' : 'Every check must pass first'}>Activate</button>
      <button className="btn btn-outline" onClick={() => download(a.guide === 'generic' ? '/admin/domains/guide' : `/admin/domains/${id}/guide`, a.guide === 'generic' ? 'custom-domain-guide.txt' : `domain-guide-${d.hostname}.txt`, token).catch(() => {})}><Download size={15}/> Download client guide{a.guide === 'generic' ? ' (general, text file)' : ' (text file)'}</button>
      {a.disconnect && <button className="btn btn-outline danger" onClick={() => setConfirm(true)}>Disconnect</button>}
      <button className="btn btn-outline" onClick={onClose}>Back to list</button>
    </div>
    <Guides/>
    {a.guide === 'generic' && <p className="muted">The general guide explains the steps. Exact DNS values come after server setup.</p>}
    {confirm && <div className="dm-confirm" role="alertdialog" aria-label={`Disconnect ${d.hostname}`}>
      <p>{confirmDisconnectText(d)}</p>
      <label>Type <code>{d.hostname}</code> to confirm<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck="false"/></label>
      <div className="dm-actions"><button className="btn btn-outline" onClick={() => { setConfirm(false); setTyped(''); }}>Cancel</button><button className="btn btn-outline danger" disabled={typed !== d.hostname || !!busy} onClick={() => run('detach', 'detach', { confirm: typed })}>{busy === 'detach' ? 'Disconnecting...' : 'Disconnect domain'}</button></div>
    </div>}
  </div>;
}

function Connect({ token, onSaved }) {
  const [q, setQ] = useState(''), [stores, setStores] = useState({ stores: [], total: 0, page: 1 }), [store, setStore] = useState(null), [host, setHost] = useState(''), [review, setReview] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const loadStores = useCallback(async (page = 1, append = false) => { const n = ++seq.current; try { const r = await api(`/admin/domains/stores?${new URLSearchParams({ q, page })}`, { token, feedback: false }); if (n === seq.current) setStores(p => ({ ...r, stores: append ? [...p.stores, ...r.stores] : r.stores })); } catch (e) { setErr(e.message); } }, [q, token]);
  useEffect(() => { const t = setTimeout(() => loadStores(1), 250); return () => clearTimeout(t); }, [loadStores]);
  const doReview = async e => { e.preventDefault(); setErr(''); setReview(null); setBusy(true); try { setReview(await api('/admin/domains/preview', { method: 'POST', token, body: { hostname: host, businessId: store.id }, feedback: false })); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const save = async () => { setBusy(true); setErr(''); try { const r = await api('/admin/domains', { method: 'POST', token, body: { hostname: review.hostname, businessId: store.id }, feedback: false }); onSaved(r.domain.id); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return <div className="dashboard-panel dm-connect"><h3>Connect a client's domain</h3>
    <p className="muted">Pick the store, enter the exact hostname, review it, then save. Nothing goes live until every check passes.</p>
    <fieldset className="dm-fs"><legend>1. Select a store</legend>
      <label className="dm-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search stores by name or link</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search stores by name or link"/></label>
      <ul className="dm-stores">{stores.stores.map(s => <li key={s.id}><button type="button" aria-pressed={store?.id === s.id} className={store?.id === s.id ? 'sel' : ''} onClick={() => { setStore(s); setReview(null); }}><strong>{s.name}</strong><small>{s.slug}</small></button></li>)}{!stores.stores.length && <li className="muted">No stores match.</li>}</ul>
      {stores.stores.length < stores.total && <button className="btn btn-outline btn-small" onClick={() => loadStores(stores.page + 1, true)}>Show more stores</button>}
    </fieldset>
    <form onSubmit={doReview}><fieldset className="dm-fs" disabled={!store}><legend>2. Enter the exact hostname</legend>
      <label>Hostname<input value={host} onChange={e => { setHost(e.target.value); setReview(null); }} placeholder="shop.example.com" autoComplete="off" spellCheck="false" inputMode="url"/></label>
      <button className="btn btn-green" disabled={!store || !host.trim() || busy}>{busy ? 'Checking...' : 'Review'}</button>
    </fieldset></form>
    {err && <Alert title="That did not work">{err}</Alert>}
    {review && <div className="dm-review" role="region" aria-label="Review before saving"><h4>3. Review</h4>
      <p>Hostname: <strong className="dm-host">{review.hostname}</strong>{review.display !== review.hostname && <> ({review.display})</>}</p><p>Store: <strong>{review.store.name}</strong></p>
      {review.conflict ? <Alert title="Cannot connect this domain" detail={review.conflict}>{codeText(review.conflict)}</Alert> : <>{review.alreadyConnected && <p className="muted">Already saved for this store. Saving opens it.</p>}<button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save as pending'}</button></>}
    </div>}
  </div>;
}

export default function Domains() {
  const { session } = useAuth(), token = session.token;
  const [list, setList] = useState(null), [q, setQ] = useState(''), [view, setView] = useState('list'), [openId, setOpenId] = useState(null), [err, setErr] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => { let on = true; const t = setTimeout(() => api(`/admin/domains?${new URLSearchParams({ q })}`, { token, feedback: false }).then(r => on && (setList(r), setErr(''))).catch(e => on && setErr(e.message)), q ? 250 : 0); return () => { on = false; clearTimeout(t); }; }, [q, tick, token]);
  if (view === 'connect') return <Connect token={token} onSaved={id => { setOpenId(id); setView('detail'); setTick(n => n + 1); }}/>;
  if (view === 'detail' && openId) return <Detail id={openId} token={token} onChange={() => setTick(n => n + 1)} onClose={() => setView('list')}/>;
  return <div className="dm-page">
    {list && !list.hosting.configured && <div className="dm-note" role="status"><strong>Server setup required.</strong> Domains can be saved and ownership verified now. Activation and personalised routing records stay off until the server is set up.</div>}
    <div className="dashboard-panel"><div className="dm-head"><h3>Custom domains</h3><button className="btn btn-green" onClick={() => setView('connect')}><Globe size={15}/> Connect a client's domain</button></div>
      <Guides/>
      <label className="dm-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search domains</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search domains"/></label>
      {listState({ list, err }) === 'error' && <Alert title={LOAD_FAILED.title} detail={err} onRetry={() => setTick(n => n + 1)}>{LOAD_FAILED.body}</Alert>}
      {listState({ list, err }) === 'loading' && <p role="status">Loading domains...</p>}
      {listState({ list, err }) === 'empty' && <p className="muted">No domains connected yet.</p>}
      {listState({ list, err }) === 'ready' &&
        <ul className="dm-list">{list.domains.map(d => { const p = problemOf(d); return <li key={d.id}><button type="button" className="dm-row" onClick={() => { setOpenId(d.id); setView('detail'); }} aria-label={`Open ${d.hostname}, ${stateLabel(d.state)}`}>
          <span className="dm-c-host"><strong className="dm-host">{d.hostname}</strong><small>{d.storeName || `Store #${d.businessId}`}</small></span>
          <span className="dm-c-state"><Dot tone={toneOf(d.state)}>{stateLabel(d.state)}</Dot></span>
          <span className="dm-c-steps">{stepsOf(d).map(s => <span key={s.label} className="dm-mini"><span className="muted">{s.label}</span> <Dot tone={s.tone}>{s.text}</Dot></span>)}</span>
          <span className="dm-c-meta"><small>Checked {age(d.lastCheckedAt)}</small>{p && <small className="dm-err"><code>{p.code}</code> {p.text}</small>}<small>{d.nextAction}</small></span>
        </button></li>; })}</ul>}
    </div></div>;
}
