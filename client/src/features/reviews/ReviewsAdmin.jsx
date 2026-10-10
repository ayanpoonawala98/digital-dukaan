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
  const remove = r => { if (window.confirm('Delete this review for good?')) act(r, () => api(`/owner/${storeId}/reviews/${r.id}`, { token, method: 'DELETE', feedback: false })); };
  return <div className="dashboard-panel"><h3>Reviews</h3>
    <p className="muted">Customers can rate items from their order page once it is done. Only real orders can review. Hide a review to remove it from your shop; you cannot add or edit reviews.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="inline-form"><label>Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Customer or text"/></label><label>Show<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="all">All</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label></div>
    {list.rows.length === 0 && !list.loading ? <p className="muted">No reviews yet.</p> : <div className="table-wrap"><table><thead><tr><th>Item</th><th>Rating</th><th>Review</th><th>Customer</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>{list.rows.map(r => <tr key={r.id}><td>{r.productName}</td><td><Stars value={r.rating}/></td><td>{r.text || '-'}</td><td>{r.customerName || '-'}</td><td>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td>{r.status === 'hidden' ? 'Hidden' : 'Visible'}</td><td><button className="table-button" disabled={busyId === r.id} onClick={() => setStatus(r, r.status === 'hidden' ? 'visible' : 'hidden')}>{r.status === 'hidden' ? 'Show' : 'Hide'}</button> <button className="table-button" disabled={busyId === r.id} onClick={() => remove(r)}>Delete</button></td></tr>)}</tbody></table></div>}
    <div ref={list.sentinel} className="pagination-sentinel"><span>{list.rows.length} of {list.total}</span>{list.loading ? <span>Loading...</span> : list.hasMore && <button className="btn btn-outline" onClick={list.more}>Load more</button>}</div>
  </div>;
}
