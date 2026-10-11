import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, PlugZap, Search, X } from 'lucide-react';
import { api } from '../../shared/lib/api.js';
import Busy from '../../shared/components/Busy.jsx';
import LoadSkeleton from '../../shared/components/LoadSkeleton.jsx';
import { STATE_META, CHECK_TYPE_LABEL, formatChecked, displayRows, summarize, allConnectivityOperational, buildFrontendRows, groupBySection, scopeLabel, rowAriaLabel, latencyText } from './system-status-model.js';
import './system-status.css';

const SECTIONS = ['Platform', 'Messaging providers', 'Storage & configuration', 'Build information'];
const FE = { version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '', revision: typeof __APP_REVISION__ === 'string' ? __APP_REVISION__ : '' };
const fetchJson = async (path, opts) => { try { return { ok: true, data: await api(path, { feedback: false, ...opts }) }; } catch (e) { return { ok: false, error: e.message }; } };

function StatusRow({ row, storeName, nowMs }) {
  const meta = STATE_META[row.state] || STATE_META.unknown;
  const when = formatChecked(row.checkedAt, nowMs);
  const hasMore = row.state !== 'ok' && row.state !== 'checking' && (row.reason || row.nextStep || row.code);
  const body = <>
    <span className={`ss-dot ${meta.cls}${row.state === 'checking' ? ' pulse' : ''}`} aria-hidden="true"/>
    <span className="ss-main">
      <span className="ss-name">{row.name}</span>
      <span className={`ss-label ${meta.cls}`}>{row.label}</span>
      {row.detail && <span className="ss-detail">{row.detail}</span>}
    </span>
    <span className="ss-meta">
      <span className="ss-chip">{scopeLabel(row, storeName)}</span>
      <span className="ss-chip">{CHECK_TYPE_LABEL[row.checkType] || ''}</span>
      <span className="ss-small">Latency: {latencyText(row)}</span>
      <span className="ss-small">{when.clock ? <>Checked {when.clock} <span className="ss-age">({when.age})</span></> : 'Not checked yet'}</span>
    </span>
  </>;
  if (!hasMore) return <li className="ss-row" aria-label={rowAriaLabel(row, storeName)}>{body}</li>;
  return <li className="ss-row has-more">
    <details open={row.state === 'failed'} key={`${row.id}:${row.state}`}>
      <summary aria-label={`${rowAriaLabel(row, storeName)}. Show details`}>{body}</summary>
      <div className="ss-expand">
        {row.reason && <p>{row.reason}</p>}
        {row.nextStep && <p><strong>Next step:</strong> {row.nextStep}</p>}
        <p className="ss-code">Code: <code>{row.code}</code>{row.httpStatus ? <> · HTTP {row.httpStatus}</> : null}{row.retryAfterUntil ? <> · try again after {formatChecked(row.retryAfterUntil, nowMs).clock}</> : null}</p>
      </div>
    </details>
  </li>;
}

function StorePicker({ token, store, onPick }) {
  const [q, setQ] = useState(''), [list, setList] = useState({ stores: [], hasMore: false, page: 1 }), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const timer = useRef(null);
  const load = useCallback(async (query, page, append) => {
    setBusy(true); setErr('');
    const r = await fetchJson(`/admin/system-status/stores?q=${encodeURIComponent(query)}&page=${page}`, { token });
    setBusy(false);
    if (!r.ok) { setErr('Could not load stores.'); return; }
    setList(prev => ({ stores: append ? [...prev.stores, ...r.data.stores] : r.data.stores, hasMore: r.data.hasMore, page: r.data.page }));
  }, [token]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => load(q.trim(), 1, false), 300); return () => clearTimeout(timer.current); }, [q, load]);
  return <section className="ss-picker" aria-labelledby="ss-store-h">
    <h3 id="ss-store-h">Selected store</h3>
    <p className="muted">Store checks only look at the store you pick here. Stores are never probed on page load.</p>
    {store ? <p className="ss-picked"><span>Checking store: <strong>{store.name}</strong></span><button type="button" className="btn btn-outline btn-small" onClick={() => onPick(null)} aria-label={`Stop checking ${store.name}`}><X size={15}/> Clear</button></p> : <p className="muted">No store selected. Only platform checks are shown.</p>}
    <label className="ss-search"><span className="sr-only">Search stores by name or link</span><Search size={16} aria-hidden="true"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search stores by name or link" maxLength={80}/></label>
    {err && <p role="alert" className="ss-err">{err}</p>}
    <ul className="ss-stores" aria-label="Matching stores">
      {list.stores.map(s => <li key={s.id}><button type="button" aria-pressed={store?.id === s.id} className={store?.id === s.id ? 'selected' : ''} onClick={() => onPick({ id: s.id, name: s.name })} aria-label={`Select store ${s.name}, ${s.slug}`}><strong>{s.name}</strong><small>{s.slug}</small></button></li>)}
      {!busy && !list.stores.length && !err && <li className="muted ss-none">No stores match.</li>}
    </ul>
    {list.hasMore && <button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => load(q.trim(), list.page + 1, true)}>{busy ? 'Loading...' : 'Show more stores'}</button>}
  </section>;
}

