import { ot } from '../../shared/lib/owner-i18n.js';
import React, { useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { useOwnerPages } from '../dashboard/use-owner-pages.js';
import { Stars } from './Stars.jsx';

// Owner moderation. Reviews cannot be added here: only customers with an order can post one. Hide keeps the row; delete removes it.
export default function ReviewsAdmin({ token, storeId }) {
  const [visibility, setVisibility] = useState('all'), [query, setQuery] = useState(''), [refresh, setRefresh] = useState(0), [error, setError] = useState(''), [busyId, setBusyId] = useState(null);
  const list = useOwnerPages(storeId, 'reviews', { q: query, status: visibility }, token, refresh, true);
  const act = async (r, fn) => { if (busyId) return; setBusyId(r.id); setError(''); try { await fn(); setRefresh(n => n + 1); } catch (e) { setError(e.message); } finally { setBusyId(null); } };
  const setStatus = (r, status) => act(r, () => api(`/owner/${storeId}/reviews/${r.id}`, { token, method: 'PATCH', body: { status }, feedback: false }));
  const remove = r => { if (window.confirm(ot("Delete this review for good?"))) act(r, () => api(`/owner/${storeId}/reviews/${r.id}`, { token, method: 'DELETE', feedback: false })); };
  return <div className="dashboard-panel"><h3>{ot("Reviews")}</h3>
    <p className="muted">{ot("Customers can rate items from their order page once it is done. Only real orders can review. Hide a review to remove it from your shop; you cannot add or edit reviews.")}</p>
    {error && <p className="notice error" role="alert">{ot(error)}</p>}
    <div className="inline-form"><label>{ot("Search")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={ot("Customer or text")}/></label><label>{ot("Show")}<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="all">{ot("All")}</option><option value="visible">{ot("Visible")}</option><option value="hidden">{ot("Hidden")}</option></select></label></div>
    {list.rows.length === 0 && !list.loading ? <p className="muted">{ot("No reviews yet.")}</p> : <div className="table-wrap"><table><thead><tr><th>{ot("Item")}</th><th>{ot("Rating")}</th><th>{ot("Review")}</th><th>{ot("Customer")}</th><th>{ot("Date")}</th><th>{ot("Status")}</th><th></th></tr></thead><tbody>{list.rows.map(r => <tr key={r.id}><td>{r.productName}</td><td><Stars value={r.rating}/></td><td>{r.text || '-'}</td><td>{r.customerName || '-'}</td><td>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td>{r.status === 'hidden' ? ot("Hidden") : ot("Visible")}</td><td><button className="table-button" disabled={busyId === r.id} onClick={() => setStatus(r, r.status === 'hidden' ? 'visible' : 'hidden')}>{r.status === 'hidden' ? ot("Show") : ot("Hide")}</button> <button className="table-button" disabled={busyId === r.id} onClick={() => remove(r)}>{ot("Delete")}</button></td></tr>)}</tbody></table></div>}
    <div ref={list.sentinel} className="pagination-sentinel"><span>{list.rows.length} {ot("of")} {list.total}</span>{list.loading ? <span>{ot("Loading...")}</span> : list.hasMore && <button className="btn btn-outline" onClick={list.more}>{ot("Load more")}</button>}</div>
  </div>;
}
