import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, ChartNoAxesCombined, Copy, Download, FileSpreadsheet, LayoutDashboard, LogOut, MessageCircle, Package, Plus, QrCode, Send, Settings as SettingsIcon, Star, Tags, Trash2, Upload, X, ShoppingBag } from 'lucide-react';
import { useAuth } from '../App.jsx';
import { api, download, imageSrc, inr } from '../lib/api.js';
import { storeLink } from '../lib/store-domain.js';
import { Logo, Notice } from '../components/chrome.jsx';
import Busy from '../components/Busy.jsx';
import { ThemeToggle } from '../theme.jsx';

export function AdminShell({ children, superMode = false, tab, setTab, stores = [], storeId, setStoreId }) {
  const { session, save } = useAuth();
  const nav = useNavigate();
  const current = stores.find(s => String(s.id) === String(storeId));
  const staffMode = session.user.role === 'staff';
  const items = superMode
    ? [['overview', 'Overview', LayoutDashboard], ['businesses', 'Businesses', StoreIcon], ['users', 'Users', UsersIcon], ['requests', 'Shop requests', MessageCircle]]
    : staffMode ? [['overview', 'Overview', LayoutDashboard], ...(current?.storeType === 'restaurant' ? [['restaurant', 'Table orders', ShoppingBag]] : [])]
    : [['overview', 'Overview', LayoutDashboard], ['products', 'Products', Package], ['categories', 'Categories', Tags], ['leads', 'Orders', MessageCircle], ['sales', 'Sales', ChartNoAxesCombined], ['coupons', 'Coupons', Tags], ['referrals', 'Referrals', Star], ['staff', 'Staff', Package], ...(current?.storeType === 'restaurant' ? [['restaurant', 'Table orders', ShoppingBag]] : []), ['notifications', 'Notifications', Bell], ['broadcast', 'WhatsApp broadcast', MessageCircle], ['settings', 'Shop settings', SettingsIcon]];
  return <div className="admin-layout">
    <aside className="sidebar">
      <Logo light/>
      <div className="sidebar-label">WORKSPACE</div>
      <nav>{items.map(([key, label, Icon]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-bottom">
        <ThemeToggle className="sidebar-theme"/>
        {!superMode && current && <a href={storeLink(current.slug)} target="_blank" rel="noreferrer"><ArrowUpRight size={17}/> View storefront</a>}
        <button onClick={() => { save(null); nav('/'); }}><LogOut size={17}/> Log out</button>
      </div>
    </aside>
    <div className="admin-main">
      <div className="admin-top">
        <span>{superMode ? 'SUPERADMIN / DIGITAL DUKAAN' : <select className="store-switcher" value={storeId || ''} onChange={e => setStoreId(e.target.value)}><option value="" disabled>Select store</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</span>
        <div className="admin-profile"><span>{session.user.name?.[0]?.toUpperCase()}</span><div><strong>{session.user.name}</strong><small>{superMode ? 'Superadmin' : staffMode ? 'Shop staff' : 'Shop owner'}</small></div></div>
      </div>
      {children}
    </div>
  </div>;
}
import { Store as StoreIcon, Users as UsersIcon } from 'lucide-react';

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(c => c !== '')) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.replace(/^﻿/, '').trim());
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function ProductModal({ categories, product, onClose, onSave, busy }) {
  const [draft, setDraft] = useState(product
    ? { name: product.name, description: product.description || '', price: product.price, category: product.category?.id || product.categoryId, imageUrl: product.imageUrl || '', stock: product.stock ?? '', featured: Boolean(product.featured), active: product.active, kind: product.kind || 'product', duration: product.duration || '' }
    : { name: '', description: '', price: '', category: categories[0]?.id || '', imageUrl: '', stock: '', featured: false, active: true, kind: 'product', duration: '' });
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const { session } = useAuth();
  const upload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const body = new FormData();
      body.append('image', file);
      const result = await api(`/owner/${product.__storeId}/upload`, { method: 'POST', token: session.token, body });
      setDraft(d => ({ ...d, imageUrl: result.imageUrl }));
    } catch (err) { setError(err.message); } finally { setUploading(false); }
  };
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal anim-pop"><button className="modal-close" onClick={onClose} aria-label="Close"><X/></button>
      <span className="kicker">YOUR CATALOG</span>
      <h2>{product.id ? 'Edit product' : 'Add a product'}</h2>
      <form onSubmit={e => { e.preventDefault(); onSave(draft); }}>
        <Notice error={error}/>
        <label>Product name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required/></label>
        <div className="form-row">
          <label>Price (₹)<input type="number" min="0" step="0.01" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} required/></label>
          <label>Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} required><option value="">Select a category</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Listing type<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}><option value="product">Product (physical item)</option><option value="service">Service (bookable)</option></select></label>
          {draft.kind === 'service'
            ? <label>Duration <small>(e.g. 45 mins)</small><input value={draft.duration} onChange={e => setDraft({ ...draft, duration: e.target.value })} placeholder="45 mins"/></label>
            : <label>Stock <small>(blank = unlimited)</small><input type="number" min="0" step="1" value={draft.stock} onChange={e => setDraft({ ...draft, stock: e.target.value })} placeholder="e.g. 24"/></label>}
        </div>
        <label className="check-label"><input type="checkbox" checked={draft.featured} onChange={e => setDraft({ ...draft, featured: e.target.checked })}/> <Star size={15}/> {draft.kind === 'service' ? 'Featured service' : 'Featured product'}</label>
        <label>Description<textarea rows="3" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Tell people what makes it special"/></label>
        <label>Product photo <small>(JPEG, PNG or WebP, max 5 MB)</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading}/></label>
        {uploading && <p className="muted">Uploading photo...</p>}
        <label>Or paste an image URL<input type="url" value={draft.imageUrl?.startsWith('/uploads/') ? '' : draft.imageUrl} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://..."/></label>
        {draft.imageUrl && <div className="upload-preview"><img src={imageSrc(draft.imageUrl)} alt="Preview"/><span>Photo ready</span></div>}
        <label className="check-label"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/> Visible on storefront</label>
        <button className="btn btn-green full" disabled={busy || uploading || !categories.length}><Busy active={busy || uploading}>{busy ? 'Saving...' : 'Save product'}</Busy> <ArrowRight size={18}/></button>
        {!categories.length && <p className="muted">Add a category before adding products.</p>}
      </form>
    </div>
  </div>;
}

