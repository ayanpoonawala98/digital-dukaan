import { ot } from '../../shared/lib/owner-i18n.js';
import {useOwnerPages} from './use-owner-pages.js';
import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { CustomerDetail, BroadcastPanel, BulkMessagePanel } from './CustomerReach.jsx';
import { parseCsv } from '../imports/parse-csv.js';

const blank = { name: '', phone: '', email: '', source: 'manual', notes: '', tags: '', optInStatus: 'unknown', optInPurpose: '', optInSource: '', optInAt: '' };
const asForm = customer => customer ? { ...customer, tags: (customer.tags || []).join(', '), optInAt: customer.optInAt ? new Date(new Date(customer.optInAt).getTime() - new Date(customer.optInAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' } : { ...blank };
function toRows(sheet) {
  if (!sheet) throw new Error(ot("Workbook has no worksheet"));
  const headers = (sheet.getRow(1).values || []).slice(1).map(value => String(value || '').trim());
  if (!headers.includes('phone')) throw new Error(ot("The first row must include a phone column"));
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const item = Object.fromEntries(headers.map((head, i) => [head, String(row.getCell(i + 1).text || '').trim()]));
    if (Object.values(item).some(Boolean)) rows.push(item);
  });
  return rows;
}
export default function Customers({ token, storeId, staffMode = false }) {
  const [detailId, setDetailId] = useState(null), [broadcast, setBroadcast] = useState(false), [picked, setPicked] = useState(() => new Set()), [bulk, setBulk] = useState('');
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all');
  const [form, setForm] = useState(null), [rows, setRows] = useState(null), [preview, setPreview] = useState(null), [batchId, setBatchId] = useState(null);
  const [page, setPage] = useState(1), [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useFeedbackState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [refreshKey,setRefreshKey]=useState(0);
  const list=useOwnerPages(storeId,'customers',{q:query,status},token,refreshKey,true);
  const customers=list.rows,total=list.total;
  const refresh=async()=>setRefreshKey(n=>n+1);
  useEffect(()=>{setRows(null);setPreview(null);setBatchId(null);setForm(null);setDeleteTarget(null);setError('');setNotice('');},[storeId]);
  const task = async fn => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const save = e => { e.preventDefault(); task(async () => {
    const body = { name: form.name, phone: form.phone, email: form.email || '', source: form.source, notes: form.notes, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    if (!staffMode && (!form.id || form.optInStatus !== form.originalStatus)) {
      body.optInStatus = form.optInStatus;
      if (body.optInStatus === 'opted_in') { body.optInPurpose = form.optInPurpose; body.optInSource = form.optInSource; body.optInAt = form.optInAt ? new Date(form.optInAt).toISOString() : ''; }
    }
    await api(`/owner/${storeId}/customers${form.id ? `/${form.id}` : ''}`, { token, method: form.id ? 'PATCH' : 'POST', body });
    setForm(null); setNotice('Customer saved'); await refresh();
  }); };
  const remove = () => task(async () => { await api(`/owner/${storeId}/customers/${deleteTarget.id}`, { token, method: 'DELETE' }); setDeleteTarget(null); setForm(null); setNotice('Customer removed from the active list. Consent and opt-out history are retained.'); await refresh(); });
  const pullPast = () => task(async () => { const r = await api(`/owner/${storeId}/customers/backfill`, { token, method: 'POST' }); setNotice(`Found ${r.found} people in ${r.scanned} past orders; added ${r.created} new.`); await refresh(); });
  const chooseFile = async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    task(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error(ot("File must be under 2 MB"));
      let parsed;
      if (/\.csv$/i.test(file.name)) parsed = parseCsv(await file.text());
      else if (/\.xlsx$/i.test(file.name)) { const ExcelJS = (await import('exceljs')).default; const book = new ExcelJS.Workbook(); await book.xlsx.load(await file.arrayBuffer()); parsed = toRows(book.worksheets[0]); }
      else throw new Error(ot("Choose a CSV or XLSX file"));
      if (!parsed.length || parsed.length > 500) throw new Error(ot("File must contain 1-500 customers"));
      const result = await api(`/owner/${storeId}/customers/import/preview`, { token, method: 'POST', body: { rows: parsed } });
      setRows(parsed); setPreview(result); setBatchId(null);
    });
  };
  const commit = () => task(async () => { const result = await api(`/owner/${storeId}/customers/import/commit`, { token, method: 'POST', body: { rows, digest: preview.digest } }); setBatchId(result.batchId); setRows(null); setPreview(null); setNotice(`Imported ${result.created}; skipped ${result.skipped} existing customers. Consent was not inferred.`); await refresh(); });
  const undo = () => task(async () => { const result = await api(`/owner/${storeId}/customers/import/${batchId}/undo`, { token, method: 'POST' }); setBatchId(null); setNotice(`Removed ${result.removed}; retained ${result.retained} edited customers.`); await refresh(); });
  if (detailId) return <CustomerDetail token={token} storeId={storeId} id={detailId} staffMode={staffMode} onClose={() => { setDetailId(null); refresh(); }} onChanged={refresh}/>;
  return <div className="dashboard-panel customers-panel"><h3>{ot("Customers")}</h3><p className="muted">{ot("Everyone who orders is added here automatically, with their notification browsers. Private to this shop. Import never marks a customer as opted in. An opt-out cannot be reversed here without a separate verified consent flow.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {!staffMode && <div className="inline-form customer-bulkbar"><button className="btn btn-outline" onClick={() => setBroadcast(b => !b)}>{ot("Notify all")}</button><button className="btn btn-green" disabled={!picked.size} onClick={() => setBulk(b => (b === 'email' ? '' : 'email'))}>{ot("Email selected")}{picked.size ? ` (${picked.size})` : ''}</button><button className="btn btn-green" disabled={!picked.size} onClick={() => setBulk(b => (b === 'sms' ? '' : 'sms'))}>{ot("SMS selected")}{picked.size ? ` (${picked.size})` : ''}</button>{picked.size > 0 && <button className="btn btn-outline" onClick={() => { setPicked(new Set()); setBulk(''); }}>{ot("Clear selection")}</button>}{!picked.size && <small className="muted">{ot("Tick customers below to email or SMS them.")}</small>}</div>}
    {bulk && picked.size > 0 && <BulkMessagePanel token={token} storeId={storeId} channel={bulk} selected={customers.filter(c => picked.has(c.id))} onClose={() => setBulk('')} onDone={refresh}/>}
    <div className="inline-form customers-filters"><label>{ot("Search name or phone")}<input value={query} onChange={e => (setQuery(e.target.value), setPage(1))} placeholder={ot("Search customers")}/></label><label>{ot("Permission")}<select value={status} onChange={e => (setStatus(e.target.value), setPage(1))}><option value="all">{ot("All")}</option><option value="unknown">{ot("Unknown")}</option><option value="opted_in">{ot("Opted in")}</option><option value="opted_out">{ot("Opted out")}</option></select></label><button className="btn btn-green" onClick={() => setForm(asForm(null))}>{ot("Add customer")}</button>{!staffMode && <><button className="btn btn-outline" disabled={busy} onClick={pullPast}>{ot("Import from past orders")}</button></>}</div>{broadcast && <BroadcastPanel token={token} storeId={storeId} total={total} devices={customers.reduce((n, c) => n + (c.deviceCount || 0), 0)} onClose={() => setBroadcast(false)}/>}
    {deleteTarget && <div role="alert"><p>{ot("Remove")} {deleteTarget.name || ot("Unnamed")} ({deleteTarget.phone}{ot(") from the active list? Consent and opt-out history remain saved; the same phone cannot be added again here.")}</p><button className="btn btn-outline" disabled={busy} onClick={remove}>{ot("Confirm removal")}</button><button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>{ot("Keep customer")}</button></div>}
    {form && <form onSubmit={save} className="customer-form"><h3>{form.id ? ot("Edit customer") : ot("Add customer")}</h3><div className="form-row"><label>{ot("Name")}<input maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>{ot("Phone with country code")}<input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="919876543210"/></label></div><div className="form-row"><label>{ot("Email (optional)")}<input type="email" maxLength={160} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}/></label></div><div className="form-row"><label>{ot("Source")}<input maxLength={80} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}/></label><label>{ot("Tags, comma-separated")}<input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}/></label></div><label>{ot("Notes")}<textarea maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>{!staffMode && <label>{ot("WhatsApp consent")}<select value={form.optInStatus} onChange={e => setForm({ ...form, optInStatus: e.target.value })}><option value="unknown" disabled={form.originalStatus === 'opted_out'}>{ot("Unknown")}</option><option value="opted_in" disabled={form.originalStatus === 'opted_out'}>{ot("Opted in, with evidence")}</option><option value="opted_out">{ot("Opted out")}</option></select></label>}{!staffMode && form.optInStatus === 'opted_in' && <div className="form-row"><label>{ot("Purpose")}<input required maxLength={200} value={form.optInPurpose || ''} onChange={e => setForm({ ...form, optInPurpose: e.target.value })}/></label><label>{ot("Consent source")}<input required maxLength={200} value={form.optInSource || ''} onChange={e => setForm({ ...form, optInSource: e.target.value })}/></label><label>{ot("Consent date/time")}<input required type="datetime-local" value={form.optInAt || ''} onChange={e => setForm({ ...form, optInAt: e.target.value })}/></label></div>}<div className="inline-form"><button disabled={busy} className="btn btn-green">{busy ? ot("Saving...") : ot("Save customer")}</button><button type="button" className="btn btn-outline" onClick={() => setForm(null)}>{ot("Cancel")}</button></div></form>}
    {preview && <div><h3>{ot("Import preview")}</h3><p>{preview.newCount} {ot("new,")} {preview.duplicateCount} {ot("existing (skip),")} {preview.errors.length} {ot("errors. No rows imported yet.")}</p>{preview.errors.length > 0 && <div role="alert">{preview.errors.slice(0, 20).map(e => <p key={e.row}>{ot("Row")} {e.row}: {e.error}</p>)}</div>}<div className="table-wrap"><table><thead><tr><th>{ot("Phone")}</th><th>{ot("Name")}</th><th>{ot("Action")}</th></tr></thead><tbody>{preview.preview.map(c => <tr key={c.phone}><td>{c.phone}</td><td>{c.name}</td><td>{c.action}</td></tr>)}</tbody></table></div><button className="btn btn-green" disabled={busy || !!preview.errors.length} onClick={commit}>{busy ? ot("Importing...") : ot("Import these customers")}</button><button className="btn btn-outline" onClick={() => { setPreview(null); setRows(null); }}>{ot("Cancel")}</button></div>}
    {batchId && <button className="btn btn-outline" disabled={busy} onClick={undo}>{ot("Undo last import")}</button>}
    <div className="table-wrap"><table><thead><tr>{!staffMode && <th><input type="checkbox" aria-label={ot("Select all shown customers")} checked={customers.length > 0 && customers.every(c => picked.has(c.id))} onChange={e => setPicked(e.target.checked ? new Set(customers.map(c => c.id)) : new Set())}/></th>}<th>{ot("Name")}</th><th>{ot("Phone")}</th><th>{ot("Email")}</th><th>{ot("Orders")}</th><th>{ot("Last order")}</th><th>{ot("Devices")}</th><th></th></tr></thead><tbody>{customers.map(c => <tr key={c.id}>{!staffMode && <td><input type="checkbox" aria-label={ot("Select {v0}", {v0: c.name || c.phone})} checked={picked.has(c.id)} onChange={e => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}/></td>}<td>{c.name || ot("Unnamed")}</td><td>{c.phone}</td><td>{c.email || '-'}</td><td>{c.orderCount}</td><td>{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td><td>{c.deviceCount}</td><td><div className="row-actions"><button className="table-button" onClick={() => setDetailId(c.id)}>{ot("Open")}</button><button className="table-button" onClick={() => setForm({ ...asForm(c), originalStatus: c.optInStatus })}>{ot("Edit")}</button>{!staffMode && <button className="table-button danger" disabled={busy} onClick={() => setDeleteTarget(c)}>{ot("Remove")}</button>}</div></td></tr>)}</tbody></table></div><div ref={list.sentinel} className="pagination-sentinel"><span>{customers.length} {ot("of")} {total} {ot("matching customers")}</span>{list.loading ? <span>{ot("Loading...")}</span> : list.error ? <><span role="alert">{ot(list.error)}</span><button onClick={list.more}>{ot("Retry")}</button></> : list.hasMore && <button className="btn btn-outline" onClick={list.more}>{ot("Load 10 more")}</button>}</div>{!customers.length && <p className="muted">{ot("No customers found.")}</p>}
  </div>;
}
