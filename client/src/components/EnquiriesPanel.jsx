import React, { useEffect, useState } from 'react';
import { api, download, inr } from '../lib/api.js';
import { FilterBar, Pages } from './DataTools.jsx';

const STATUSES = ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'in-progress', 'completed', 'cancelled'];
const EMPTY = { q: '', status: 'all', from: '', to: '', page: 1 };
const when = value => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const PAGE_SIZE = 10;
export default function EnquiriesPanel({ token, storeId, slug, refreshKey = 0 }) {
  const [filters, setFilters] = useState(EMPTY), [typed, setTyped] = useState(''), [rows, setRows] = useState([]), [total, setTotal] = useState(0), [pageSize, setPageSize] = useState(PAGE_SIZE), [loading, setLoading] = useState(true), [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  useEffect(() => { setFilters(EMPTY); setTyped(''); }, [storeId]);
  // Wait for typing to pause so every keystroke does not hit the server.
  useEffect(() => { const id = setTimeout(() => setFilters(f => f.q === typed ? f : { ...f, q: typed, page: 1 }), 350); return () => clearTimeout(id); }, [typed]);
  const query = () => { const p = new URLSearchParams({ page: String(filters.page || 1), pageSize: String(PAGE_SIZE) }); for (const k of ['q', 'from', 'to']) if (filters[k]) p.set(k, filters[k]); if (filters.status && filters.status !== 'all') p.set('status', filters.status); return p; };
  useEffect(() => {
    let stale = false; setLoading(true); setError('');
    api(`/owner/${storeId}/leads?${query()}`, { token, feedback: false })
      .then(r => { if (!stale) { setRows(r.leads || []); setTotal(r.total || 0); setPageSize(r.pageSize || PAGE_SIZE); } })
      .catch(e => { if (!stale) setError(e.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [storeId, token, filters.page, filters.q, filters.status, filters.from, filters.to, refreshKey]);
  const onFilters = next => { if (next.q !== filters.q) setTyped(next.q || ''); setFilters(next); };
  const exportCsv = async () => { setExporting(true); try { const p = query(); p.delete('page'); await download(`/owner/${storeId}/leads/report.csv?${p}`, `enquiries-${slug || 'store'}.csv`, token); } catch (e) { setError(e.message); } finally { setExporting(false); } };
  const filtered = filters.q || filters.from || filters.to || (filters.status && filters.status !== 'all');
  return <div className="dashboard-panel enquiries-panel">
    <div className="enquiries-head"><h3>Recent enquiries</h3><span className="muted">{total} {filtered ? 'matching' : 'total'}</span></div>
    <FilterBar value={{ ...filters, q: typed }} onChange={onFilters} dates statuses={STATUSES} searchPlaceholder="Customer, phone, product or #id..." onReport={exportCsv} reportBusy={exporting}/>
    {error && <p className="notice error">{error}</p>}
    {rows.length ? <div className={`table-wrap enquiry-table${loading ? ' is-loading' : ''}`}><table><thead><tr><th>Customer</th><th>Phone</th><th>Product</th><th>Price</th><th>Status</th><th>When</th></tr></thead><tbody>{rows.map(l => <tr key={l.id}>
      <td data-label="Customer">{l.customerName || <span className="muted">Not shared</span>}</td>
      <td data-label="Phone">{l.customerPhone ? <a href={`tel:${l.customerPhone.replace(/[^+\d]/g, '')}`}>{l.customerPhone}</a> : <span className="muted">Not shared</span>}</td>
      <td data-label="Product">{l.productName}<small className="muted"> #{l.id}</small></td>
      <td data-label="Price">{inr(l.price)}</td>
      <td data-label="Status"><span className={`status-select s-${l.status || 'new'}`}>{(l.status || 'new').replace(/-/g, ' ')}</span></td>
      <td data-label="When">{when(l.createdAt)}</td>
    </tr>)}</tbody></table></div> : <p className="muted">{loading ? 'Loading enquiries...' : filtered ? 'No enquiries match these filters.' : 'Customer requests will show here when they start a WhatsApp order.'}</p>}
    {total > pageSize && <Pages label="enquiries" size={pageSize} page={filters.page || 1} total={total} onChange={page => setFilters(f => ({ ...f, page }))}/>}
  </div>;
}