const LEAD_STATUSES = [['new', 'New'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['out-for-delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

function LeadRow({ lead, token, storeId, onChanged }) {
  const [status, setStatus] = useState(lead.status || 'new');
  const [phone, setPhone] = useState(lead.customerPhone || '');
  const [busy, setBusy] = useState(false), [pdfBusy, setPdfBusy] = useState(false), [error, setError] = useState('');
  const save = async (nextStatus, openWhatsApp) => {
    setBusy(true); setError('');
    try {
      const { url } = await api(`/owner/${storeId}/leads/${lead.id}/status`, { method: 'POST', token, body: { status: nextStatus, customerPhone: phone } });
      setStatus(nextStatus);
      onChanged();
      if (openWhatsApp && url) window.open(url, '_blank');
      else if (openWhatsApp && !phone) setError('Add the customer’s WhatsApp number to send an update');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const items = Array.isArray(lead.items) && lead.items.length ? lead.items : null;
  return <tr>
    <td><strong>{lead.productName}</strong>{items && <small className="lead-items">{items.map(i => `${i.qty} × ${i.name}`).join(', ')}</small>}</td>
    <td>{inr(lead.price)}</td>
    <td>{new Date(lead.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
    <td><input className="phone-input" value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => phone !== (lead.customerPhone || '') && save(status, false)} placeholder="Customer no." aria-label="Customer WhatsApp number"/></td>
    <td><select className={`status-select s-${status}`} value={status} disabled={busy} onChange={e => save(e.target.value, false)}>{LEAD_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
    <td className="row-actions">
      <button className="table-button" disabled={busy} onClick={() => save(status, true)} title="Send status update on WhatsApp"><Busy active={busy}><Send size={14}/> {busy ? 'Updating...' : 'Update'}</Busy></button>
      <button className="table-button" disabled={pdfBusy} onClick={async () => { setPdfBusy(true); try { await download(`/owner/${storeId}/leads/${lead.id}/invoice`, `estimate-${lead.id}.pdf`, token); } catch (e) { setError(e.message); } finally { setPdfBusy(false); } }} title="Download estimate PDF"><Busy active={pdfBusy}><Download size={14}/> {pdfBusy ? 'Loading...' : 'PDF'}</Busy></button>
      {error && <small className="error-text">{error}</small>}
    </td>
  </tr>;
}

function Settings({ business, token, storeId, onSaved, onError, onRemoved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(''), [removeSlug, setRemoveSlug] = useState(''), [removeBusy, setRemoveBusy] = useState(false), [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    setForm(business ? {
      name: business.name, description: business.description || '', location: business.location || '', whatsapp: business.whatsapp,
      gstin: business.gstin || '', upiId: business.upiId || '',
      bannerText: business.bannerText || '', bannerActive: Boolean(business.bannerActive), offerPopupActive: Boolean(business.offerPopupActive), offerPopupText: business.offerPopupText || '', offerPopupImageUrl: business.offerPopupImageUrl || '',
      isOpen: business.isOpen !== false, openingHours: business.openingHours || '', storeType: business.storeType || 'retail', tableCount: business.tableCount || 0,
      deliveryCharge: business.deliveryCharge ?? 0, freeDeliveryAbove: business.freeDeliveryAbove ?? '', minOrder: business.minOrder ?? 0,
      accentColor: business.accentColor || '#0e9f6e', logoUrl: business.logoUrl || '', coverUrl: business.coverUrl || ''
    } : null);
  }, [business?.id]);
  if (!form) return <div className="dashboard-panel">Loading...</div>;
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const uploadImage = key => async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const body = new FormData();
      body.append('image', file);
      const result = await api(`/owner/${storeId}/upload`, { method: 'POST', token, body });
      set(key, result.imageUrl);
    } catch (err) { onError(err.message); } finally { setUploading(''); }
  };
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/owner/${storeId}/business`, { method: 'PATCH', token, body: { ...form, freeDeliveryAbove: form.freeDeliveryAbove === '' ? null : Number(form.freeDeliveryAbove), deliveryCharge: Number(form.deliveryCharge) || 0, minOrder: Number(form.minOrder) || 0 } });
      onSaved();
    } catch (err) { onError(err.message); } finally { setBusy(false); }
  };
  const BASE = import.meta.env.VITE_API_URL || '';
  return <div><form onSubmit={submit} className="settings-grid">
    <div className="dashboard-panel settings-panel">
      <h3>Business details</h3><label>Store type<select value={form.storeType} onChange={e => setForm(f => ({ ...f, storeType: e.target.value, tableCount: e.target.value === 'restaurant' && !f.tableCount ? 1 : f.tableCount }))}><option value="retail">Retail / kirana</option><option value="restaurant">Restaurant</option><option value="services">Services</option></select></label>{form.storeType === 'restaurant' && <label>Number of tables<input type="number" min="1" max="100" value={form.tableCount} onChange={e => set('tableCount', Number(e.target.value))} required/></label>}

      <label>Shop name<input value={form.name} onChange={e => set('name', e.target.value)} required/></label>
      <label>Short description<textarea rows="3" value={form.description} onChange={e => set('description', e.target.value)}/></label>
      <label>Location<input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Mumbai, India"/></label>
      <label>WhatsApp number <small>(country code, no +)</small><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} required/></label>
      <label>GSTIN <small>(optional, shown on estimates)</small><input value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="27ABCDE1234F1Z5" maxLength={15}/></label>
      <p className="muted">Your shop link: {storeLink(business.slug)}</p>
    </div>
    <div className="dashboard-panel settings-panel">
      <h3>Storefront</h3><h4>Visitor offer popup</h4><label className="check-label"><input type="checkbox" checked={form.offerPopupActive} onChange={e => set('offerPopupActive', e.target.checked)}/> Show an offer when a visitor opens this store</label><label>Offer message<textarea rows="2" maxLength={220} value={form.offerPopupText} onChange={e => set('offerPopupText', e.target.value)} placeholder="20% off fresh arrivals this week"/></label><label>Offer image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('offerPopupImageUrl')}/></label>{form.offerPopupImageUrl && <div className="upload-preview"><img src={imageSrc(form.offerPopupImageUrl)} alt="Offer preview"/><button type="button" className="btn btn-outline btn-small" onClick={() => set('offerPopupImageUrl', '')}>Remove image</button></div>}
      <label>Offer banner text <small>(scrolling strip on top of your shop)</small><input value={form.bannerText} onChange={e => set('bannerText', e.target.value)} placeholder="Free delivery above ₹499!"/></label>
      <label className="check-label"><input type="checkbox" checked={form.bannerActive} onChange={e => set('bannerActive', e.target.checked)}/> Show offer banner</label>
      <label>Accent color<input type="color" className="color-input" value={form.accentColor} onChange={e => set('accentColor', e.target.value)}/></label>
      <label>Shop logo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('logoUrl')}/>{uploading === 'logoUrl' && <small><span className="button-spinner"/>Uploading logo...</small>}</label>
      {form.logoUrl && <div className="upload-preview"><img src={imageSrc(form.logoUrl)} alt="Logo preview"/><span>Logo ready</span></div>}
      <label>Cover photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('coverUrl')}/>{uploading === 'coverUrl' && <small><span className="button-spinner"/>Uploading cover...</small>}</label>
      {form.coverUrl && <div className="upload-preview"><img src={imageSrc(form.coverUrl)} alt="Cover preview"/><span>Cover ready</span></div>}
    </div>
    <div className="dashboard-panel settings-panel">
      <h3>Orders & payments</h3>
      <div className="form-row">
        <label>Delivery charge (₹)<input type="number" min="0" step="1" value={form.deliveryCharge} onChange={e => set('deliveryCharge', e.target.value)}/></label>
        <label>Free delivery above (₹) <small>(blank = never)</small><input type="number" min="0" step="1" value={form.freeDeliveryAbove} onChange={e => set('freeDeliveryAbove', e.target.value)} placeholder="499"/></label>
      </div>
      <label>Minimum order (₹)<input type="number" min="0" step="1" value={form.minOrder} onChange={e => set('minOrder', e.target.value)}/></label>
      <label>UPI ID <small>(sent in the order message so customers can pay)</small><input value={form.upiId} onChange={e => set('upiId', e.target.value)} placeholder="yourshop@upi"/></label>
    </div>
    <div className="dashboard-panel settings-panel">
      <h3>Business hours</h3>
      <label className="check-label"><input type="checkbox" checked={form.isOpen} onChange={e => set('isOpen', e.target.checked)}/> Shop is open now</label>
      <label>Opening hours <small>(shown next to the open/closed badge)</small><input value={form.openingHours} onChange={e => set('openingHours', e.target.value)} placeholder="8:00 AM - 10:00 PM"/></label>
      <h3>Shop QR code</h3>
      <div className="qr-inline"><img src={`${BASE}/api/public/stores/${business.slug}/qr`} alt="Shop QR code"/><div><p className="muted">Print this and stick it on your counter - customers scan it to open your shop.</p><a className="btn btn-outline btn-small" href={`${BASE}/api/public/stores/${business.slug}/qr`} download={`${business.slug}-qr.svg`}><Download size={15}/> Download QR</a></div></div>
    </div>
    <div className="settings-save"><button className="btn btn-green" disabled={busy || !!uploading}><Busy active={busy}>{busy ? 'Saving...' : 'Save all changes'}</Busy></button></div>
  </form><section className="dashboard-panel remove-store-panel"><h3>Remove this store</h3><p className="muted">The store goes offline and disappears from your dashboard. You can restore it within 30 days. Store data is kept during that window.</p><label>Type <strong>{business.slug}</strong> to confirm<input value={removeSlug} onChange={e => { setRemoveSlug(e.target.value); setConfirmRemove(false); }} autoComplete="off" placeholder={business.slug}/></label><button type="button" className="btn btn-outline danger" disabled={removeBusy || removeSlug !== business.slug} onClick={() => setConfirmRemove(true)}>Remove store</button>{confirmRemove && <div className="remove-confirm" role="alertdialog" aria-label="Confirm store removal"><p>Take <strong>{business.name}</strong> offline? You can restore it within 30 days.</p><button type="button" className="btn btn-outline btn-small" onClick={() => setConfirmRemove(false)}>Cancel</button><button type="button" className="btn btn-outline btn-small danger" disabled={removeBusy || removeSlug !== business.slug} onClick={async () => { setRemoveBusy(true); try { await api(`/owner/${storeId}`, { method: 'DELETE', token, body: { slug: removeSlug } }); onRemoved(); } catch (err) { onError(err.message); } finally { setRemoveBusy(false); setConfirmRemove(false); } }}><Busy active={removeBusy}>{removeBusy ? 'Removing...' : 'Confirm removal'}</Busy></button></div>}</section></div>;
}

export default function Dashboard() {
  const { session } = useAuth(), token = session.token;
  const staffMode = session.user.role === 'staff';
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null), [products, setProducts] = useState([]), [categories, setCategories] = useState([]), [leads, setLeads] = useState([]);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false);
  const [categoryEdit, setCategoryEdit] = useState(null), [categoryName, setCategoryName] = useState('');
  const [stores, setStores] = useState([]), [storeId, setStoreId] = useState(''), [deletedStores, setDeletedStores] = useState([]), [restoreSlug, setRestoreSlug] = useState({});
  const [newStore, setNewStore] = useState({ name: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 });
  const [notify, setNotify] = useState({ title: '', body: '' }), [notifyResult, setNotifyResult] = useState('');
  const [broadcastText, setBroadcastText] = useState(''), [broadcastRecipients, setBroadcastRecipients] = useState('');
  const [restaurantOrders, setRestaurantOrders] = useState([]), [coupons, setCoupons] = useState([]), [sales, setSales] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [staff, setStaff] = useState([]), [staffForm, setStaffForm] = useState({ name:'', email:'', password:'' });
  const [couponForm, setCouponForm] = useState({ code: '', percentOff: 10 });
  const [importResult, setImportResult] = useState(''), [actionKey, setActionKey] = useState(''), [exportBusy, setExportBusy] = useState(false);

  const reloadStoreLists = async () => { const [live, removed] = await Promise.all([api('/owner/stores', { token }), ...(!staffMode ? [api('/owner/deleted-stores', { token })] : [])]); setStores(live.stores); setDeletedStores(removed?.stores || []); setStoreId(current => live.stores.some(s => String(s.id) === String(current)) ? current : live.stores[0]?.id || ''); };
  useEffect(() => { reloadStoreLists().catch(e => setError(e.message)); }, []);
  const load = async () => {
    if (!storeId) return;
    try {
      const [o, p, c, l] = await Promise.all([`/owner/${storeId}/overview`, `/owner/${storeId}/products`, `/owner/${storeId}/categories`, `/owner/${storeId}/leads`].map(path => api(path, { token })));
      setData(o); setStores(prev => prev.map(store => String(store.id) === String(o.business.id) ? o.business : store)); setProducts(p.products); setCategories(c.categories); setLeads(l.leads);
      if (!staffMode) { const [cs, ss, st, rr] = await Promise.all([api(`/owner/${storeId}/coupons`, { token }), api(`/owner/${storeId}/sales-summary`, { token }), api(`/owner/${storeId}/staff`, { token }), api(`/owner/${storeId}/referrals`, { token })]); setCoupons(cs.coupons); setSales(ss); setStaff(st.staff); setReferrals(rr.referrals); }
      if (o.business?.storeType === 'restaurant') { const result = await api(`/owner/${storeId}/restaurant-orders`, { token }); setRestaurantOrders(result.orders); } else setRestaurantOrders([]);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { setTab('overview'); setRestaurantOrders([]); setData(null); setProducts([]); setCategories([]); setLeads([]); setEditing(null); setImportResult(''); load(); }, [storeId]);

  const flash = msg => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const action = async (fn, key = 'action') => { if (busy) return; setBusy(true); setActionKey(key); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); setActionKey(''); } };

  const saveProduct = draft => action(async () => {
    const body = { ...draft, price: Number(draft.price), stock: draft.kind === 'service' || draft.stock === '' ? null : Number(draft.stock), category: draft.category, kind: draft.kind, duration: draft.kind === 'service' ? draft.duration : '' };
    delete body.__storeId;
    await api(editing?.id ? `/owner/${storeId}/products/${editing.id}` : `/owner/${storeId}/products`, { method: editing?.id ? 'PATCH' : 'POST', token, body });
    setEditing(null);
    flash(editing?.id ? 'Product updated' : 'Product added');
  });

  const saveCategory = e => {
    e.preventDefault();
    action(async () => {
      await api(categoryEdit ? `/owner/${storeId}/categories/${categoryEdit}` : `/owner/${storeId}/categories`, { method: categoryEdit ? 'PATCH' : 'POST', token, body: { name: categoryName } });
      setCategoryEdit(null); setCategoryName('');
      flash('Category saved');
    });
  };

  const importVyapar = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setImportResult('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const result = await api(`/owner/${storeId}/import/vyapar`, { method: 'POST', token, body: { rows } });
      setImportResult(`Imported ${result.type === 'sales' ? 'sales' : 'items'}: ${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const sendBroadcast = e => {
    e.preventDefault();
    action(async () => {
      const result = await api(`/owner/${storeId}/push-broadcast`, { method: 'POST', token, body: notify });
      setNotify({ title: '', body: '' });
      setNotifyResult(`Sent to ${result.sent} subscriber${result.sent === 1 ? '' : 's'}${result.gone ? `, removed ${result.gone} expired` : ''}.`);
    });
  };

  const headings = { overview: ['Good to see you again.', 'Here’s what’s happening at your shop.'], products: ['Your products.', 'Keep your collection looking its best.'], categories: ['Categories.', 'Help customers find exactly what they need.'], leads: ['WhatsApp orders.', 'Track incoming requests and follow up with customers.'], sales: ['Sales and enquiries.', 'Served restaurant orders are separate from WhatsApp enquiries.'], referrals: ['Referrals.', 'Both sides earn 10% only after the shop confirms the referred order.'], staff: ['Staff accounts.', 'Give helpers limited access without sharing your password.'], coupons: ['Coupons.', 'Create discounts customers can use at checkout.'], restaurant: ['Table orders.', 'New restaurant orders arrive here.'], broadcast: ['WhatsApp broadcast.', 'Prepare offers and send them yourself, one recipient at a time.'], notifications: ['Notifications.', 'Reach your customers even after they leave.'], settings: ['Shop settings.', 'Make your corner of the internet yours.'] };
  const BASE = import.meta.env.VITE_API_URL || '';
  const updateRestaurantOrder = (order, status) => action(async () => { await api(`/owner/${storeId}/restaurant-orders/${order.id}`, { method: 'PATCH', token, body: { status } }); }, `order-${order.id}`);

  return <AdminShell tab={tab} setTab={setTab} stores={stores} storeId={storeId} setStoreId={setStoreId}><div className="admin-content">
    {!staffMode && deletedStores.length > 0 && <div className="dashboard-panel removed-stores"><h3>Recently removed stores</h3>{deletedStores.map(store => <div className="removed-store" key={store.id}><div><strong>{store.name}</strong><small>Restore by {new Date(store.restoreUntil).toLocaleDateString('en-IN')} · {store.slug}</small></div><label>Store link<input value={restoreSlug[store.id] || ''} onChange={e => setRestoreSlug(prev => ({ ...prev, [store.id]: e.target.value }))} placeholder={store.slug}/></label><button className="btn btn-outline btn-small" disabled={busy || restoreSlug[store.id] !== store.slug || new Date() >= new Date(store.restoreUntil)} onClick={() => action(async () => { await api(`/owner/deleted-stores/${store.id}/restore`, { method: 'POST', token, body: { slug: restoreSlug[store.id] } }); await reloadStoreLists(); flash('Store restored'); })}>Restore store</button></div>)}</div>}
    {!staffMode && <div className="dashboard-panel store-create"><h3>Add a store</h3><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { const { store } = await api('/owner/stores', { method: 'POST', token, body: newStore }); const result = await api('/owner/stores', { token }); setStores(result.stores); setStoreId(store.id); setNewStore({ name: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 }); flash('Store created'); }); }}><input placeholder="Store name" aria-label="Store name" required value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })}/><input placeholder="Custom slug (optional)" aria-label="Store slug" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })}/><input placeholder="WhatsApp number (country code)" aria-label="WhatsApp number" required value={newStore.whatsapp} onChange={e => setNewStore({ ...newStore, whatsapp: e.target.value })}/><label>Store type<select value={newStore.storeType} onChange={e => setNewStore({ ...newStore, storeType: e.target.value, tableCount: e.target.value === 'restaurant' ? 1 : 0 })}><option value="retail">Retail / kirana</option><option value="restaurant">Restaurant</option><option value="services">Services</option></select></label>{newStore.storeType === 'restaurant' && <label>Number of tables<input type="number" min="1" max="100" required value={newStore.tableCount} onChange={e => setNewStore({ ...newStore, tableCount: Number(e.target.value) })}/></label>}<button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? 'Creating...' : 'Create store'}</Busy></button></form></div>}
    {!storeId ? <div className="dashboard-panel empty-state">Create a store to manage your catalog.</div> : <>
      <div className="page-title"><div><span className="kicker">YOUR WORKSPACE</span><h1>{headings[tab][0]}</h1><p>{headings[tab][1]}</p></div>{tab === 'products' && !staffMode && <div className="page-title-actions"><label className="btn btn-outline btn-file"><Busy active={busy}><FileSpreadsheet size={17}/> {busy ? 'Importing...' : 'Import from Vyapar'}</Busy><input type="file" accept=".csv" onChange={importVyapar} hidden disabled={busy}/></label><button className="btn btn-green" onClick={() => setEditing({ __storeId: storeId })}><Plus size={18}/> Add product</button></div>}</div>
      <Notice error={error} success={success}/>
      {tab === 'overview' && data && !staffMode && <>
        {data.lowStock?.length > 0 && <div className="notice warn anim-up" role="alert"><Package size={16}/> Low stock alert: {data.lowStock.map(p => `${p.name} (${p.stock} left)`).join(', ')}. Restock these items.</div>}
        <div className="stat-grid">{[[data.products, 'Products', Package], [data.categories, 'Categories', Tags], [data.leads, 'Orders', MessageCircle], [data.subscribers, 'Push subscribers', Bell]].map(([num, label, Icon], i) => <div className="stat-card anim-up" style={{ animationDelay: `${i * 70}ms` }} key={label}><Icon size={21}/><strong>{num}</strong><span>{label}</span></div>)}</div>
        <div className="dashboard-panel welcome-panel">
          <div><span className="kicker">YOUR SHOP IS LIVE</span><h2>Ready to share your story?</h2><p>Send your shop link to customers, print your QR code, or share a product directly.</p><div className="url-pill">{storeLink(data.business?.slug)}</div></div>
          <div className="welcome-actions"><a href={storeLink(data.business?.slug)} target="_blank" rel="noreferrer" className="btn btn-green">Visit your shop <ArrowUpRight size={17}/></a><button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(storeLink(data.business?.slug)); flash('Shop link copied'); } catch {} }}><Copy size={16}/> Copy link</button></div>
        </div>
        <div className="overview-grid">
          <div className="dashboard-panel"><h3>Top products by enquiries</h3>{data.topProducts?.length ? <div className="top-list">{data.topProducts.map((t, i) => <div className="top-row" key={t.productName}><span className="top-rank">{i + 1}</span><strong>{t.productName}</strong><span className="top-count">{t.count} taps</span></div>)}</div> : <p className="muted">Enquiries will rank your bestsellers here.</p>}</div>
          <div className="dashboard-panel"><h3>Recent orders</h3>{leads.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Status</th><th>When</th></tr></thead><tbody>{leads.slice(0, 5).map(l => <tr key={l.id}><td>{l.productName}</td><td>{inr(l.price)}</td><td><span className={`status-select s-${l.status || 'new'}`}>{(l.status || 'new').replace(/-/g, ' ')}</span></td><td>{new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td></tr>)}</tbody></table></div> : <p className="muted">Enquiries will appear here when customers tap Buy on WhatsApp.</p>}</div>
        </div>
      </>}
      {tab === 'products' && <div className="dashboard-panel">
        {importResult && <p className="notice success">{importResult}</p>}
        {!products.length ? <div className="empty-state"><Package size={36}/><h3>Your catalog starts here</h3><p>Add a category first, then your first product - or import your catalog from Vyapar.</p></div>
          : <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>{products.map(p => <tr key={p.id}>
            <td><div className="table-product">{p.imageUrl ? <img src={imageSrc(p.imageUrl)} alt=""/> : <span><Package size={18}/></span>}<strong>{p.name}</strong>{p.featured && <Star size={13} className="star-on"/>}</div></td>
            <td>{p.category?.name || '—'}</td>
            <td>{inr(p.price)}</td>
            <td>{p.kind === 'service' ? <span className="status service">Service</span> : p.stock === null || p.stock === undefined ? '∞' : p.stock === 0 ? <span className="status paused">Out</span> : p.stock <= 5 ? <span className="status low">{p.stock} low</span> : p.stock}</td>
            <td><span className={`status ${p.active ? 'live' : 'paused'}`}>{p.active ? 'Live' : 'Hidden'}</span></td>
            <td className="row-actions"><button onClick={() => setEditing({ ...p, __storeId: storeId })}>Edit</button><button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete ${p.name}?`)) action(async () => { await api(`/owner/${storeId}/products/${p.id}`, { method: 'DELETE', token }); flash('Product deleted'); }, `product-${p.id}`); }}><Busy active={actionKey === `product-${p.id}`}>{actionKey === `product-${p.id}` ? 'Deleting...' : 'Delete'}</Busy></button></td>
          </tr>)}</tbody></table></div>}
      </div>}
      {tab === 'categories' && <div className="dashboard-panel">
        <form className="inline-form" onSubmit={saveCategory}><label>{categoryEdit ? 'Rename category' : 'Add a category'}<input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Staples, Snacks, Beverages" required/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? 'Saving...' : categoryEdit ? 'Save changes' : 'Add category'}</Busy></button>{categoryEdit && <button type="button" className="btn btn-outline" onClick={() => { setCategoryEdit(null); setCategoryName(''); }}>Cancel</button>}</form>
        <div className="category-list">{categories.map(c => <div key={c.id}><span className="category-symbol"><Tags size={18}/></span><div><strong>{c.name}</strong><small>/{c.slug}</small></div><button onClick={() => { setCategoryEdit(c.id); setCategoryName(c.name); }}>Edit</button><button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete ${c.name}? It must be empty.`)) action(async () => { await api(`/owner/${storeId}/categories/${c.id}`, { method: 'DELETE', token }); flash('Category deleted'); }, `category-${c.id}`); }}><Busy active={actionKey === `category-${c.id}`}>{actionKey === `category-${c.id}` ? 'Deleting...' : 'Delete'}</Busy></button></div>)}{!categories.length && <p className="muted">No categories yet. Add one to organize your products.</p>}</div>
      </div>}
      {tab === 'leads' && <div className="dashboard-panel">
        <div className="leads-head"><p className="muted">Each row records a WhatsApp order request. Confirm details and payment with the customer. Set a status, add the customer’s number and tap Update to send them a status message on WhatsApp.</p><button className="btn btn-outline btn-small" disabled={exportBusy} onClick={async () => { setExportBusy(true); try { await download(`/owner/${storeId}/export/vyapar.csv`, `vyapar-sales-${data?.business?.slug || 'store'}.csv`, token); } catch (e) { setError(e.message); } finally { setExportBusy(false); } }}><Busy active={exportBusy}><FileSpreadsheet size={16}/> {exportBusy ? 'Exporting...' : 'Export to Vyapar'}</Busy></button></div>
        {leads.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Total</th><th>When</th><th>Customer no.</th><th>Status</th><th></th></tr></thead><tbody>{leads.map(l => <LeadRow key={l.id} lead={l} token={token} storeId={storeId} onChanged={load}/>)}</tbody></table></div> : <div className="empty-state">No orders yet. Share your shop to get started.</div>}
      </div>}
      {tab === 'staff' && !staffMode && <div className="dashboard-panel"><h3>Staff access</h3><p className="muted">Helpers can read catalog and restaurant order listings and change restaurant order status. They cannot create stores, edit products or settings, make coupons, or send messages. Share temporary passwords through a secure channel. A disabled account cannot sign in. If a password is lost, disable that account and create a fresh one; share its temporary password securely.</p><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { await api(`/owner/${storeId}/staff`, { token, method:'POST', body:staffForm }); setStaffForm({ name:'', email:'', password:'' }); flash('Staff account created'); }, 'staff-create'); }}><label>Name<input required maxLength={100} value={staffForm.name} onChange={e => setStaffForm({...staffForm,name:e.target.value})}/></label><label>Email<input type="email" required value={staffForm.email} onChange={e => setStaffForm({...staffForm,email:e.target.value})}/></label><label>Temporary password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={staffForm.password} onChange={e => setStaffForm({...staffForm,password:e.target.value})}/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'staff-create'}>Create staff</Busy></button></form><div className="coupon-list">{staff.map(person => <div key={person.id}><strong>{person.name}</strong><span>{person.email}</span><span>{person.active ? 'Active' : 'Disabled'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'PATCH', body:{ active:!person.active } }); }, `staff-${person.id}`)}>{person.active ? 'Disable' : 'Enable'}</button></div>)}</div></div>}
      {tab === 'referrals' && !staffMode && <div className="dashboard-panel"><h3>Referral links</h3><p className="muted">Each side becomes eligible for 10% off after the shop confirms a linked order and the customer's phone matches. This is a manual ledger, not an automatic checkout discount: verify identity and apply the discount yourself, then mark it used once. No reward is due for a click or unconfirmed WhatsApp enquiry.</p><form className="inline-form" onSubmit={e => { e.preventDefault(); const phone = e.currentTarget.elements.referrerPhone.value; action(async () => { await api(`/owner/${storeId}/referrals`, { token, method:'POST', body:{ referrerPhone:phone } }); flash('Referral link created'); }, 'referral-create'); e.currentTarget.reset(); }}><label>Referrer phone with country code<input name="referrerPhone" pattern="[1-9][0-9]{7,14}" required placeholder="919876543210"/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'referral-create'}>Create referral link</Busy></button></form><div className="coupon-list">{referrals.map(r => <div key={r.id}><strong>{r.code}</strong><span>{r.status}</span>{r.status === 'pending' && <form className="inline-form" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/confirm`, { token, method:'POST', body:{ orderKind:form.elements.orderKind.value, orderId:Number(form.elements.orderId.value), referredPhone:form.elements.referredPhone.value } }); flash('Referral verified; reward entitlements recorded'); }, `referral-confirm-${r.id}`); }}><label>Order type<select name="orderKind"><option value="retail">Retail</option><option value="restaurant">Restaurant</option></select></label><label>Confirmed order #<input name="orderId" type="number" min="1" required/></label><label>Friend phone<input name="referredPhone" pattern="[1-9][0-9]{7,14}" required/></label><button className="btn btn-outline btn-small" disabled={busy}>Confirm reward</button></form>}<button type="button" className="btn btn-outline btn-small" onClick={() => navigator.clipboard.writeText(`${storeLink(data.business.slug)}?ref=${r.code}`).then(() => flash('Referral link copied'))}>Copy link</button>{r.status === 'confirmed' && <><span>Referrer: {r.referrerRewardUsed ? 'Used' : '10% pending'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy || r.referrerRewardUsed} onClick={() => action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/redeem`, { token, method:'POST', body:{ side:'referrer' } }); }, `referrer-${r.id}`)}>Mark used</button><span>Friend: {r.referredRewardUsed ? 'Used' : '10% pending'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy || r.referredRewardUsed} onClick={() => action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/redeem`, { token, method:'POST', body:{ side:'referred' } }); }, `referred-${r.id}`)}>Mark used</button></>}</div>)}</div></div>}
      {tab === 'coupons' && <div className="dashboard-panel"><h3>Discount codes</h3><p className="muted">Customers enter a code on the store checkout. Discounts apply to the item subtotal; delivery charges remain unchanged.</p>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { await api(`/owner/${storeId}/coupons`, { token, method:'POST', body: couponForm }); setCouponForm({ code:'', percentOff:10 }); flash('Coupon created'); }, 'coupon-create'); }}>
          <label>Code<input required pattern="[A-Za-z0-9-]{3,24}" maxLength={24} value={couponForm.code} onChange={e => setCouponForm({ ...couponForm, code:e.target.value.toUpperCase() })} placeholder="SAVE10"/></label><label>Percent off<input type="number" required min="1" max="90" value={couponForm.percentOff} onChange={e => setCouponForm({ ...couponForm, percentOff:Number(e.target.value) })}/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'coupon-create'}>Create coupon</Busy></button>
        </form><div className="coupon-list">{coupons.length ? coupons.map(c => <div key={c.id}><strong>{c.code}</strong><span>{c.percentOff}% off</span><span>{c.active ? 'Active' : 'Off'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/coupons/${c.id}`, { token, method:'PATCH', body:{ active:!c.active } }); }, `coupon-${c.id}`)}>{c.active ? 'Turn off' : 'Turn on'}</button></div>) : <p className="muted">No coupons yet.</p>}</div>
      </div>}
      {tab === 'sales' && <div className="dashboard-panel"><h3>Recorded sales</h3><p className="muted">Only restaurant orders marked served count here; payment is not verified. WhatsApp requests are enquiries, not verified sales or payments.</p><div className="stat-grid"><div className="stat-card"><strong>{inr(sales?.today)}</strong><span>Today (IST)</span></div><div className="stat-card"><strong>{inr(sales?.month)}</strong><span>This month (IST)</span></div><div className="stat-card"><strong>{sales?.completedOrders || 0}</strong><span>Served restaurant orders</span></div><div className="stat-card"><strong>{sales?.whatsappEnquiries || 0}</strong><span>WhatsApp enquiries (not sales)</span></div></div><h3>Top sold items</h3>{sales?.topProducts?.length ? <div className="top-list">{sales.topProducts.map(t => <div className="top-row" key={t.name}><strong>{t.name}</strong><span>{t.quantity} sold</span></div>)}</div> : <p className="muted">No served restaurant orders yet.</p>}</div>}
      {tab === 'overview' && data && staffMode && <div className="dashboard-panel"><h3>{data.business.name}</h3><p>Restaurant order status is available under Table orders.</p></div>}
      {tab === 'restaurant' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel">
        <div className="leads-head"><h3>Orders received in the app</h3><button className="btn btn-outline btn-small" type="button" onClick={load} disabled={busy}>Refresh orders</button></div><p className="muted">Dine-in, takeaway and delivery orders appear here. Payment is handled in person; each order needs confirmation from the restaurant.</p>
        {restaurantOrders.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Items</th><th>Customer / table</th><th>Total</th><th>Received</th><th>Status</th></tr></thead><tbody>{restaurantOrders.map(o => <tr key={o.id}><td>#{o.id} · {o.orderType}</td><td>{o.items?.map(i => `${i.qty} × ${i.name}`).join(', ')}</td><td>{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : <>{o.customerName}<br/>{o.customerPhone}{o.deliveryAddress && <><br/>{o.deliveryAddress}</>}</>}</td><td>{inr(o.total)}</td><td>{new Date(o.createdAt).toLocaleString('en-IN')}</td><td><select aria-label={`Status for order ${o.id}`} value={o.status} disabled={busy} onChange={e => updateRestaurantOrder(o, e.target.value)}>{['new','preparing','served','cancelled'].map(status => <option key={status} value={status}>{status === 'served' ? 'fulfilled / served' : status}</option>)}</select>{actionKey === `order-${o.id}` && <span className="button-spinner"/>}{!staffMode && <span className="muted">In-app order (no automatic WhatsApp alert)</span>}</td></tr>)}</tbody></table></div> : <p className="empty-state">No restaurant orders yet.</p>}
      </div>}
      {tab === 'broadcast' && !staffMode && <div className="dashboard-panel"><h3>Prepare an offer for WhatsApp</h3><p className="muted">Enter numbers only for customers who agreed to receive WhatsApp offers. This does not pull numbers from order enquiries. No messages are sent automatically: each link opens a separate WhatsApp composer for you to review and send.</p><label>Opted-in customer numbers (one per line)<textarea rows={4} value={broadcastRecipients} onChange={e => setBroadcastRecipients(e.target.value)} placeholder="919876543210"/></label><label>Offer text<textarea maxLength={500} rows={4} value={broadcastText} onChange={e => setBroadcastText(e.target.value)} placeholder="This week's fresh arrivals are here..."/></label><div className="coupon-list">{[...new Set(broadcastRecipients.split(/[\s,;]+/).map(p => p.replace(/\D/g, '')).filter(p => /^[1-9]\d{7,14}$/.test(p)))].map(number => <div key={number}><strong>{number}</strong><a className="btn btn-outline btn-small" href={`https://wa.me/${number}?text=${encodeURIComponent(`${broadcastText.trim()}\n\n${storeLink(data?.business?.slug)}`)}`} target="_blank" rel="noreferrer" onClick={e => { if (!broadcastText.trim()) { e.preventDefault(); setError('Write an offer first'); } }}>Open WhatsApp draft</a></div>)}</div></div>}
      {tab === 'notifications' && <div className="dashboard-panel">
        <h3>Broadcast to subscribers</h3>
        <p className="muted">{data?.subscribers || 0} visitor{(data?.subscribers || 0) === 1 ? ' has' : 's have'} allowed notifications from this shop. Send an offer or new-arrival alert straight to their phone.</p>
        <form onSubmit={sendBroadcast} className="notify-form">
          <label>Title<input value={notify.title} onChange={e => setNotify({ ...notify, title: e.target.value })} placeholder="Fresh stock arrived!" maxLength={80} required/></label>
          <label>Message<textarea rows="3" value={notify.body} onChange={e => setNotify({ ...notify, body: e.target.value })} placeholder="Basmati rice back in stock. Order now on WhatsApp!" maxLength={200} required/></label>
          {notifyResult && <p className="notice success">{notifyResult}</p>}
          <button className="btn btn-green" disabled={busy || !(data?.subscribers > 0)}><Busy active={busy}><Bell size={16}/> {busy ? 'Sending...' : 'Send notification'}</Busy></button>
          {!(data?.subscribers > 0) && <p className="muted">Visitors can subscribe from the prompt on your storefront.</p>}
        </form>
      </div>}
      {tab === 'settings' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel"><h3>Table QR codes</h3><p className="muted">Print one for each table. Scanning opens the menu with that table number selected.</p><div className="table-qr-grid">{Array.from({ length: data.business.tableCount }, (_, i) => <div key={i + 1} className="table-qr-card"><strong>Table {i + 1}</strong><img src={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} alt={`QR for table ${i + 1}`}/><a href={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} download={`table-${i + 1}.svg`}>Download QR</a></div>)}</div></div>}
      {tab === 'settings' && data?.business && <Settings business={data.business} token={token} storeId={storeId} onSaved={() => { load(); flash('Shop updated'); }} onRemoved={() => { setData(null); reloadStoreLists().then(() => flash('Store removed. You have 30 days to restore it.')).catch(e => setError(e.message)); }} onError={setError}/>}
    </>}
  </div>
  {editing && <ProductModal categories={categories} product={editing} busy={busy} onClose={() => setEditing(null)} onSave={saveProduct}/>}
  </AdminShell>;
}