export default function SystemStatus({ token }) {
  const [snap, setSnap] = useState(null), [unavailable, setUnavailable] = useState(''), [loading, setLoading] = useState(true), [checking, setChecking] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [store, setStore] = useState(null), [auto, setAuto] = useState(false), [nowMs, setNowMs] = useState(() => Date.now()), [changed, setChanged] = useState({});
  const prevStates = useRef({}), storeRef = useRef(null), seq = useRef(0);
  storeRef.current = store;

  const apply = useCallback(data => {
    const next = {};
    const diff = {};
    for (const s of data.sections) for (const r of s.rows) { next[r.id] = r.state; if (prevStates.current[r.id] && prevStates.current[r.id] !== r.state) diff[r.id] = true; }
    prevStates.current = next; setChanged(diff);
    if (Object.keys(diff).length) setTimeout(() => setChanged({}), 1600);
    setSnap(data); setUnavailable('');
  }, []);
  const refresh = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current; if (!silent) setRefreshing(true);
    const r = await fetchJson(`/admin/system-status${storeRef.current ? `?storeId=${storeRef.current.id}` : ''}`, { token });
    if (id !== seq.current) return;
    setRefreshing(false); setLoading(false);
    if (r.ok) apply(r.data); else setUnavailable(r.error);
  }, [token, apply]);
  const runChecks = async () => {
    if (checking) return;
    const id = ++seq.current; setChecking(true);
    const r = await fetchJson('/admin/system-status/check', { token, method: 'POST', body: { storeId: storeRef.current?.id ?? null } });
    setChecking(false); setLoading(false);
    if (id !== seq.current) return;
    if (r.ok) apply(r.data); else setUnavailable(r.error);
  };
  useEffect(() => { refresh(); }, [refresh, store?.id]);
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh({ silent: true }); }, 60000);
    return () => clearInterval(t);
  }, [auto, refresh]);

  const rows = useMemo(() => {
    if (!snap) return [];
    const server = snap.sections.flatMap(s => s.rows);
    const all = [...server, ...buildFrontendRows(server, FE)];
    return displayRows(all, { ttlMs: snap.ttlMs, nowMs, checking, stale: Boolean(unavailable) });
  }, [snap, nowMs, checking, unavailable]);
  const sum = summarize(rows), allOk = snap && !unavailable && !checking && snap.summary?.checkedConnectionsOperational && allConnectivityOperational(rows);
  const when = snap ? formatChecked(snap.generatedAt, nowMs) : null;
  const sections = groupBySection(rows, SECTIONS);

  return <div className="ss-page">
    <div className="ss-actions">
      <button type="button" className="btn btn-outline" onClick={() => refresh()} disabled={refreshing || checking}><Busy active={refreshing}><RefreshCw size={16} aria-hidden="true"/> Refresh status</Busy></button>
      <button type="button" className="btn btn-green" onClick={runChecks} disabled={checking}><Busy active={checking}><PlugZap size={16} aria-hidden="true"/> {checking ? 'Checking...' : 'Check connections'}</Busy></button>
      <label className="ss-auto"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/> <span>Auto-refresh every 60 seconds while this page is open</span></label>
    </div>
    <p className="ss-when" role="status" aria-live="polite">{when?.clock ? <>Last checked {when.clock} ({when.age}). Check connections reuses results for 5 minutes.</> : loading ? 'Loading status...' : 'Not checked yet.'}</p>
    {unavailable && <div className="ss-banner failed" role="alert"><strong>Status unavailable.</strong> {snap ? 'Showing the last results, marked stale. ' : ''}The status request failed ({unavailable}). If the database is down, sign-in checks can fail too, and this page cannot work around that.</div>}
    {loading && !snap ? <LoadSkeleton label="Loading system status" cards={2} rows={3}/> : snap && <>
      <div className="ss-summary" role="group" aria-label="Status summary">
        {[['Operational', sum.operational, 'ok'], ['Needs attention', sum.attention, 'attention'], ['Failed', sum.failed, 'failed'], ['Not checked', sum.notChecked, 'unknown']].map(([label, n, cls]) => <div key={label} className={`ss-tile ${cls}`}><span className={`ss-dot ${cls}`} aria-hidden="true"/><strong>{n}</strong><span>{label}</span></div>)}
      </div>
      <p className="ss-foot">{allOk ? <strong className="ss-allok">Checked connections operational</strong> : 'Configuration-only results are never counted as operational. Neutral rows and Razorpay are not counted.'}</p>
      <StorePicker token={token} store={store} onPick={setStore}/>
      {store && snap.store === null && !unavailable && <p className="ss-err" role="alert">That store could not be found.</p>}
      {sections.map(section => <section className="dashboard-panel ss-section" key={section.name} aria-labelledby={`ss-${section.name.replace(/\W+/g, '-')}`}>
        <h3 id={`ss-${section.name.replace(/\W+/g, '-')}`}>{section.name}</h3>
        {['platform', 'store'].map(scope => { const list = section.rows.filter(r => r.scope === scope); if (!list.length) return null; return <div key={scope}>
          {section.rows.some(r => r.scope === 'store') && <h4 className="ss-scope">{scope === 'store' ? `Selected store: ${store?.name || snap.store?.name || ''}` : 'Platform'}</h4>}
          <ul className="ss-list">{list.map(r => <StatusRow key={r.id} row={r} storeName={snap.store?.name} nowMs={nowMs}/>)}</ul>
        </div>; })}
      </section>)}
      <p className="ss-foot">Passing a connection check means the provider accepted the saved credentials. It does not prove messages are delivered or webhooks arrive. Nothing on this page sends a message, uploads a file or changes a setting.</p>
    </>}
  </div>;
}
