import {useOwnerPages} from '../dashboard/use-owner-pages.js';
import PlatformEmailSummary from './PlatformEmailSummary.jsx';
import SendOwnerWelcome from './SendOwnerWelcome.jsx';
import ResetOwnerPassword from './ResetOwnerPassword.jsx';
import PlatformSales from './PlatformSales.jsx';
import Clients from './Clients.jsx';
import { FilterBar, matches, matchesStatus } from '../dashboard/DataTools.jsx';
import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartNoAxesCombined, LayoutDashboard, Lock, LockOpen, MessageCircle, Package, Store, Users } from 'lucide-react';
import { useAuth } from '../../app/auth.jsx';
import { api } from '../../shared/lib/api.js';
import { storeLink } from '../storefront/store-domain.js';
import { Notice } from '../../shared/components/chrome.jsx';
import Busy from '../../shared/components/Busy.jsx';
import PlatformAlerts from './PlatformAlerts.jsx';
import LoadSkeleton from '../../shared/components/LoadSkeleton.jsx';
import { AdminShell } from '../dashboard/Dashboard.jsx';

export default function SuperAdmin() {
  const { session } = useAuth(), token = session.token;
  const [resetOwner,setResetOwner]=useState(null);
  useEffect(() => { document.title = 'Super admin - Digital Shop'; return () => { document.title = 'Digital Shop - Your shop, one link away'; }; }, []);
  const [tab, setTabState] = useState(() => ['overview','sales','clients','businesses','users','requests'].find(k => k === (location.hash || '').replace(/^#\/?/, '')) || 'overview');
  const setTab = next => { setTabState(next); try { if (typeof next === 'string') history.replaceState(null, '', `${location.pathname}${location.search}#${next}`); } catch { /* optional */ } };
  const [filters,setFilters]=useState({q:''});
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState({ name: '', email: '', password: '', shopName: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 });
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(''), [success, setSuccess] = useState(''), [requests, setRequests] = useState([]);
  const [data, setData] = useState({ businesses: [], users: [], stats: {} });
  const [removed, setRemoved] = useState([]), [typedSlug, setTypedSlug] = useState({}), [confirmRemove, setConfirmRemove] = useState(null);
  const [lockEditor, setLockEditor] = useState(null), [lockData, setLockData] = useState({ features: [], locks: {} }), [lockBusy, setLockBusy] = useState(''), [bulkConfirm, setBulkConfirm] = useState(null);
  const [error, setError] = useFeedbackState('');
  const [listRefresh,setListRefresh]=useState(0);
  const paged=['businesses','users','requests'].includes(tab);
  const list=useOwnerPages('platform',tab,{q:filters.q||'',status:filters.status||'all'},token,listRefresh,paged,'/admin');
  const load = async () => {
    setLoading(true);
    const [businesses, users, stats, requestsResult, deleted] = await Promise.allSettled(
      ['/admin/businesses', '/admin/users', '/admin/stats', '/admin/shop-requests', '/admin/deleted-businesses'].map((path,i) => i===2&&tab==='overview'||i===4&&tab==='businesses'||i===0&&tab==='users' ? api(path,{token}) : Promise.resolve(i===2?{}:i===0||i===4?{businesses:[]}:i===1?{users:[]}:{requests:[]}))
    );
    setData(previous => ({
      businesses: businesses.status === 'fulfilled' ? businesses.value.businesses : previous.businesses,
      users: users.status === 'fulfilled' ? users.value.users : previous.users,
      stats: stats.status === 'fulfilled' ? stats.value : previous.stats
    }));
    if (requestsResult.status === 'fulfilled') setRequests(requestsResult.value.requests);
    if (deleted.status === 'fulfilled') setRemoved(deleted.value.businesses);
    const failure = [businesses, users, stats, requestsResult, deleted].find(result => result.status === 'rejected');
    setError(failure ? 'Some admin data could not load: ' + failure.reason.message : '');
    setLoading(false);
  };
  const createOwner = async e => { e.preventDefault(); setBusy(true); setError(''); setSuccess(''); try { const result=await api('/admin/owners', { method: 'POST', token, body: owner, feedback:false }); setOwner({ name: '', email: '', password: '', shopName: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 }); setSuccess('Owner account and store created. '+(result.welcomeEmail?.message||'Share login details securely.')); setListRefresh(n=>n+1);await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const markContacted = async item => { if (pending) return; setPending(`request-${item.id}`); setError(''); try { const result = await api(`/admin/shop-requests/${item.id}`, { method: 'PATCH', token, body: { status: 'contacted' } }); setListRefresh(n=>n+1); } catch (err) { setError(err.message); } finally { setPending(''); } };
  useEffect(() => { setFilters({q:'',status:'all'});load(); }, [tab]);
  const removeStore = async b => {
    if (pending || typedSlug[b.id] !== b.slug) return;
    setPending(`remove-${b.id}`); setError('');
    try { await api(`/admin/businesses/${b.id}`, { method: 'DELETE', token, body: { slug: typedSlug[b.id] } }); setListRefresh(n=>n+1);await load(); } catch (err) { setError(err.message); } finally { setPending(''); setConfirmRemove(null); }
  };
  const restoreStore = async b => {
    if (pending || typedSlug[b.id] !== b.slug) return;
    setPending(`restore-${b.id}`); setError('');
    try { await api(`/admin/deleted-businesses/${b.id}/restore`, { method: 'POST', token, body: { slug: typedSlug[b.id] } }); setListRefresh(n=>n+1);await load(); } catch (err) { setError(err.message); } finally { setPending(''); }
  };
  const openLocks = async b => {
    if (pending) return;
    setLockEditor(b); setBulkConfirm(null); setError(''); setLockData({ features: [], locks: {} });
    try { const result = await api(`/admin/businesses/${b.id}/feature-locks`, { token }); setLockData(result); } catch (err) { setError(err.message); }
  };
  const setFeatureLock = async (feature, locked) => {
    if (!lockEditor || lockBusy) return;
    setLockBusy(feature); setError('');
    try { const result = await api(`/admin/businesses/${lockEditor.id}/feature-locks`, { method: 'PATCH', token, body: { feature, locked } }); setLockData(result); } catch (err) { setError(err.message); } finally { setLockBusy(''); }
  };
  const toggle = async (kind, item) => { if (pending) return; setPending(`${kind}-${item.id}`); setError(''); try { await api(`/admin/${kind}/${item.id}`, { method: 'PATCH', token, body: { active: !item.active } }); setListRefresh(n=>n+1);await load(); } catch (e) { setError(e.message); } finally { setPending(''); } };
  return <AdminShell tab={tab} setTab={setTab} superMode><div className="admin-content">
    <div className="page-title"><div><span className="kicker">PLATFORM ADMIN</span><h1>{tab === 'sales' ? 'Sales & commission.' : tab === 'clients' ? 'Clients & billing.' : tab === 'overview' ? 'The big picture.' : tab === 'businesses' ? 'Businesses.' : tab === 'requests' ? 'Shop requests.' : 'People.'}</h1><p>Keep track of the community growing on Digital Shop.</p></div></div>
    <Notice error={error}/>{!['overview','sales','clients'].includes(tab) && <FilterBar value={filters} onChange={setFilters} statuses={['businesses','users'].includes(tab)?['active','inactive']:[]}/>}
    {loading ? <LoadSkeleton label={`Loading ${tab === 'overview' ? 'platform overview' : tab}`} cards={tab === 'overview' ? 4 : 2} rows={3}/> : <>
    {tab === 'overview' && <><PlatformEmailSummary token={token}/><PlatformEmailSummary token={token} sample/></>}
    {tab === 'sales' && <PlatformSales token={token}/>}
    {tab === 'clients' && <Clients token={token}/>}
    {tab === 'users' && <div className="dashboard-panel"><h3>Create an owner and store</h3><p className="muted">Only your superadmin account can create new owner logins. Agree on a password and share it with the owner through a secure channel.</p><form className="owner-create-form" onSubmit={createOwner}>
      <label>Owner name<input required maxLength="100" value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })}/></label>
      <label>Owner email<input type="email" required value={owner.email} onChange={e => setOwner({ ...owner, email: e.target.value })}/></label>
      <label>Temporary password<input type="password" required minLength="10" maxLength="128" autoComplete="new-password" value={owner.password} onChange={e => setOwner({ ...owner, password: e.target.value })}/></label>
      <label>Store name<input required maxLength="100" value={owner.shopName} onChange={e => setOwner({ ...owner, shopName: e.target.value })}/></label>
      <label>Store link (optional)<input value={owner.slug} onChange={e => setOwner({ ...owner, slug: e.target.value })} placeholder="Auto-generated from store name"/></label>
      <label>Store WhatsApp with country code<input required pattern="[1-9][0-9]{7,14}" value={owner.whatsapp} onChange={e => setOwner({ ...owner, whatsapp: e.target.value })} placeholder="919876543210"/></label>
      <label>Store type<select value={owner.storeType} onChange={e => setOwner({ ...owner, storeType: e.target.value, tableCount: e.target.value === 'restaurant' ? 1 : 0 })}><option value="retail">Retail / kirana</option><option value="restaurant">Restaurant</option><option value="services">Services</option></select></label>{owner.storeType === 'restaurant' && <label>Number of tables<input type="number" min="1" max="100" required value={owner.tableCount} onChange={e => setOwner({ ...owner, tableCount: Number(e.target.value) })}/></label>}<button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy ? 'Creating...' : 'Create owner + store'}</Busy></button></form>{success && <p className="notice success">{success}</p>}</div>}
    {['requests','users'].includes(tab) && <PlatformAlerts token={token}/>}
    {tab === 'requests' && <div className="dashboard-panel table-wrap"><h3>People asking to start a shop</h3>{list.rows.length ? <table><thead><tr><th>Name</th><th>Shop</th><th>Contact</th><th>Message</th><th>Received</th><th>Status</th></tr></thead><tbody>{list.rows.map(q => <tr key={q.id}><td>{q.name}</td><td>{q.shopName}</td><td><a href={`mailto:${q.email}`}>{q.email}</a><br/><a href={`tel:${q.phone}`}>{q.phone}</a></td><td>{q.message || '—'}</td><td>{new Date(q.createdAt).toLocaleString('en-IN')}</td><td>{q.status === 'new' ? <button className="table-button" disabled={!!pending} onClick={() => markContacted(q)}><Busy active={pending === `request-${q.id}`}>{pending === `request-${q.id}` ? 'Saving...' : 'Mark contacted'}</Busy></button> : 'Contacted'}</td></tr>)}</tbody></table> : <p className="muted">No shop requests yet.</p>}</div>}
    {tab === 'overview' && <div className="stat-grid">{[['Businesses', 'businesses', Store], ['Users', 'users', Users], ['Products', 'products', Package], ['Orders', 'leads', MessageCircle]].map(([label, key, Icon], i) => <div className="stat-card anim-up" style={{ animationDelay: `${i * 70}ms` }} key={key}><Icon size={20}/><strong>{data.stats[key] || 0}</strong><span>{label}</span></div>)}</div>}
    {tab === 'businesses' && <>{confirmRemove && <div className="dashboard-panel remove-confirm" role="alertdialog" aria-label="Confirm store removal"><p>Take <strong>{confirmRemove.name}</strong> offline? You can restore it within 30 days.</p><button className="btn btn-outline btn-small" onClick={() => setConfirmRemove(null)}>Cancel</button><button className="btn btn-outline btn-small danger" disabled={!!pending} onClick={() => removeStore(confirmRemove)}>Confirm removal</button></div>}<div className="dashboard-panel table-wrap"><table><thead><tr><th>Business</th><th>WhatsApp</th><th>Link</th><th>Status</th><th></th></tr></thead><tbody>{list.rows.map(b => <tr key={b.id}><td><strong>{b.name}</strong></td><td>{b.whatsapp}</td><td><a href={storeLink(b.slug)} target="_blank" rel="noreferrer">{storeLink(b.slug)} ↗</a></td><td><span className={`status ${b.active ? 'live' : 'paused'}`}>{b.active ? 'Active' : 'Paused'}</span></td><td><button className="table-button" disabled={!!pending} onClick={() => toggle('businesses', b)}><Busy active={pending === `businesses-${b.id}`}>{pending === `businesses-${b.id}` ? 'Updating...' : b.active ? 'Pause' : 'Activate'}</Busy></button><button className="table-button" disabled={!!pending} onClick={() => lockEditor?.id === b.id ? setLockEditor(null) : openLocks(b)}><Lock size={13}/> {lockEditor?.id === b.id ? 'Close locks' : 'Feature locks'}</button><div className="admin-delete-inline"><input value={typedSlug[b.id] || ''} onChange={e => setTypedSlug(prev => ({ ...prev, [b.id]: e.target.value }))} placeholder={`Type ${b.slug}`} aria-label={`Confirm removal of ${b.name}`}/><button className="table-button danger" disabled={!!pending || typedSlug[b.id] !== b.slug} onClick={() => setConfirmRemove(b)}><Busy active={pending === `remove-${b.id}`}>Remove</Busy></button></div></td></tr>)}</tbody></table></div>{lockEditor && <div className="dashboard-panel feature-lock-panel"><div className="leads-head"><h3>Feature permissions - {lockEditor.name}</h3><button className="btn btn-outline btn-small" onClick={() => setLockEditor(null)}>Close</button></div><p className="muted">Choose which features this store can use. Locked features show a lock icon and ask the owner to contact admin. Only superadmin can change these permissions. No data is deleted.</p>{lockData.features.length > 0 && <div className="bulk-lock-actions"><button className="btn btn-outline btn-small" disabled={!!lockBusy} onClick={() => setBulkConfirm(true)}><Lock size={14}/> Lock all features</button><button className="btn btn-green btn-small" disabled={!!lockBusy} onClick={() => setBulkConfirm(false)}><LockOpen size={14}/> Unlock all features</button><small>Applies only to {lockEditor.name}. Data is never deleted.</small></div>}{bulkConfirm !== null && <div className="remove-confirm" role="alertdialog" aria-label="Confirm feature permissions"><p>{bulkConfirm ? 'Lock' : 'Unlock'} all 12 features for <strong>{lockEditor.name}</strong>? No data will be deleted.</p><button className="btn btn-outline btn-small" disabled={!!lockBusy} onClick={() => setBulkConfirm(null)}>Cancel</button><button className="btn btn-green btn-small" disabled={!!lockBusy} onClick={async () => { await setFeatureLock('all', bulkConfirm); setBulkConfirm(null); }}>Confirm {bulkConfirm ? 'lock all' : 'unlock all'}</button></div>}{lockData.features.length ? <div className="feature-lock-grid">{lockData.features.map(f => { const locked = lockData.locks?.[f.key] === true; return <div className="feature-lock-row" key={f.key}><span className={locked ? 'feature-lock-state locked' : 'feature-lock-state'}>{locked ? <Lock size={14}/> : <LockOpen size={14}/>}</span><strong>{f.label}</strong><span className={`status ${locked ? 'paused' : 'live'}`}>{locked ? 'Locked' : 'Open'}</span><button className="table-button" disabled={!!lockBusy} onClick={() => setFeatureLock(f.key, !locked)}><Busy active={lockBusy === f.key}>{lockBusy === f.key ? 'Saving...' : locked ? 'Unlock' : 'Lock'}</Busy></button></div>; })}</div> : <LoadSkeleton label="Loading feature locks" cards={0} rows={3}/>}</div>}
    {removed.length > 0 && <div className="dashboard-panel"><h3>Recently removed</h3><p className="muted">Restore within 30 days. The public store stays offline until restored.</p>{removed.filter(item=>matches(item,filters.q)).map(b => <div className="removed-store" key={b.id}><div><strong>{b.name}</strong><small>{b.slug} · removed {new Date(b.deletedAt).toLocaleDateString('en-IN')}</small></div><label>Store link<input value={typedSlug[b.id] || ''} onChange={e => setTypedSlug(prev => ({ ...prev, [b.id]: e.target.value }))} placeholder={b.slug}/></label><button className="btn btn-outline btn-small" disabled={!!pending || typedSlug[b.id] !== b.slug || Date.now() >= new Date(b.deletedAt).getTime() + 30 * 86400000} onClick={() => restoreStore(b)}><Busy active={pending === `restore-${b.id}`}>Restore</Busy></button></div>)}</div>}</>}
    {tab === 'users' && <div className="dashboard-panel table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Business</th><th>Status</th><th></th></tr></thead><tbody>{list.rows.map(u => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.role}</td><td>{data.businesses.filter(b => b.ownerId === u.id).map(b => b.name).join(', ') || '—'}</td><td><span className={`status ${u.active ? 'live' : 'paused'}`}>{u.active ? 'Active' : 'Paused'}</span></td><td><button className="table-button" disabled={!!pending || u.id === session.user.id} onClick={() => toggle('users', u)}><Busy active={pending === `users-${u.id}`}>{pending === `users-${u.id}` ? 'Updating...' : u.active ? 'Pause' : 'Activate'}</Busy></button>{u.role==='owner'&&<button className="table-button" onClick={()=>setResetOwner(u)}>Reset password</button>}{u.role==='owner'&&<SendOwnerWelcome owner={u} token={token}/>}</td></tr>)}</tbody></table></div>}
    </>}
    {paged && <div ref={list.sentinel} className="pagination-sentinel"><span>{list.rows.length} of {list.total} matching {tab}</span>{list.loading ? <span>Loading...</span> : list.error ? <><span role="alert">{list.error}</span><button onClick={list.more}>Retry</button></> : list.hasMore && <button className="btn btn-outline btn-small" onClick={list.more}>Load 10 more</button>}</div>}
    {tab==='users'&&resetOwner&&<ResetOwnerPassword owner={resetOwner} token={token} onClose={()=>setResetOwner(null)}/>}
  </div></AdminShell>;
}
