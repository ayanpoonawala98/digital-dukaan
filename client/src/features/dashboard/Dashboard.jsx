import BrandLoader from '../../shared/components/BrandLoader.jsx';
import {storeImage} from '../storefront/store-image.js';
import {useOwnerPages} from './use-owner-pages.js';
import { productsCsv, downloadProductCsv } from '../imports/product-csv.js';
import ChangePassword from './ChangePassword.jsx';
import CustomStoreColor from './CustomStoreColor.jsx';
import OfferCampaigns from './OfferCampaigns.jsx';
import { requestedOrderStore, requestedOrderTab } from '../restaurant/order-panel.js';
import OrderAlertsCard from './OrderAlertsCard.jsx';
import ShopQr from './ShopQr.jsx';
import MappedImport from '../imports/MappedImport.jsx';
import { FilterBar, Pages, matches, matchesStatus } from './DataTools.jsx';
import SalesAnalytics from './SalesAnalytics.jsx';
import { notify as showToast } from '../notifications/notifications.js';
import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import { productDraft } from './product-draft.js';
import { CustomFieldsEditor } from './CustomFields.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import TablesView from '../restaurant/TablesView.jsx';
import { ArrowRight, ArrowUpRight, Bell, ChartNoAxesCombined, Copy, Download, FileSpreadsheet, LayoutDashboard, LogOut, MessageCircle, Package, Plus, QrCode, Send, Settings as SettingsIcon, Star, Tags, Trash2, Upload, X, ShoppingBag, Lock } from 'lucide-react';
import { useAuth } from '../../app/auth.jsx';
import LocationPicker from './LocationPicker.jsx';
import { api, download, imageSrc, inr } from '../../shared/lib/api.js';
import { storeLink } from '../storefront/store-domain.js';
import { downloadStatusCreative } from '../storefront/status-creative.js';
import { Logo, Notice } from '../../shared/components/chrome.jsx';
import Busy from '../../shared/components/Busy.jsx';
import LoadSkeleton from '../../shared/components/LoadSkeleton.jsx';
import OfferPopup from '../storefront/OfferPopup.jsx';
import WhatsAppIntegration from '../whatsapp/WhatsAppIntegration.jsx';
import Customers from './Customers.jsx';
import EnquiriesPanel from './EnquiriesPanel.jsx';
import { ThemeToggle, useTheme } from '../../app/theme.jsx';
import { STORE_THEMES, storeThemeStyle, normalizeHexColor } from '../storefront/store-theme.js';
import { isTabLocked } from '../../shared/lib/feature-locks.js';

export function AdminShell({ children, superMode = false, tab, setTab, stores = [], storeId, setStoreId }) {
  const { session, save } = useAuth();
  const nav = useNavigate();
  const current = stores.find(s => String(s.id) === String(storeId));
  const staffMode = session.user.role === 'staff';

  const { theme } = useTheme();
  const items = superMode
    ? [['overview', 'Overview', LayoutDashboard], ['sales', 'Sales & commission', ChartNoAxesCombined], ['clients', 'Clients', UsersIcon], ['businesses', 'Businesses', StoreIcon], ['users', 'Users', UsersIcon], ['requests', 'Shop requests', MessageCircle]]
    : staffMode ? [['overview', 'Overview', LayoutDashboard], ...(session.user.permissions?.includes('products') ? [['products', 'Products', Package]] : []), ...(session.user.permissions?.includes('leads') && current?.storeType !== 'restaurant' ? [['leads', 'Orders', MessageCircle]] : []), ...(session.user.permissions?.includes('coupons') ? [['coupons', 'Coupons', Tags]] : []), ...(session.user.permissions?.includes('import') ? [['imports', 'Bulk import', Upload]] : []), ...(current?.storeType === 'restaurant' && session.user.permissions?.includes('orders_view') ? [['tables', 'Tables', StoreIcon], ['restaurant', 'Kitchen', ShoppingBag]] : []), ...(import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' && session.user.permissions?.includes('whatsapp') ? [['whatsapp-cloud', 'WhatsApp inbox', MessageCircle]] : [])]
    : [['overview', 'Overview', LayoutDashboard], ['products', 'Products', Package], ['categories', 'Categories', Tags], ...(current?.storeType === 'restaurant' ? [] : [['leads', 'Orders', MessageCircle]]), ...(import.meta.env.VITE_CRM_ENABLED === 'true' ? [['customers', 'Customers', UsersIcon]] : []), ['sales', 'Sales', ChartNoAxesCombined], ['coupons', 'Coupons', Tags], ['referrals', 'Referrals', Star], ['staff', 'Staff', Package], ...(current?.storeType === 'restaurant' ? [['tables', 'Tables', StoreIcon], ['restaurant', 'Kitchen', ShoppingBag]] : []), ['notifications', 'Notifications', Bell], ['campaigns','Email & SMS offers',MessageCircle], ['broadcast', 'WhatsApp broadcast', MessageCircle], ...(import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' ? [['whatsapp-cloud', 'WhatsApp integration', MessageCircle]] : []), ['settings', 'Shop settings', SettingsIcon]];
  return <div className="admin-layout" style={!superMode && current ? storeThemeStyle(current.accentColor, theme === 'dark') : undefined}>
    <aside className="sidebar">
      <Logo light/>
      <div className="sidebar-label">WORKSPACE</div>
      <nav>{items.map(([key, label, Icon]) => { const locked = !superMode && current && isTabLocked(current, key); return <button key={key} className={`${tab === key ? 'selected' : ''}${locked ? ' nav-locked' : ''}`} onClick={() => setTab(key)}><Icon size={18}/>{label}{locked && <Lock size={13} className="nav-lock-icon" aria-label="Locked by platform admin"/>}</button>; })}</nav>
      <div className="sidebar-bottom">
        <ThemeToggle className="sidebar-theme"/>
        {!superMode && current && <a href={storeLink(current.slug)} target="_blank" rel="noreferrer"><ArrowUpRight size={17}/> View storefront</a>}
        <button onClick={() => { save(null); nav('/'); }}><LogOut size={17}/> Log out</button>
      </div>
    </aside>
    <div className="admin-main">
      <div className="admin-top">
        <span>{superMode ? 'SUPERADMIN / DIGITAL SHOP' : <select className="store-switcher" value={storeId || ''} onChange={e => setStoreId(e.target.value)}><option value="" disabled>Select store</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</span>
        <div className="admin-profile"><span>{session.user.name?.[0]?.toUpperCase()}</span><div><strong>{session.user.name}</strong><small>{superMode ? 'Superadmin' : staffMode ? 'Shop staff' : 'Shop owner'}</small></div></div>
      </div>
      {children}
    </div>
  </div>;
}
import { Store as StoreIcon, Users as UsersIcon } from 'lucide-react';


function ProductModal({ categories, product, onClose, onSave, busy, restaurant }) {
  const [draft, setDraft] = useState(() => productDraft(product, categories));
  const [uploading, setUploading] = useState(false), [error, setError] = useFeedbackState(''), [imageInput, setImageInput] = useState('');
  const { session } = useAuth();
  const upload = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (draft.imageUrls.length + files.length > 5) { setError('Maximum 5 photos per product'); return; }
    if (files.some(f => !['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024)) { setError('Choose JPEG, PNG or WebP photos under 5 MB each'); return; }
    setUploading(true); setError('');
    try {
      const urls = [];
      for (const file of files) {
        const body = new FormData(); body.append('image', file);
        const result = await api(`/owner/${product.__storeId}/upload`, { method:'POST', token:session.token, body });
        urls.push(result.imageUrl);
      }
      setDraft(d => { const imageUrls = [...d.imageUrls, ...urls]; return { ...d, imageUrls, imageUrl:imageUrls[0] || '' }; });
    } catch (err) { setError(err.message); } finally { setUploading(false); }
  };
  const removePhoto = index => setDraft(d => { const imageUrls = d.imageUrls.filter((_, i) => i !== index); return { ...d, imageUrls, imageUrl:imageUrls[0] || '' }; });
  const addUrl = () => {
    const url = imageInput.trim();
    if (!/^https?:\/\//i.test(url) || draft.imageUrls.length >= 5 || draft.imageUrls.includes(url)) { setError('Use a unique http(s) URL; maximum 5 photos'); return; }
    setDraft(d => { const imageUrls = [...d.imageUrls, url]; return { ...d, imageUrls, imageUrl:imageUrls[0] || '' }; }); setImageInput(''); setError('');
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
        <label>Product photos <small>(up to 5, JPEG / PNG / WebP, 5 MB each)</small><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading || draft.imageUrls.length >= 5}/></label>
        {uploading && <p className="muted" role="status">Uploading photos...</p>}
        <div className="form-row"><label>Or add an image URL<input type="url" value={imageInput} onChange={e => setImageInput(e.target.value)} placeholder="https://..."/></label><button type="button" className="btn btn-outline btn-small" onClick={addUrl} disabled={!imageInput.trim() || uploading || draft.imageUrls.length >= 5}>Add URL</button></div>
        {draft.imageUrls.length > 0 && <div className="photo-editor" aria-label="Product photos">{draft.imageUrls.map((url, i) => <div className="photo-editor-item" key={`${url}-${i}`}><img src={storeImage(imageSrc(url),480)} alt={`Product photo ${i + 1}`}/><span>{i === 0 ? 'Cover photo' : `Photo ${i + 1}`}</span><button type="button" className="icon-btn" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}><X size={17}/></button></div>)}</div>}
        {restaurant && <MenuOptionsEditor draft={draft} setDraft={setDraft}/>}
        {draft.kind !== 'service' || true ? <CustomFieldsEditor value={draft.customFields} onChange={customFields => setDraft(d => ({ ...d, customFields }))}/> : null}
        <label className="check-label"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/> Visible on storefront</label>
        <button className="btn btn-green full" disabled={busy || uploading || !categories.length}><Busy active={busy || uploading}>{busy ? 'Saving...' : 'Save product'}</Busy> <ArrowRight size={18}/></button>
        {!categories.length && <p className="muted">Add a category before adding products.</p>}
      </form>
    </div>
  </div>;
}

import { leadStatusOptions } from '../restaurant/order-flows.js';
import RestaurantOrders, { RestaurantOverview } from '../restaurant/RestaurantOrders.jsx';
import MenuOptionsEditor from '../restaurant/MenuOptionsEditor.jsx';

function LeadRow({ lead, token, storeId, storeType, onChanged }) {
  const LEAD_STATUSES = leadStatusOptions(storeType);
  const [status, setStatus] = useState(lead.status || 'new');
  const [phone, setPhone] = useState(lead.customerPhone || '');
  const [busy, setBusy] = useState(false), [pdfBusy, setPdfBusy] = useState(false), [error, setError] = useFeedbackState('');
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
    <td data-label="Order"><small>Order #{lead.orderNumber ?? lead.id}</small><strong>{String(lead.productName || '').replace(/^1 items$/, '1 item')}</strong>{items && <small className="lead-items">{items.map(i => `${i.qty} × ${i.name}${i.answers?.length ? ` (${i.answers.map(a => `${a.label}: ${a.value}`).join(', ')})` : ''}`).join(', ')}</small>}</td>
    <td data-label="Total">{inr(lead.price)}</td>
    <td data-label="When">{new Date(lead.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
    <td data-label="Customer no."><input className="phone-input" value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => phone !== (lead.customerPhone || '') && save(status, false)} placeholder="Customer no." aria-label="Customer WhatsApp number"/></td>
    <td data-label="Status"><select className={`status-select s-${status}`} value={status} disabled={busy} onChange={e => save(e.target.value, false)}>{LEAD_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
    <td className="row-actions" data-label="Actions">
      <button className="table-button" disabled={busy} onClick={() => save(status, true)} title="Send status update on WhatsApp"><Busy active={busy}><Send size={14}/> {busy ? 'Updating...' : 'Update'}</Busy></button>
      <button className="table-button" disabled={pdfBusy} onClick={async () => { setPdfBusy(true); try { await download(`/owner/${storeId}/leads/${lead.id}/invoice`, `estimate-${lead.id}.pdf`, token); } catch (e) { setError(e.message); } finally { setPdfBusy(false); } }} title="Download estimate PDF"><Busy active={pdfBusy}><Download size={14}/> {pdfBusy ? 'Loading...' : 'PDF'}</Busy></button>
      <PayActions kind="leads" order={lead} token={token} storeId={storeId}/>
      {error && <small className="error-text">{error}</small>}
    </td>
  </tr>;
}

const FESTIVAL_PRESETS = [
  { name:'Diwali glow', color:'#94631d', banner:'Diwali ki khushiyan, aapki dukaan par ✨', headline:'Celebrate Diwali with us', message:'Explore festive picks and find something for everyone.' },
  { name:'Eid moonlight', color:'#225caa', banner:'Eid Mubarak! Discover our festive picks 🌙', headline:'Wishing you a joyful Eid', message:'Take a look at our handpicked festive collection.' }
];

const STAFF_PERMS = [['orders_view', 'See table orders', true], ['order_status', 'Change table order status', true], ['whatsapp', 'WhatsApp inbox and replies'], ['import', 'Bulk import'], ['products', 'Add and edit products, categories and sold-out (no delete)'], ['leads', 'See enquiries/orders and update status'], ['coupons', 'Create and edit discount coupons']];
const DEFAULT_STAFF_PERMS = ['orders_view', 'order_status', 'whatsapp', 'import'];
function PermissionChecks({ value, onChange, disabled, restaurant }) {
  const toggle = key => onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  return <fieldset className="perm-checks" disabled={disabled}><legend>Can do</legend>{STAFF_PERMS.filter(([, , rest]) => !rest || restaurant).map(([key, label]) => <label key={key} className="perm-check"><input type="checkbox" checked={value.includes(key)} onChange={() => toggle(key)}/> {label}</label>)}</fieldset>;
}

function PayActions({ kind, order, token, storeId, staffMode }) {
  const [o, setO] = useState(order), [busy, setBusy] = useState(''), [msg, setMsg] = useFeedbackState('');
  useEffect(() => { setO(order); }, [order]);
  if (staffMode) return null;
  const base = `/owner/${storeId}/${kind}/${order.id}`;
  const run = async (what, fn) => { setBusy(what); setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } finally { setBusy(''); } };
  const copy = async url => { try { await navigator.clipboard.writeText(url); return true; } catch { return false; } };
  const payLink = () => run('pay', async () => {
    const d = await api(`${base}/payment-link`, { method: 'POST', token, body: {}, feedback: false });
    setO(d.order);
    if (d.whatsappUrl) window.open(d.whatsappUrl, '_blank'); else setMsg((await copy(d.url)) ? 'Payment link copied. Add the customer number to send it on WhatsApp.' : d.url);
  });
  const check = () => run('check', async () => { const d = await api(`${base}/payment-link/refresh`, { method: 'POST', token, body: {}, feedback: false }); setO(d.order); setMsg(d.status === 'paid' ? '' : `Not paid yet (${d.status}).`); });
  const bill = () => run('bill', async () => { const d = await api(`${base}/bill-link`, { token, feedback: false }); if (d.whatsappUrl) window.open(d.whatsappUrl, '_blank'); else { window.open(d.url, '_blank'); } });
  const paid = o.paymentStatus === 'paid', cancelled = o.status === 'cancelled';
  return <div className="pay-actions">
    {paid ? <span className="pay-badge paid">Paid online</span> : o.paymentStatus === 'created' ? <span className="pay-badge pending">Payment link sent</span> : o.paymentStatus === 'expired' ? <span className="pay-badge expired">Link expired</span> : null}
    {!PAYMENTS_LOCKED && !paid && !cancelled && <button type="button" className="table-button" disabled={!!busy} onClick={payLink} title="Create a Razorpay payment link (UPI, cards, netbanking) and send it on WhatsApp"><Busy active={busy === 'pay'}>{o.paymentStatus === 'created' ? 'Resend pay link' : 'Pay link'}</Busy></button>}
    {!PAYMENTS_LOCKED && o.paymentLinkId && !paid && <button type="button" className="table-button" disabled={!!busy} onClick={check}><Busy active={busy === 'check'}>Check payment</Busy></button>}
    {!cancelled && <button type="button" className="table-button" disabled={!!busy} onClick={bill} title="Send the customer a bill link on WhatsApp"><Busy active={busy === 'bill'}>Send bill</Busy></button>}
    {msg && <small className="error-text">{msg}</small>}
  </div>;
}

const PAYMENTS_LOCKED = true; // Razorpay payment links are locked (coming soon)
function PaymentSettings({ token, storeId }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null), [f, setF] = useState({ keyId: '', keySecret: '' }), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  useEffect(() => { api(`/owner/${storeId}/payments`, { token, feedback: false }).then(d => { setView(d.razorpay); setF({ keyId: '', keySecret: '' }); }).catch(() => setView(false)); }, [storeId, token]);
  if (view === false) return null;
  if (!view) return <div className="dashboard-panel settings-panel"><h3>Online payments</h3><BrandLoader compact/></div>;
  const save = async (body, ok) => { setBusy(true); setMsg(null); try { const d = await api(`/owner/${storeId}/payments`, { token, method: 'PUT', body, feedback: false }); setView(d.razorpay); setF({ keyId: '', keySecret: '' }); setMsg({ ok }); } catch (e) { setMsg({ error: e.message }); } finally { setBusy(false); } };
  return <div className="dashboard-panel settings-panel notify-settings accordion-panel">
    <button type="button" className="accordion-head" aria-expanded={open} onClick={() => setOpen(o => !o)}><h3>Online payments (Razorpay)</h3><span className="accordion-chev" aria-hidden="true">{open ? '\u25B4' : '\u25BE'}</span></button>
    {open && <>
    <p className="muted">Let customers pay an order by UPI, card or netbanking through a payment link. The money goes to your own Razorpay account. Digital Shop never touches it.</p>
    <div className="notify-row"><strong>Razorpay</strong><span className={`status-pill ${view.configured && !PAYMENTS_LOCKED ? 'on' : 'off'}`}>{PAYMENTS_LOCKED ? '\uD83D\uDD12 Coming soon' : view.configured ? `Connected (${view.mode || 'keys saved'}) ${view.keyId}` : 'Not connected'}</span></div>
    {view.mode === 'test' && view.configured && <p className="notice warn">These are TEST keys. Payments will not move real money. Use live keys when you are ready.</p>}
    <form onSubmit={e => { e.preventDefault(); if (PAYMENTS_LOCKED) return; save({ keyId: f.keyId || undefined, keySecret: f.keySecret || undefined }, 'Razorpay connected'); }}>
      <div className="notify-two"><label>Key ID<input disabled={PAYMENTS_LOCKED} value={f.keyId} onChange={e => setF({ ...f, keyId: e.target.value })} placeholder={view.configured ? `${view.keyId} saved` : 'rzp_live_xxxxxxxxxx'} autoComplete="off"/></label>
        <label>Key Secret<input disabled={PAYMENTS_LOCKED} type="password" autoComplete="new-password" value={f.keySecret} onChange={e => setF({ ...f, keySecret: e.target.value })} placeholder={view.keySecretSaved ? '•••••••• saved. Type to replace' : 'Key Secret'}/></label></div>
      {msg?.ok && <p className="notice success">{msg.ok}</p>}{msg?.error && <p className="notice error">{msg.error}</p>}
      <div className="notify-actions"><button className="btn btn-green" disabled={PAYMENTS_LOCKED || busy || (!f.keyId && !f.keySecret)}><Busy active={busy}>Save and verify</Busy></button>
        {view.configured && <button type="button" className="btn btn-outline" disabled={PAYMENTS_LOCKED || busy} onClick={() => save({ clear: true }, 'Razorpay disconnected')}>Disconnect</button>}</div>
    </form>
    <p className="muted">Get the keys in your Razorpay Dashboard under Account &amp; Settings, then API keys. Razorpay charges its own fee per payment. Keys are encrypted and never shown again. After a customer pays, press Check payment on the order to confirm it.</p>
    </>}
  </div>;
}

function NotificationSettings({ token, storeId }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [testing, setTesting] = useState(''), [msg, setMsg] = useState(null), [keys, setKeys] = useState(null), [kf, setKf] = useState({}), [kBusy, setKBusy] = useState(false);
  const applyKeys = k => { setKeys(k); setKf({ emailMode: k.emailMode, smsMode: k.smsMode, resend: { from: k.resend.from }, smtp: { host: k.smtp.host, port: k.smtp.port || 587, secure: k.smtp.secure, user: k.smtp.user, from: k.smtp.from }, emailHttp: { url: k.emailHttp.url, method: k.emailHttp.method || 'POST', contentType: k.emailHttp.contentType || 'json', headers: k.emailHttp.headers, body: k.emailHttp.body }, fast2sms: { route: k.fast2sms.route || 'quick', senderId: k.fast2sms.senderId, templateId: k.fast2sms.templateId }, smsHttp: { url: k.smsHttp.url, method: k.smsHttp.method || 'POST', contentType: k.smsHttp.contentType || 'json', headers: k.smsHttp.headers, body: k.smsHttp.body } }); };
  useEffect(() => { api(`/owner/${storeId}/notifications`, { token, feedback: false }).then(d => { setState(d.providers); setForm(d.settings); applyKeys(d.keys); }).catch(() => setState(false)); }, [storeId, token]);
  if (state === false) return null;
  if (!form) return <div className="dashboard-panel settings-panel"><h3>SMS & email - your business</h3><BrandLoader compact/></div>;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { const d = await api(`/owner/${storeId}/notifications`, { token, method: 'PUT', body: form, successMessage: 'Alert settings saved' }); setForm(d.settings); } catch (err) { setMsg({ error: err.message }); } finally { setBusy(false); }
  };
  const test = async channel => {
    setTesting(channel); setMsg(null);
    try { if(!window.confirm(channel === 'sms' ? 'Send a real test SMS to your saved alert number? Your business SMS wallet will be charged.' : 'Send a test email to your saved alert address? It uses your business email quota.')) return; await api(`/owner/${storeId}/notifications/test`, { token, method: 'POST', body: { channel }, feedback: false }); setMsg({ ok: `Test ${channel === 'email' ? 'email' : 'SMS'} sent. Check your ${channel === 'email' ? 'inbox' : 'phone'}.` }); } catch (err) { setMsg({ error: err.message }); } finally { setTesting(''); }
  };
  const sampleReport = async () => { setTesting('report'); setMsg(null); try { if(!window.confirm('Send a sample report using your enabled owner channels? Email quota and any SMS charges belong to your business provider.')) return; const d = await api(`/owner/${storeId}/notifications/report`, { token, method: 'POST', body: {}, feedback: false }); setMsg({ ok: `Sample report sent by ${d.channels.join(' and ')}.` }); } catch (err) { setMsg({ error: err.message }); } finally { setTesting(''); } };
  const setK = (g, f, v) => setKf(x => ({ ...x, [g]: { ...x[g], [f]: v } }));
  const sendKeys = async body => {
    setKBusy(true); setMsg(null);
    try { const d = await api(`/owner/${storeId}/notifications/keys`, { token, method: 'PUT', body, successMessage: 'Provider saved' }); setState(d.providers); applyKeys(d.keys); } catch (err) { setMsg({ error: err.message }); } finally { setKBusy(false); }
  };
  const saveProvider = channel => {
    const mode = kf[`${channel}Mode`], groups = { email: { resend: 'resend', smtp: 'smtp', http: 'emailHttp' }, sms: { fast2sms: 'fast2sms', http: 'smsHttp' } }[channel];
    if (!mode) return sendKeys({ clear: [channel] });
    const g = groups[mode], body = { [`${channel}Mode`]: mode, [g]: { ...kf[g], ...(kf[`${g}_secret`] || {}) } };
    if (g === 'smtp') body.smtp.port = Number(body.smtp.port);
    sendKeys(body).then(() => setKf(x => ({ ...x, [`${g}_secret`]: {} })));
  };
  const secretIn = (g, f, label, saved, hint) => <label>{label}<input type="password" autoComplete="new-password" value={kf[`${g}_secret`]?.[f] || ''} onChange={e => setKf(x => ({ ...x, [`${g}_secret`]: { ...x[`${g}_secret`], [f]: e.target.value } }))} placeholder={saved ? `${hint || '••••••••'} saved. Type to replace` : 'Paste it here'}/></label>;
  const textIn = (g, f, label, ph) => <label>{label}<input value={kf[g]?.[f] ?? ''} onChange={e => setK(g, f, e.target.value)} placeholder={ph}/></label>;
  const httpFields = (g, kview, isSms) => <>
    <div className="notify-two">{textIn(g, 'url', 'API URL (https)', isSms ? 'https://api.yourgateway.com/send?to={{to}}' : 'https://api.yourmail.com/v1/send')}
      <label>Method<select value={kf[g]?.method || 'POST'} onChange={e => setK(g, 'method', e.target.value)}><option>POST</option><option>GET</option></select></label></div>
    <div className="notify-two"><label>Body format<select value={kf[g]?.contentType || 'json'} onChange={e => setK(g, 'contentType', e.target.value)}><option value="json">JSON</option><option value="form">Form (key=value)</option><option value="text">Plain text</option></select></label>
      {secretIn(g, 'key', 'API key or token', kview.keySaved, kview.keyHint)}</div>
    <label>Headers <small>(one per line, e.g. Authorization: Bearer {'{{key}}'})</small><textarea rows={2} value={kf[g]?.headers || ''} onChange={e => setK(g, 'headers', e.target.value)}/></label>
    <label>Body template <small>(for POST)</small><textarea rows={3} value={kf[g]?.body || ''} onChange={e => setK(g, 'body', e.target.value)} placeholder={isSms ? '{"to":"{{to_intl}}","message":"{{message}}"}' : '{"to":"{{to}}","subject":"{{subject}}","text":"{{message}}"}'}/></label>
    <p className="muted">Placeholders: {isSms ? '{{to}} (10-digit), {{to_intl}} (with country code), ' : '{{to}}, {{subject}}, '}{'{{message}}, {{store}}, {{key}}, {{key_b64}} (key as base64, handy for Basic auth)'}. Put secrets only in the key field and use {'{{key}}'}.</p>
  </>;
  const badge = p => <span className={`status-pill ${p.configured ? 'on' : 'off'}`}>{p.configured ? (p.source === 'own' ? `Ready: your ${p.label}` : 'Needs your own provider') : 'Not connected - alerts cannot send'}</span>;
  return <form onSubmit={save} className="dashboard-panel settings-panel notify-settings accordion-panel">
    <button type="button" className="accordion-head" aria-expanded={open} onClick={() => setOpen(o => !o)}><h3>SMS & email - your business</h3><span className="accordion-chev" aria-hidden="true">{open ? '\u25B4' : '\u25BE'}</span></button>
    {open && <>
    <p className="muted">Connect your business account, then choose your alerts. All messages use this store's own provider and sender. Charges and quotas belong to that provider account, not Digital Shop. No platform account is used as a fallback. Saving a provider does not turn alerts on.</p>
    <div className="notify-row"><strong>Email</strong>{badge(state.email)}</div>
    <details className="notify-provider"><summary>{state.email.configured && state.email.source === 'own' ? 'Change my email provider' : 'Set up my business email'}</summary>
      <label>Provider<select value={kf.emailMode || ''} onChange={e => setKf(x => ({ ...x, emailMode: e.target.value }))}><option value="">Not connected (no sending)</option><option value="resend">Resend (easy, free tier)</option><option value="smtp">SMTP (advanced; standard ports blocked on current hosting)</option><option value="http">Custom email API (any HTTP service)</option></select></label>
      {kf.emailMode === 'resend' && <><ol className="notify-steps"><li>Create a Resend account for your business.</li><li>Add and verify a domain you own in Resend (DNS records).</li><li>Create an API key, add it below, and use an address on your verified domain as Send from.</li><li>Save provider, set your alert email, then switch on alerts and Save alerts.</li></ol><p className="muted">Resend free tier: 3,000 emails/month, 100/day. Check current limits in your own account. <a href="https://resend.com/pricing" target="_blank" rel="noreferrer">Open Resend</a></p>{secretIn('resend', 'apiKey', 'Resend API key', keys?.resend.apiKeySaved, keys?.resend.apiKeyHint)}{textIn('resend', 'from', 'Send from', 'Shop <alerts@yourdomain.com>')}</>}
      {kf.emailMode === 'smtp' && <><p className="notice">Current free hosting blocks SMTP ports 25, 465 and 587. Use Resend or a custom HTTPS email API instead. Port 2525 is provider-dependent and not verified here.</p><div className="notify-two">{textIn('smtp', 'host', 'SMTP server', 'smtp.example.com')}<label>Port<select value={kf.smtp?.port || 587} onChange={e => setK('smtp', 'port', e.target.value)}><option value="587">587 (STARTTLS)</option><option value="465">465 (SSL)</option><option value="2525">2525</option><option value="25">25</option></select></label></div>
        <label className="check-label"><input type="checkbox" checked={Boolean(kf.smtp?.secure)} onChange={e => setK('smtp', 'secure', e.target.checked)}/> Use SSL from the start (port 465)</label>
        <div className="notify-two">{textIn('smtp', 'user', 'Username', 'usually your email')}{secretIn('smtp', 'pass', 'Password or app password', keys?.smtp.passSaved)}</div>{textIn('smtp', 'from', 'Send from', 'Shop <alerts@yourdomain.com>')}</>}
      {kf.emailMode === 'http' && httpFields('emailHttp', keys?.emailHttp || {}, false)}
      <div className="notify-actions"><button type="button" className="btn btn-green btn-small" disabled={kBusy} onClick={() => saveProvider('email')}><Busy active={kBusy}>{kf.emailMode ? 'Save email provider' : 'Remove my email provider'}</Busy></button></div>
      <p className="muted">Only this store can use these credentials. Keys are encrypted and not shown after saving.</p></details>
    <label className="check-label"><input type="checkbox" disabled={!state.email.configured && !form.ownerEmailAlerts} checked={form.ownerEmailAlerts} onChange={e => set('ownerEmailAlerts', e.target.checked)}/> Email me for every new enquiry or order</label>
    <label className="check-label"><input type="checkbox" disabled={!state.email.configured && !form.customerEmail} checked={form.customerEmail===true} onChange={e=>set('customerEmail',e.target.checked)}/> Email customers order receipt and status updates <small>(only if they provided an email and requested updates; no marketing)</small></label>
    <label>Alert email <small>(leave blank to use your login email)</small><input type="email" value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} placeholder="you@example.com"/></label>
    <div className="notify-row"><strong>SMS</strong>{badge(state.sms)}</div>
    <details className="notify-provider"><summary>{state.sms.configured && state.sms.source === 'own' ? 'Change my SMS provider' : 'Set up my business SMS'}</summary>
      <label>Provider<select value={kf.smsMode || ''} onChange={e => setKf(x => ({ ...x, smsMode: e.target.value }))}><option value="">Not connected (no sending)</option><option value="fast2sms">Fast2SMS (easy, India)</option><option value="http">Custom SMS API (MSG91, Twilio, Textlocal, any gateway)</option></select></label>
      {kf.smsMode === 'fast2sms' && <><ol className="notify-steps"><li>Create your business Fast2SMS account and check its wallet balance.</li><li>For DLT, complete the provider's sender and message-template approval; copy sender ID and template/message ID.</li><li>Add your API key below and select the correct route. Quick costs more than DLT.</li><li>Save provider, add your alert mobile, then select alerts and Save alerts.</li></ol><p className="muted">Customer SMS needs the correct approved template/variables for each message. One template must not be assumed to fit every confirmation, status or report. Check the provider setup before enabling customer SMS. <a href="https://www.fast2sms.com/" target="_blank" rel="noreferrer">Open Fast2SMS</a></p>{secretIn('fast2sms', 'apiKey', 'Fast2SMS API key', keys?.fast2sms.apiKeySaved, keys?.fast2sms.apiKeyHint)}<label>Route<select value={kf.fast2sms?.route || 'quick'} onChange={e => setK('fast2sms', 'route', e.target.value)}><option value="quick">Quick (paid, ₹5/SMS advertised; not a free test)</option><option value="dlt">DLT (approved template, for customer SMS)</option></select></label>
        {kf.fast2sms?.route === 'dlt' && <div className="notify-two">{textIn('fast2sms', 'senderId', 'DLT sender ID', 'ABCDEF')}{textIn('fast2sms', 'templateId', 'DLT message ID', '123456')}</div>}</>}
      {kf.smsMode === 'http' && httpFields('smsHttp', keys?.smsHttp || {}, true)}
      <div className="notify-actions"><button type="button" className="btn btn-green btn-small" disabled={kBusy} onClick={() => saveProvider('sms')}><Busy active={kBusy}>{kf.smsMode ? 'Save SMS provider' : 'Remove my SMS provider'}</Busy></button></div>
      <p className="muted">SMS is charged by your provider. Only this store can use these credentials. Keys are encrypted and not shown after saving.</p></details>
    <label className="check-label"><input type="checkbox" disabled={!state.sms.configured && !form.ownerSmsAlerts} checked={form.ownerSmsAlerts} onChange={e => set('ownerSmsAlerts', e.target.checked)}/> Text me for every new enquiry or order</label>
    <label>Your mobile number <small>(10-digit Indian number)</small><input type="tel" inputMode="numeric" value={form.ownerPhone} onChange={e => set('ownerPhone', e.target.value)} placeholder="98765 43210"/></label>
    <label className="check-label"><input type="checkbox" disabled={!state.sms.configured && !form.customerSms} checked={form.customerSms} onChange={e => set('customerSms', e.target.checked)}/> Text customers order confirmation and status updates from my SMS account <small>(only if they gave a number)</small></label>
    <label className="check-label"><input type="checkbox" disabled={!form.ownerEmailAlerts && !form.ownerSmsAlerts && !form.lowStockAlerts} checked={form.lowStockAlerts} onChange={e => set('lowStockAlerts', e.target.checked)}/> Alert me when stock runs low <small>(one message a day, only when something is low. Uses your email and SMS alert settings above)</small></label>
    {form.lowStockAlerts && <label>Alert when stock is at or below<input type="number" min="1" max="100" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))}/></label>}
    <label className="check-label"><input type="checkbox" disabled={!form.ownerEmailAlerts && !form.ownerSmsAlerts && !form.weeklyReport} checked={form.weeklyReport} onChange={e => set('weeklyReport', e.target.checked)}/> Send me a weekly shop report every Monday morning <small>(last 7 days: {'enquiries or orders, top items, low stock'})</small></label>
    {msg?.ok && <p className="notice success">{msg.ok}</p>}{msg?.error && <p className="notice error">{msg.error}</p>}
    <div className="notify-actions">
      <button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy ? 'Saving...' : 'Save alerts'}</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || !state.email.configured} onClick={() => test('email')}><Busy active={testing === 'email'}>Send test email</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || !state.sms.configured} onClick={() => test('sms')}><Busy active={testing === 'sms'}>Send paid test SMS</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || (!state.email.configured && !state.sms.configured)} onClick={sampleReport}><Busy active={testing === 'report'}>Send sample weekly report</Busy></button>
    </div>
    <p className="muted">Save alert recipients/settings first. Test buttons send a real message and use your provider quota or SMS balance. Never paste keys in chat; add them only in the provider fields here.</p>
    </>}
  </form>;
}

function Settings({ business, token, storeId, onSaved, onError, onRemoved }) {
  const [form, setForm] = useState(null);
  const [previewOffer, setPreviewOffer] = useState(false);
  const [settingsSection,setSettingsSection]=useState('business');
  const [savedForm,setSavedForm]=useState('');
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(''), [removeSlug, setRemoveSlug] = useState(''), [removeBusy, setRemoveBusy] = useState(false), [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    setForm(business ? {
      name: business.name, description: business.description || '', location: business.location || '', whatsapp: business.whatsapp,
      gstin: business.gstin || '', gstMode: business.gstMode || '', gstRate: business.gstRate ?? 5, upiId: business.upiId || '',
      bannerText: business.bannerText || '', bannerActive: Boolean(business.bannerActive), offerPopupActive: Boolean(business.offerPopupActive), offerPopupText: business.offerPopupText || '', offerPopupTitle: business.offerPopupTitle || '', offerPopupCtaText: business.offerPopupCtaText || '', offerPopupCtaUrl: business.offerPopupCtaUrl || '', offerPopupImageUrl: business.offerPopupImageUrl || '',
      isOpen: business.isOpen !== false, autoHours: Boolean(business.autoHours), blockWhenClosed: business.blockWhenClosed ?? business.storeType === 'restaurant', openTime: business.openTime || '09:00', closeTime: business.closeTime || '21:00', openingHours: business.openingHours || '', storeType: business.storeType || 'retail', tableCount: business.tableCount || 0,
      deliveryCharge: business.deliveryCharge ?? 0, freeDeliveryAbove: business.freeDeliveryAbove ?? '', minOrder: business.minOrder ?? 0, prepMinutes: business.prepMinutes ?? '',
      accentColor: business.accentColor || '#0e9f6e', logoUrl: business.logoUrl || '', coverUrl: business.coverUrl || '', notifyImageUrl: business.notifyImageUrl || '',
      latitude: business.latitude ?? '', longitude: business.longitude ?? '', area: business.area || '', pincode: business.pincode || '', listInDirectory: Boolean(business.listInDirectory), serviceRadiusKm: business.serviceRadiusKm ?? ''
    } : null);
    setSettingsSection('business');setSavedForm('');
  }, [business?.id]);
  useEffect(()=>{if(form&&!savedForm)setSavedForm(JSON.stringify(form));},[form,savedForm]);
  if (!form) return <div className="dashboard-panel"><BrandLoader compact/></div>;
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
    const color = normalizeHexColor(form.accentColor);
    if (!color) { setSettingsSection('storefront'); onError('Enter a valid custom hex color, such as #7C3AED.'); return; }
    setBusy(true);
    try {
      await api(`/owner/${storeId}/business`, { method: 'PATCH', token, body: { ...form, accentColor: color, freeDeliveryAbove: form.freeDeliveryAbove === '' ? null : Number(form.freeDeliveryAbove), deliveryCharge: Number(form.deliveryCharge) || 0, minOrder: Number(form.minOrder) || 0 } });
      setSavedForm(JSON.stringify(form));onSaved();
    } catch (err) { onError(err.message); } finally { setBusy(false); }
  };
  const BASE = import.meta.env.VITE_API_URL || '';
  return <div className="shop-settings-studio"><section className="settings-hero"><div className="settings-identity">{business.logoUrl?<img src={storeImage(imageSrc(business.logoUrl),192)} alt=""/>:<span className="settings-monogram">{business.name.slice(0,1)}</span>}<div><span className="settings-eyebrow">YOUR SHOP, YOUR WAY</span><h2>{business.name}</h2><p>{business.storeType==='restaurant'?'Restaurant':'Store'} setup · Changes publish only when saved</p></div></div><a className="btn btn-outline" href={storeLink(business.slug)} target="_blank" rel="noreferrer">View shop <ArrowUpRight size={16}/></a></section><nav className="settings-tabs" aria-label="Shop settings sections">{[['business','Business details','01'],['storefront','Look & offers','02'],['orders','Orders & delivery','03'],['hours','Hours & QR','04']].map(([key,label,num])=><button key={key} type="button" className={settingsSection===key?'active':''} aria-pressed={settingsSection===key} onClick={()=>setSettingsSection(key)}><span>{num}</span>{label}</button>)}</nav><form onSubmit={submit} onInvalidCapture={e=>{const section=e.target.closest('.settings-page');if(section){const keys=['business','storefront','orders','hours'];setSettingsSection(keys[Array.from(section.parentElement.querySelectorAll('.settings-page')).indexOf(section)]);}}} className="settings-grid settings-workspace">
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='business'}>
      <div className="settings-card-head"><span className="settings-eyebrow">BUSINESS DETAILS</span><h3>The essentials</h3><p className="muted">Help customers recognize and contact your shop.</p></div><label>Store type<select value={form.storeType} onChange={e => setForm(f => ({ ...f, storeType: e.target.value, blockWhenClosed: e.target.value === 'restaurant' && f.storeType !== 'restaurant' ? true : f.blockWhenClosed, tableCount: e.target.value === 'restaurant' && !f.tableCount ? 1 : f.tableCount }))}><option value="retail">Retail / kirana</option><option value="restaurant">Restaurant</option><option value="services">Services</option></select></label>{form.storeType === 'restaurant' && <label>Number of tables<input type="number" min="1" max="100" value={form.tableCount} onChange={e => set('tableCount', Number(e.target.value))} required/></label>}

      <label>Shop name<input value={form.name} onChange={e => set('name', e.target.value)} required/></label>
      <label>Short description<textarea rows="3" value={form.description} onChange={e => set('description', e.target.value)}/></label>
      <label>Location<input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Mumbai, India"/></label>
      <label>WhatsApp number <small>(country code, no +)</small><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} required/></label>
      <label>GSTIN <small>(optional, shown on estimates)</small><input value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="27ABCDE1234F1Z5" maxLength={15}/></label>
      {form.storeType === 'restaurant' && <div className="gst-setting"><label>Bill GST<select value={form.gstMode} onChange={e => set('gstMode', e.target.value)}><option value="">Choose per bill (as before)</option><option value="off">Off - no GST on bills</option><option value="inclusive">Inclusive - prices already include GST</option><option value="exclusive">Exclusive - GST added on top</option></select></label>{(form.gstMode === 'inclusive' || form.gstMode === 'exclusive') && <label>GST rate<select value={form.gstRate} onChange={e => set('gstRate', Number(e.target.value))}>{[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>}<p className="muted">Your GSTIN above is printed on every receipt. A fixed setting applies to every new bill; saved bills never change.</p></div>}
      <p className="muted">Your shop link: {storeLink(business.slug)}</p>
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='storefront'}>
      <div className="settings-card-head"><span className="settings-eyebrow">STOREFRONT</span><h3>Make it look like you</h3><p className="muted">Your color, images and offers, all in one place.</p></div><div className="settings-section-head"><h4>Visitor offer popup</h4><button type="button" className="btn btn-outline btn-small" onClick={() => setPreviewOffer(true)}>Preview popup</button></div><label className="check-label"><input type="checkbox" checked={form.offerPopupActive} onChange={e => set('offerPopupActive', e.target.checked)}/> Show an offer when a visitor opens this store</label><label>Popup headline <small>(optional, defaults to your shop name)</small><input maxLength={90} value={form.offerPopupTitle} onChange={e => set('offerPopupTitle', e.target.value)} placeholder="A little something for you"/></label><label>Offer message<textarea rows="2" maxLength={220} value={form.offerPopupText} onChange={e => set('offerPopupText', e.target.value)} placeholder="20% off fresh arrivals this week"/></label><div className="form-row"><label>Button label <small>(optional)</small><input maxLength={40} value={form.offerPopupCtaText} onChange={e => set('offerPopupCtaText', e.target.value)} placeholder="Shop the offer"/></label><label>Button link <small>(https:// link, optional)</small><input type="url" value={form.offerPopupCtaUrl} onChange={e => set('offerPopupCtaUrl', e.target.value)} placeholder="https://example.com/offer"/></label></div><label>Offer image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('offerPopupImageUrl')}/></label>{form.offerPopupImageUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.offerPopupImageUrl),640)} alt="Offer preview"/><button type="button" className="btn btn-outline btn-small" onClick={() => set('offerPopupImageUrl', '')}>Remove image</button></div>}
      <label>Offer banner text <small>(scrolling strip on top of your shop)</small><input value={form.bannerText} onChange={e => set('bannerText', e.target.value)} placeholder="Free delivery above ₹499!"/></label><label className="check-label"><input type="checkbox" checked={form.bannerActive} onChange={e => set('bannerActive', e.target.checked)}/> Show text announcement bar</label><fieldset className="theme-choices"><legend>Festive presets</legend><p className="muted">Prepares a color, banner and offer. Review and save to publish; existing text can be edited first.</p><div className="festival-presets">{FESTIVAL_PRESETS.map(preset => <button type="button" className="btn btn-outline btn-small" key={preset.name} onClick={() => setForm(f => ({ ...f, accentColor:preset.color, bannerText:preset.banner, bannerActive:true, offerPopupTitle:preset.headline, offerPopupText:preset.message, offerPopupActive:true }))}>{preset.name}</button>)}</div></fieldset><fieldset className="theme-choices"><legend>Shop color theme</legend><p className="muted">Sets your shop and this dashboard together. Original green is the default.</p><div className="theme-swatches">{[...STORE_THEMES, ...(normalizeHexColor(form.accentColor) && !STORE_THEMES.some(t => t.color === normalizeHexColor(form.accentColor)) ? [{ name: 'Current custom', color:normalizeHexColor(form.accentColor) }] : [])].map(option => <button key={option.color} type="button" className={`theme-swatch ${form.accentColor === option.color ? 'chosen' : ''}`} onClick={() => set('accentColor', option.color)} aria-pressed={form.accentColor === option.color} title={option.name}><span style={{ background:option.color }}/>{option.name}</button>)}</div><CustomStoreColor value={form.accentColor} onChange={color => set('accentColor', color)}/><small>Save all changes to publish this color to your shop.</small></fieldset>
      <label>Shop logo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('logoUrl')}/>{uploading === 'logoUrl' && <small><span className="button-spinner"/>Uploading logo...</small>}</label>
      {form.logoUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.logoUrl),640)} alt="Logo preview"/><span>Logo ready</span></div>}
      <label>Default notification image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('notifyImageUrl')}/>{uploading === 'notifyImageUrl' && <small><span className="button-spinner"/>Uploading image...</small>}<small className="muted">Used in push notifications and WhatsApp order messages. If empty, your cover, then logo, is used.</small></label>
      {form.notifyImageUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.notifyImageUrl),640)} alt="Notification image preview"/><span>Notification image ready</span><button type="button" className="btn btn-outline btn-small" onClick={() => set('notifyImageUrl', '')}>Remove</button></div>}
      {settingsSection==='storefront'&&<LocationPicker form={form} set={set}/>}
      <label>Cover photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('coverUrl')}/>{uploading === 'coverUrl' && <small><span className="button-spinner"/>Uploading cover...</small>}</label>
      {form.coverUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.coverUrl),640)} alt="Cover preview"/><span>Cover ready</span></div>}
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='orders'}>
      <div className="settings-card-head"><span className="settings-eyebrow">ORDERS & PAYMENTS</span><h3>Orders & delivery</h3><p className="muted">Set your delivery charges, minimum order and UPI details.</p></div>
      <div className="form-row">
        <label>Delivery charge (₹)<input type="number" min="0" step="1" value={form.deliveryCharge} onChange={e => set('deliveryCharge', e.target.value)}/></label>
        <label>Free delivery above (₹) <small>(blank = never)</small><input type="number" min="0" step="1" value={form.freeDeliveryAbove} onChange={e => set('freeDeliveryAbove', e.target.value)} placeholder="499"/></label>
      </div>
      <label>Minimum order (₹)<input type="number" min="0" step="1" value={form.minOrder} onChange={e => set('minOrder', e.target.value)}/></label>
      {business.storeType === 'restaurant' && <label>Takeaway ready in (minutes) <small>(optional, shown to customers)</small><input type="number" min="1" max="240" step="1" value={form.prepMinutes} onChange={e => set('prepMinutes', e.target.value)} placeholder="e.g. 20"/></label>}
      <label>UPI ID <small>(sent in the order message so customers can pay)</small><input value={form.upiId} onChange={e => set('upiId', e.target.value)} placeholder="yourshop@upi"/></label>
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='hours'}>
      <div className="settings-card-head"><span className="settings-eyebrow">BUSINESS HOURS</span><h3>When you are open</h3><p className="muted">Choose how customers can order, in Indian time.</p></div>
      <label className="check-label"><input type="checkbox" checked={form.isOpen} onChange={e => set('isOpen', e.target.checked)}/> <span>Shop is open <small style={{ display: 'block', fontWeight: 400 }}>(untick to close the shop right now, whatever the hours)</small></span></label>
      <label className="check-label"><input type="checkbox" checked={form.autoHours} onChange={e => set('autoHours', e.target.checked)}/> <span>Open and close automatically by time <small style={{ display: 'block', fontWeight: 400 }}>(Indian time)</small></span></label>
      {form.autoHours && <div className="form-row"><label>Opens at<input type="time" value={form.openTime} onChange={e => set('openTime', e.target.value)} required/></label><label>Closes at<input type="time" value={form.closeTime} onChange={e => set('closeTime', e.target.value)} required/></label></div>}
      {form.autoHours && <p className="muted">Customers see Open between these times and a big Closed banner outside them. A closing time earlier than the opening time means the shop stays open past midnight.</p>}
      <label className="check-label"><input type="checkbox" checked={form.blockWhenClosed} onChange={e => set('blockWhenClosed', e.target.checked)}/> <span>No orders while the shop is closed <small style={{ display: 'block', fontWeight: 400 }}>(on: customers cannot order when closed, good for restaurants. off: they can still send an order that you confirm when you open)</small></span></label>
      <label>Opening hours note <small>(optional text, shown if automatic hours are off)</small><input value={form.openingHours} onChange={e => set('openingHours', e.target.value)} placeholder="8:00 AM - 10:00 PM"/></label>
      <h3>Shop QR code</h3>
      <div className="qr-inline"><img src={`${BASE}/api/public/stores/${business.slug}/qr`} alt="Shop QR code"/><div><p className="muted">Print this and stick it on your counter - customers scan it to open your shop.</p><a className="btn btn-outline btn-small" href={`${BASE}/api/public/stores/${business.slug}/qr`} download={`${business.slug}-qr.svg`}><Download size={15}/> Download QR</a></div></div>
    </div>
    <div className="settings-save"><div><strong>{JSON.stringify(form)!==savedForm?'Unsaved changes':'Settings up to date'}</strong><small>Applies to all four sections. Provider settings are saved separately.</small></div><button className="btn btn-green" disabled={busy || !!uploading}><Busy active={busy}>{busy ? 'Saving...' : 'Save shop settings'}</Busy></button></div>
  </form>{previewOffer && <OfferPopup business={{ ...business, ...form }} accentColor={form.accentColor} preview onClose={() => setPreviewOffer(false)}/>}<details className="dashboard-panel remove-store-panel"><summary>Store removal <span>Advanced</span></summary><h3>Remove this store</h3><p className="muted">The store goes offline and disappears from your dashboard. You can restore it within 30 days. Store data is kept during that window.</p><label>Type <strong>{business.slug}</strong> to confirm<input value={removeSlug} onChange={e => { setRemoveSlug(e.target.value); setConfirmRemove(false); }} autoComplete="off" placeholder={business.slug}/></label><button type="button" className="btn btn-outline danger" disabled={removeBusy || removeSlug !== business.slug} onClick={() => setConfirmRemove(true)}>Remove store</button>{confirmRemove && <div className="remove-confirm" role="alertdialog" aria-label="Confirm store removal"><p>Take <strong>{business.name}</strong> offline? You can restore it within 30 days.</p><button type="button" className="btn btn-outline btn-small" onClick={() => setConfirmRemove(false)}>Cancel</button><button type="button" className="btn btn-outline btn-small danger" disabled={removeBusy || removeSlug !== business.slug} onClick={async () => { setRemoveBusy(true); try { await api(`/owner/${storeId}`, { method: 'DELETE', token, body: { slug: removeSlug } }); onRemoved(); } catch (err) { onError(err.message); } finally { setRemoveBusy(false); setConfirmRemove(false); } }}><Busy active={removeBusy}>{removeBusy ? 'Removing...' : 'Confirm removal'}</Busy></button></div>}</details><ChangePassword/></div>;
}

export default function Dashboard() {
  const { session } = useAuth(), token = session.token;
  const staffMode = session.user.role === 'staff';
  const location = useLocation();
  const orderLinkApplied = React.useRef(false);
  const pendingOrderTab = React.useRef(false);
  const linkedStore = new URLSearchParams(location.search).get('store');
  const initialTab = useRef(['imports','whatsapp-cloud','overview','products','categories','customers','leads','sales','tables','referrals','staff','coupons','restaurant','campaigns','broadcast','notifications','settings'].find(k => k === (location.hash || '').replace(/^#\/?/, '')) || null);
  const [tab, setTabState] = useState(initialTab.current || 'overview');
  // Keep the open page in the URL so a browser refresh stays on the same page.
  const setTab = useCallback(next => { setTabState(next); try { const t = typeof next === 'function' ? null : next; if (t) history.replaceState(null, '', `${location.pathname}${location.search}#${t}`); } catch { /* URL sync is optional */ } }, []);
  const [filters,setFilters] = useState({q:'',status:'all',from:'',to:'',page:1});
  const [customerRefresh,setCustomerRefresh]=useState(0);
  const [listTotal,setListTotal] = useState(0), [tableTotal,setTableTotal] = useState(0);
  const queryString = new URLSearchParams(Object.entries(filters).filter(([,v])=>v!=='' && v!=='all')).toString();
  const [loading, setLoading] = useState(true), [storeListLoading, setStoreListLoading] = useState(true);
  const [data, setData] = useState(null), [supportProducts, setProducts] = useState([]), [supportCategories, setCategories] = useState([]), [supportLeads, setLeads] = useState([]);
  const [error, setError] = useFeedbackState(''), [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [deleteProductId, setDeleteProductId] = useState(null);
  const [categoryEdit, setCategoryEdit] = useState(null), [categoryName, setCategoryName] = useState('');
  const setStoreId = useCallback(next => { setStoreIdState(prev => { const v = typeof next === 'function' ? next(prev) : next; try { if (v) localStorage.setItem('dd-store', String(v)); } catch { /* optional */ } return v; }); }, []);
  const [stores, setStores] = useState([]), [storeId, setStoreIdState] = useState(() => { try { return localStorage.getItem('dd-store') || ''; } catch { return ''; } }), [deletedStores, setDeletedStores] = useState([]), [restoreSlug, setRestoreSlug] = useState({});
  const [newStore, setNewStore] = useState({ name: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 });
  const [notify, setNotify] = useState({ title: '', body: '', link: '', productId: '' }), [notifyImg, setNotifyImg] = useState(''), [notifyImgBusy, setNotifyImgBusy] = useState(false), [notifyResult, setNotifyResult] = useState('');
  const [broadcastText, setBroadcastText] = useState(''), [broadcastRecipients, setBroadcastRecipients] = useState('');
  const [broadcastImageUrl, setBroadcastImageUrl] = useState(''), [broadcastImageBusy, setBroadcastImageBusy] = useState(false);
  const selectedStoreRef = React.useRef(storeId); selectedStoreRef.current = storeId;
  const storesRef = React.useRef(stores); storesRef.current = stores;
  const loadSequence = React.useRef(0);
  const broadcastStoreRef = React.useRef(storeId); broadcastStoreRef.current = storeId;
  const [supportRestaurantOrders, setRestaurantOrders] = useState([]), [supportCoupons, setCoupons] = useState([]), [sales, setSales] = useState(null);
  const [supportReferrals, setReferrals] = useState([]);
  const [supportStaff, setStaff] = useState([]), [staffForm, setStaffForm] = useState({ name:'', email:'', password:'', permissions:[...DEFAULT_STAFF_PERMS] });
  const [couponForm, setCouponForm] = useState({ code: '', percentOff: 10 });
  const [importResult, setImportResult] = useState(''), [actionKey, setActionKey] = useState(''), [exportBusy, setExportBusy] = useState(false);

  const reloadStoreLists = async () => { const [live, removed] = await Promise.all([api('/owner/stores', { token }), ...(!staffMode ? [api('/owner/deleted-stores', { token })] : [])]); setStores(live.stores); setDeletedStores(removed?.stores || []); setStoreId(current => {
    if (!orderLinkApplied.current) {
      const requested = requestedOrderStore(live.stores, location.search);
      if (requested !== null) {
        orderLinkApplied.current = true;
        if (!requested) { setError('This store is not available in your account. Sign in with the store owner account.'); return ''; }
        pendingOrderTab.current = requestedOrderTab(location.search) || 'leads';
        return requested.id;
      }
    }
    return live.stores.some(s => String(s.id) === String(current)) ? current : live.stores[0]?.id || '';
  }); };
  useEffect(() => { reloadStoreLists().catch(e => setError(e.message)).finally(() => setStoreListLoading(false)); }, []);
  const pagedTabs=['products','categories','coupons','referrals','staff','leads','restaurant'];
  const [listRefresh,setListRefresh]=useState(0);
  const listFeature=tab==='categories'?'products':tab;
  const permissionFeature=tab==='restaurant'?'orders_view':listFeature;
  const listEnabled=!!storeId&&!!data&&String(data.business?.id)===String(storeId)&&pagedTabs.includes(tab)&&data.business?.featureLocks?.[listFeature]!==true&&(!staffMode||(session.user.permissions||[]).includes(permissionFeature));
  const list=useOwnerPages(storeId,tab==='restaurant'?'restaurant-orders':tab,filters,token,listRefresh,listEnabled);
  const leads=tab==='leads'?list.rows:supportLeads;
  const restaurantOrders=tab==='restaurant'?list.rows:supportRestaurantOrders;
  const products=tab==='products'?list.rows:supportProducts;
  const categories=tab==='categories'?list.rows:supportCategories;
  const coupons=tab==='coupons'?list.rows:supportCoupons;
  const referrals=tab==='referrals'?list.rows:supportReferrals;
  const staff=tab==='staff'?list.rows:supportStaff;
  const load = async (quiet = false) => {
    if (!storeId) return;
    const requestStore = storeId, sequence = ++loadSequence.current;
    const stale = () => String(selectedStoreRef.current) !== String(requestStore) || sequence !== loadSequence.current;
    if (!quiet) setLoading(true);
    try {
      const freshOverview = await api(`/owner/${storeId}/overview`, {token});
      if(stale())return;
      const locks = freshOverview.business?.featureLocks || {};
      setStores(prev=>prev.map(s=>String(s.id)===String(storeId)?freshOverview.business:s));
      const unlocked = feature => locks[feature] !== true;
      setData(freshOverview);
      const allowed=feature=>unlocked(feature)&&(!staffMode||(session.user.permissions||[]).includes(feature==='restaurant'?'orders_view':feature));
      const jobs=[];
      if(['notifications','broadcast'].includes(tab)&&allowed('products'))jobs.push(api(`/owner/${storeId}/products`,{token}).then(r=>{if(!stale())setProducts(r.products);}));
      if(tab==='products'&&allowed('products'))jobs.push(api(`/owner/${storeId}/categories`,{token}).then(r=>{if(!stale())setCategories(r.categories);}));
      if(tab==='sales'&&allowed('sales'))jobs.push(api(`/owner/${storeId}/sales-summary?${new URLSearchParams({from:filters.from,to:filters.to})}`,{token}).then(r=>{if(!stale())setSales(r);}));
      await Promise.all(jobs);

    } catch (e) { if (!stale()) setError(e.message); } finally { if (!stale()) setLoading(false); }
  };
  useEffect(() => { setBroadcastImageUrl(''); setBroadcastText(''); setBroadcastRecipients(''); }, [storeId]);
  useEffect(() => { const keep = initialTab.current; if (storeId) initialTab.current = null; setTab(pendingOrderTab.current || keep || 'overview'); pendingOrderTab.current = false; setRestaurantOrders([]); setData(null); setProducts([]); setCategories([]); setLeads([]); setEditing(null); setImportResult(''); setCoupons([]); setReferrals([]); setStaff([]); setSales(null); setDeleteProductId(null); setCategoryEdit(null); setCategoryName(''); load(); }, [storeId]);

  useEffect(()=>{ setFilters(f=>({...f,q:'',status:'all',page:1})); },[tab,storeId]);
  useEffect(() => { const timer=setTimeout(()=>{ if(storeId) load(); },300); return ()=>clearTimeout(timer); }, [tab,filters.from,filters.to]);
  const reportDownload = async kind => { setExportBusy(true); try { await download(`/owner/${storeId}/${kind}/report.csv?${kind === 'sales-summary' ? new URLSearchParams({from:filters.from,to:filters.to}) : queryString}`, `${kind}-${data?.business?.slug || 'store'}.csv`,token); } catch(e){setError(e.message);} finally{setExportBusy(false);} };
  const flash = msg => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const action = async (fn, key = 'action') => { if (busy) return; setBusy(true); setActionKey(key); setError(''); try { await fn(); setListRefresh(n=>n+1); await load(true); } catch (e) { setError(e.message); } finally { setBusy(false); setActionKey(''); } };

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

  const uploadBroadcastImage = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image under 5 MB'); return; }
    setBroadcastImageBusy(true); setError(''); setBroadcastImageUrl('');
    const selectedStore = storeId;
    try {
      const body = new FormData(); body.append('image', file);
      const result = await api(`/owner/${selectedStore}/upload`, { method: 'POST', token, body });
      if (!/^https:\/\/ik\.imagekit\.io\//.test(result.imageUrl || '')) throw Error('Hosted image is unavailable. Try again later.');
      if (String(selectedStore) === String(broadcastStoreRef.current)) setBroadcastImageUrl(result.imageUrl);
    } catch (err) { setError(err.message); } finally { setBroadcastImageBusy(false); }
  };

  const sendBroadcast = e => {
    e.preventDefault();
    action(async () => {
      const result = await api(`/owner/${storeId}/push-broadcast`, { method: 'POST', token, body: { title: notify.title, body: notify.body, ...(notify.link.trim() ? { link: notify.link.trim() } : notify.productId ? { productId: notify.productId } : {}), ...(notifyImg ? { image: notifyImg } : {}) } });
      setNotify({ title: '', body: '', link: '', productId: '' }); setNotifyImg('');
      setNotifyResult(`Sent to ${result.sent} subscriber${result.sent === 1 ? '' : 's'}${result.gone ? `, removed ${result.gone} expired` : ''}.`);
    });
  };

  const headings = { tables:['Tables.','Every table, delivery and takeaway in one live view.'], imports:['Bulk import.','Add products and customers with a reviewed column mapping.'], 'whatsapp-cloud': ['WhatsApp integration.', 'Connected shop inbox and service replies.'], overview: ['Your shop at a glance.', 'See what customers are browsing and which requests need your attention.'], products: ['Your products.', 'Keep your collection looking its best.'], categories: ['Categories.', 'Help customers find exactly what they need.'], customers: ['Your customers.', 'Store-scoped contacts and consent records.'], leads: ['WhatsApp orders.', 'Track incoming requests and follow up with customers.'], sales: ['Sales and enquiries.', data?.business?.storeType === 'restaurant' ? 'A clear view of recorded restaurant orders and customer enquiries.' : 'A clear view of customer enquiries and their value.'], referrals: ['Referrals.', 'Both sides earn 10% only after the shop confirms the referred order.'], staff: ['Staff accounts.', 'Give helpers limited access without sharing your password.'], coupons: ['Coupons.', 'Create discounts customers can use at checkout.'], restaurant: ['Table orders.', 'New restaurant orders arrive here.'], campaigns:['Email & SMS offers.','Offers from your business account to consented customers.'], broadcast: ['WhatsApp broadcast.', 'Prepare offers and send them yourself, one recipient at a time.'], notifications: ['Notifications.', 'Reach your customers even after they leave.'], settings: ['Shop settings.', 'Make your corner of the internet yours.'] };
  const currentStore = stores.find(s => String(s.id) === String(storeId));
  useEffect(() => { const h = headings[tab]?.[0]?.replace(/\.$/, ''); document.title = [h, currentStore?.name, 'Digital Shop'].filter(Boolean).join(' - '); return () => { document.title = 'Digital Shop - Your shop, one link away'; }; }, [tab, currentStore?.name]);
  useEffect(() => { if (tab === 'leads' && currentStore?.storeType === 'restaurant') setTab('restaurant'); }, [tab, currentStore?.storeType]);
  const tabLocked = currentStore ? isTabLocked(currentStore, tab) : false;
  const BASE = import.meta.env.VITE_API_URL || '';
  const updateRestaurantOrder = (order, status) => action(async () => { await api(`/owner/${storeId}/restaurant-orders/${order.id}`, { method: 'PATCH', token, body: { status } }); }, `order-${order.id}`);

  return <AdminShell tab={tab} setTab={setTab} stores={stores} storeId={storeId} setStoreId={setStoreId}><div className="admin-content" key={`${storeId}:${tab}`}>
    {!storeId ? (storeListLoading ? <LoadSkeleton label="Loading your stores" cards={2}/> : <div className="dashboard-panel empty-state">{linkedStore ? 'This store is not available in your account. Sign in with the store owner account.' : 'Create a store to manage your catalog.'}</div>) : <>
      <div className="page-title"><div><span className="kicker">YOUR WORKSPACE</span><h1>{headings[tab][0]}</h1><p>{headings[tab][1]}</p></div>{tab === 'products' && !tabLocked && <div className="page-title-actions"><button className="btn btn-outline" disabled={loading || exportBusy || !products.length} onClick={async()=>{setExportBusy(true);try{await download(`/owner/${storeId}/products/catalog.pdf`, `products-${currentStore?.slug || storeId}.pdf`,token);}catch(e){setError(e.message);}finally{setExportBusy(false);}}}>Download products PDF</button><button className="btn btn-outline" disabled={loading || exportBusy || !products.length} onClick={async()=>{setExportBusy(true);try{const full=await api(`/owner/${storeId}/products`,{token});downloadProductCsv(productsCsv(full.products),`products-${currentStore?.slug || storeId}.csv`);}catch(e){setError(e.message);}finally{setExportBusy(false);}}}>Download products CSV</button><button className="btn btn-green" onClick={() => setEditing({ __storeId: storeId })}><Plus size={18}/> Add product</button></div>}</div>
      <Notice error={error} success={success}/>{!tabLocked && tab === 'leads' && <FilterBar value={filters} onChange={setFilters} dates statuses={['new','confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed','cancelled']} onReport={()=>reportDownload('leads')} reportBusy={exportBusy}/>}{!tabLocked && tab === 'restaurant' && <FilterBar value={filters} onChange={setFilters} dates statuses={['new','preparing','served','cancelled']} onReport={()=>reportDownload('restaurant-orders')} reportBusy={exportBusy}/>}{!tabLocked && tab === 'sales' && <FilterBar value={filters} onChange={setFilters} search={false} dates onReport={()=>reportDownload('sales-summary')} reportBusy={exportBusy}/>}{tab === 'products' && !tabLocked && <MappedImport kind="products" token={token} storeId={storeId} onImported={()=>{setListRefresh(n=>n+1);load();}}/>}{['products','categories','coupons','referrals','staff'].includes(tab) && <FilterBar value={filters} onChange={setFilters} searchPlaceholder={{products:'Product name or category...',coupons:'Coupon code...',staff:'Staff name or phone...',referrals:'Referral name or code...'}[tab]} statuses={['products','coupons','staff'].includes(tab)?['active','inactive']:tab==='referrals'?['pending','confirmed']:[]}/>}
      {loading ? <LoadSkeleton label={`Loading ${headings[tab][0]}`} cards={tab === 'overview' || tab === 'sales' ? 4 : 2} rows={3}/> : tabLocked ? <div className="dashboard-panel locked-panel" role="status"><Lock size={28}/><h3>Kindly contact admin</h3><p className="muted">Please contact your platform admin to enable this feature. Your data is safe.</p></div> : <>
      {tab === 'overview' && staffMode && currentStore && storeId && <OrderAlertsCard token={token} storeId={storeId} slug={currentStore.slug}/>}
      {tab === 'overview' && data && !staffMode && <><ShopQr business={data.business} token={token} storeId={storeId}/>
        {data.lowStock?.length > 0 && <div className="notice warn anim-up" role="alert"><Package size={16}/> Low stock alert: {data.lowStock.map(p => `${p.name} (${p.stock} left)`).join(', ')}. Restock these items.</div>}
        {data.business?.storeType === 'restaurant' ? (String(data.business?.id) !== String(storeId) ? null : <RestaurantOverview token={token} storeId={storeId} onOpen={setTab}/>) : <><div className="section-heading"><div><span className="kicker">STORE SNAPSHOT</span><h2>Today at a glance</h2></div><p>Enquiries are requests, not confirmed sales.</p></div><div className="stat-grid overview-stats">{[[data.products, 'Products live in your catalog', Package], [data.categories, 'Ways to browse', Tags], [data.leads, 'WhatsApp enquiries', MessageCircle], [data.subscribers, 'Push subscribers', Bell]].map(([num, label, Icon], i) => <div className="stat-card anim-up" style={{ animationDelay: `${i * 70}ms` }} key={label}><Icon size={21}/><strong>{num}</strong><span>{label}</span></div>)}</div></>}
        <div className="dashboard-panel welcome-panel">
          <div><span className="kicker">YOUR SHOP LINK</span><h2>{data.business?.active ? 'Ready to share your shop?' : 'Your shop is paused'}</h2><p>{data.business?.active ? 'Send your shop link to customers, print your QR code, or share a product directly.' : 'The catalog is hidden from visitors until you reopen the shop in Settings.'}</p><div className="url-pill">{storeLink(data.business?.slug)}</div></div>
          <div className="welcome-actions"><a href={storeLink(data.business?.slug)} target="_blank" rel="noreferrer" className="btn btn-green">Visit your shop <ArrowUpRight size={17}/></a><button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(storeLink(data.business?.slug)); flash('Shop link copied'); } catch { showToast('error', 'Could not copy the link. Please copy it manually.'); } }}><Copy size={16}/> Copy link</button></div>
        </div>
        <div className="overview-grid">
          <div className="dashboard-panel"><h3>Top products by enquiries</h3>{data.topProducts?.length ? <div className="top-list">{data.topProducts.map((t, i) => <div className="top-row" key={t.productName}><span className="top-rank">{i + 1}</span><strong>{t.productName}</strong><span className="top-count">{t.count} taps</span></div>)}</div> : <p className="muted">Enquiries will rank your bestsellers here.</p>}</div>
        </div>
        {!staffMode && currentStore && !isTabLocked(currentStore, 'leads') && <EnquiriesPanel token={token} storeId={storeId} slug={data.business?.slug}/>}
      </>}
      {tab === 'products' && <div className="dashboard-panel">
        {importResult && <p className="notice success">{importResult}</p>}
        {!products.length ? <div className="empty-state"><Package size={36}/><h3>Your catalog starts here</h3><p>Add a category first, then your first product - or import your catalog from Vyapar.</p></div>
          : <div className="table-wrap"><table className="products-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>{products.map(p => <tr key={p.id}>
            <td data-label="Product"><div className="table-product">{p.imageUrl ? <img src={storeImage(imageSrc(p.imageUrl),160)} alt=""/> : <span><Package size={18}/></span>}<strong>{p.name}</strong>{p.featured && <Star size={13} className="star-on"/>}</div></td>
            <td data-label="Category">{p.category?.name || '—'}</td>
            <td data-label="Price">{inr(p.price)}</td>
            <td data-label="Stock">{p.kind === 'service' ? <span className="status service">Service</span> : p.stock === null || p.stock === undefined ? '∞' : p.stock === 0 ? <span className="status paused">Out</span> : p.stock <= 5 ? <span className="status low">{p.stock} low</span> : p.stock}</td>
            <td data-label="Status"><span className={`status ${p.active ? 'live' : 'paused'}`}>{p.active ? 'Live' : 'Hidden'}</span>{data?.business?.storeType === 'restaurant' && <button type="button" className={`btn btn-small ${p.soldOutToday ? 'btn-green' : 'btn-outline'}`} disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/products/${p.id}`, { method: 'PATCH', token, body: { soldOutToday: !p.soldOutToday } }); flash(p.soldOutToday ? 'Back on the menu' : 'Marked sold out for today'); }, `soldout-${p.id}`)}>{p.soldOutToday ? 'Put back on menu' : 'Sold out today'}</button>}</td>
            <td className="row-actions" data-label="Actions"><button onClick={() => setEditing({ ...p, __storeId: storeId })}>Edit</button>{!staffMode && <>{deleteProductId !== p.id && <button className="danger" disabled={busy} onClick={() => setDeleteProductId(p.id)}>Delete</button>}{deleteProductId === p.id && <span className="inline-delete-confirm" role="group" aria-label={`Delete ${p.name}?`}><span>Delete {p.name}? <small>Order and enquiry history stays. Uploaded media is not deleted.</small></span><button className="danger" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/products/${p.id}`, { method: 'DELETE', token }); setDeleteProductId(null); flash('Product deleted'); }, `product-${p.id}`)}><Busy active={actionKey === `product-${p.id}`}>{actionKey === `product-${p.id}` ? 'Deleting...' : 'Yes, delete'}</Busy></button><button disabled={busy} onClick={() => setDeleteProductId(null)}>Cancel</button></span>}</>}</td>
          </tr>)}</tbody></table></div>}
      </div>}
      {tab === 'categories' && <div className="dashboard-panel">
        <form className="inline-form" onSubmit={saveCategory}><label>{categoryEdit ? 'Rename category' : 'Add a category'}<input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Staples, Snacks, Beverages" required/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? 'Saving...' : categoryEdit ? 'Save changes' : 'Add category'}</Busy></button>{categoryEdit && <button type="button" className="btn btn-outline" onClick={() => { setCategoryEdit(null); setCategoryName(''); }}>Cancel</button>}</form>
        <div className="category-list">{categories.map(c => <div key={c.id}><span className="category-symbol"><Tags size={18}/></span><div><strong>{c.name}</strong><small>/{c.slug}</small></div><button onClick={() => { setCategoryEdit(c.id); setCategoryName(c.name); }}>Edit</button><button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete ${c.name}? It must be empty.`)) action(async () => { await api(`/owner/${storeId}/categories/${c.id}`, { method: 'DELETE', token }); flash('Category deleted'); }, `category-${c.id}`); }}><Busy active={actionKey === `category-${c.id}`}>{actionKey === `category-${c.id}` ? 'Deleting...' : 'Delete'}</Busy></button></div>)}{!categories.length && <p className="muted">No categories yet. Add one to organize your products.</p>}</div>
      </div>}
      {tab === 'customers' && !staffMode && <><MappedImport kind="customers" token={token} storeId={storeId} onImported={()=>setCustomerRefresh(n=>n+1)}/><Customers key={customerRefresh} token={token} storeId={storeId}/></>}
      {tab === 'leads' && <div className="dashboard-panel"><button type="button" className="btn btn-outline btn-small" onClick={()=>{setListRefresh(n=>n+1);load();}} disabled={loading}>Refresh orders</button>
        <div className="leads-head"><p className="muted">Each row records a WhatsApp order request. Confirm details and payment with the customer. Set a status, add the customer’s number and tap Update to send them a status message on WhatsApp.</p>{!staffMode && <button className="btn btn-outline btn-small" disabled={exportBusy} onClick={async () => { setExportBusy(true); try { await download(`/owner/${storeId}/export/vyapar.csv`, `vyapar-sales-${data?.business?.slug || 'store'}.csv`, token); } catch (e) { setError(e.message); } finally { setExportBusy(false); } }}><Busy active={exportBusy}><FileSpreadsheet size={16}/> {exportBusy ? 'Exporting...' : 'Export to Vyapar'}</Busy></button>}</div>
        {leads.length ? <div className="table-wrap enquiry-table orders-table"><table><thead><tr><th>Order</th><th>Total</th><th>When</th><th>Customer no.</th><th>Status</th><th></th></tr></thead><tbody>{leads.map(l => <LeadRow key={l.id} lead={l} storeType={data?.business?.storeType} token={token} storeId={storeId} onChanged={()=>{setListRefresh(n=>n+1);load();}}/>)}</tbody></table></div> : <div className="empty-state">No orders yet. Share your shop to get started.</div>}
      </div>}
      {tab === 'staff' && !staffMode && <div className="dashboard-panel"><h3>Staff access</h3><p className="muted">Choose exactly what each helper can see or do. Helpers can always view the store overview. They can never create stores, change shop settings, delete anything, make coupons, see payment keys or payments. Share temporary passwords through a secure channel. A disabled account cannot sign in. If a password is lost, disable that account and create a fresh one.</p><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { await api(`/owner/${storeId}/staff`, { token, method:'POST', body:staffForm }); setStaffForm({ name:'', email:'', password:'', permissions:[...DEFAULT_STAFF_PERMS] }); flash('Staff account created'); }, 'staff-create'); }}><label>Name<input required maxLength={100} value={staffForm.name} onChange={e => setStaffForm({...staffForm,name:e.target.value})}/></label><label>Email<input type="email" required value={staffForm.email} onChange={e => setStaffForm({...staffForm,email:e.target.value})}/></label><label>Temporary password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={staffForm.password} onChange={e => setStaffForm({...staffForm,password:e.target.value})}/></label><PermissionChecks value={staffForm.permissions} onChange={permissions => setStaffForm({...staffForm,permissions})} restaurant={data?.business?.storeType === 'restaurant'}/><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'staff-create'}>Create staff</Busy></button></form><div className="coupon-list">{staff.map(person => <div key={person.id}><strong>{person.name}</strong><span>{person.email}</span><span>{person.active ? 'Active' : 'Disabled'}</span><PermissionChecks value={person.permissions || []} disabled={busy} restaurant={data?.business?.storeType === 'restaurant'} onChange={permissions => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'PATCH', body:{ permissions } }); flash('Permissions updated'); }, `staff-perm-${person.id}`)}/><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'PATCH', body:{ active:!person.active } }); }, `staff-${person.id}`)}>{person.active ? 'Disable' : 'Enable'}</button></div>)}</div></div>}
      {tab === 'referrals' && !staffMode && <div className="dashboard-panel"><h3>Referral links</h3><p className="muted">Each side becomes eligible for 10% off after the shop confirms a linked order and the customer's phone matches. This is a manual ledger, not an automatic checkout discount: verify identity and apply the discount yourself, then mark it used once. No reward is due for a click or unconfirmed WhatsApp enquiry.</p><form className="inline-form" onSubmit={e => { e.preventDefault(); const phone = e.currentTarget.elements.referrerPhone.value; action(async () => { await api(`/owner/${storeId}/referrals`, { token, method:'POST', body:{ referrerPhone:phone } }); flash('Referral link created'); }, 'referral-create'); e.currentTarget.reset(); }}><label>Referrer phone with country code<input name="referrerPhone" pattern="[1-9][0-9]{7,14}" required placeholder="919876543210"/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'referral-create'}>Create referral link</Busy></button></form><div className="coupon-list">{referrals.map(r => <div key={r.id}><strong>{r.code}</strong><span>{r.status}</span>{r.status === 'pending' && <form className="inline-form" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/confirm`, { token, method:'POST', body:{ orderKind:form.elements.orderKind.value, orderId:Number(form.elements.orderId.value), referredPhone:form.elements.referredPhone.value } }); flash('Referral verified; reward entitlements recorded'); }, `referral-confirm-${r.id}`); }}><label>Order type<select name="orderKind"><option value="retail">Retail</option>{data?.business?.storeType === 'restaurant' && <option value="restaurant">Restaurant</option>}</select></label><label>Confirmed order #<input name="orderId" type="number" min="1" required/></label><label>Friend phone<input name="referredPhone" pattern="[1-9][0-9]{7,14}" required/></label><button className="btn btn-outline btn-small" disabled={busy}>Confirm reward</button></form>}<button type="button" className="btn btn-outline btn-small" onClick={() => navigator.clipboard.writeText(`${storeLink(data.business.slug)}?ref=${r.code}`).then(() => flash('Referral link copied'))}>Copy link</button>{r.status === 'confirmed' && <><span>Referrer: {r.referrerRewardUsed ? 'Used' : '10% pending'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy || r.referrerRewardUsed} onClick={() => action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/redeem`, { token, method:'POST', body:{ side:'referrer' } }); }, `referrer-${r.id}`)}>Mark used</button><span>Friend: {r.referredRewardUsed ? 'Used' : '10% pending'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy || r.referredRewardUsed} onClick={() => action(async () => { await api(`/owner/${storeId}/referrals/${r.id}/redeem`, { token, method:'POST', body:{ side:'referred' } }); }, `referred-${r.id}`)}>Mark used</button></>}</div>)}</div></div>}
      {tab === 'coupons' && <div className="dashboard-panel"><h3>Discount codes</h3><p className="muted">Customers enter a code on the store checkout. Discounts apply to the item subtotal; delivery charges remain unchanged.</p>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { await api(`/owner/${storeId}/coupons`, { token, method:'POST', body: couponForm }); setCouponForm({ code:'', percentOff:10 }); flash('Coupon created'); }, 'coupon-create'); }}>
          <label>Code<input required pattern="[A-Za-z0-9-]{3,24}" maxLength={24} value={couponForm.code} onChange={e => setCouponForm({ ...couponForm, code:e.target.value.toUpperCase() })} placeholder="SAVE10"/></label><label>Percent off<input type="number" required min="1" max="90" value={couponForm.percentOff} onChange={e => setCouponForm({ ...couponForm, percentOff:Number(e.target.value) })}/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'coupon-create'}>Create coupon</Busy></button>
        </form><div className="coupon-list">{coupons.length ? coupons.map(c => <div key={c.id}><strong>{c.code}</strong><span>{c.percentOff}% off</span><span>{c.active ? 'Active' : 'Off'}</span><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/coupons/${c.id}`, { token, method:'PATCH', body:{ active:!c.active } }); }, `coupon-${c.id}`)}>{c.active ? 'Turn off' : 'Turn on'}</button></div>) : <p className="muted">No coupons yet.</p>}</div>
      </div>}
      {tab === 'sales' && <div className="sales-page"><SalesAnalytics report={sales} storeType={data?.business?.storeType}/></div>}
      {tab === 'imports' && staffMode && <>{data?.business?.featureLocks?.products ? <p className="notice">Product import: kindly contact admin.</p> : <MappedImport kind="products" token={token} storeId={storeId}/>} {import.meta.env.VITE_CRM_ENABLED !== 'true' ? <p className="notice">Customer imports are not enabled for this deployment.</p> : data?.business?.featureLocks?.customers ? <p className="notice">Customer import: kindly contact admin.</p> : <MappedImport kind="customers" token={token} storeId={storeId}/>}</>}
      {tab === 'overview' && data && staffMode && <div className="dashboard-panel"><h3>{data.business.name}</h3><p>{data.business.storeType === 'restaurant' ? 'Restaurant order status is available under Table orders.' : 'This staff account has overview access only.'}</p></div>}
      {tab === 'tables' && data?.business?.storeType === 'restaurant' && <TablesView token={token} storeId={storeId} staffMode={staffMode} canBill={!staffMode || !Array.isArray(session.user.permissions) || session.user.permissions.includes('order_status')}/>}
      {tab === 'restaurant' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel"><RestaurantOrders orders={restaurantOrders} busy={busy} actionKey={actionKey} onStatus={updateRestaurantOrder} onRefresh={()=>{setListRefresh(n=>n+1);load(true);}} token={token} storeId={storeId} staffMode={staffMode} renderPay={o=><PayActions kind="restaurant-orders" order={o} token={token} storeId={storeId} staffMode={staffMode}/>}/></div>}
      {tab === 'whatsapp-cloud' && import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' && <WhatsAppIntegration token={token} storeId={storeId} staff={staffMode} />}
      {tab === 'campaigns' && !staffMode && <OfferCampaigns token={token} storeId={storeId}/>}
      {tab === 'broadcast' && !staffMode && <div className="dashboard-panel status-creative-panel"><span className="kicker">READY FOR WHATSAPP STATUS</span><h3>A story-sized shop promo</h3><p className="muted">Download a vertical image with your shop name, live items and link. Post it to your WhatsApp Status yourself. Nothing is posted automatically.</p><button type="button" className="btn btn-green" onClick={() => { try { downloadStatusCreative(data.business, products); } catch (err) { setError(err.message); } }}>Download status image <Download size={17}/></button></div>}
      {tab === 'broadcast' && !staffMode && <div className="dashboard-panel"><h3>Prepare an offer for WhatsApp</h3><p className="muted">Use numbers only for customers who agreed to receive WhatsApp offers. Each link opens a draft for you to review and send. The image goes in as a hosted link, not a WhatsApp photo attachment; link previews depend on WhatsApp.</p><label>Opted-in customer numbers (one per line)<textarea rows={4} value={broadcastRecipients} onChange={e => setBroadcastRecipients(e.target.value)} placeholder="919876543210"/></label><label>Offer text<textarea maxLength={500} rows={4} value={broadcastText} onChange={e => setBroadcastText(e.target.value)} placeholder="This week's fresh arrivals are here..."/></label><label>Offer image link <small>(optional; JPEG, PNG or WebP, max 5 MB)</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadBroadcastImage} disabled={broadcastImageBusy}/></label>{broadcastImageBusy && <p className="muted" role="status">Uploading image...</p>}{broadcastImageUrl && <div className="broadcast-image-preview"><img src={broadcastImageUrl} alt="Offer preview"/><div><strong>Image link ready</strong><small>It will be included in each WhatsApp draft. Preview display depends on WhatsApp.</small><button type="button" className="btn btn-outline btn-small" onClick={() => setBroadcastImageUrl('')}>Remove image link</button></div></div>}<div className="coupon-list">{[...new Set(broadcastRecipients.split(/[\s,;]+/).map(p => p.replace(/\D/g, '')).filter(p => /^[1-9]\d{7,14}$/.test(p)))].map(number => <div key={number}><strong>{number}</strong><a className="btn btn-outline btn-small" href={`https://wa.me/${number}?text=${encodeURIComponent([broadcastText.trim(), broadcastImageUrl, storeLink(data?.business?.slug)].filter(Boolean).join('\n\n'))}`} target="_blank" rel="noreferrer" onClick={e => { if (!broadcastText.trim() || broadcastImageBusy) { e.preventDefault(); setError(broadcastImageBusy ? 'Wait for the image to finish uploading' : 'Write an offer first'); } }}>Open WhatsApp draft</a></div>)}</div></div>}
      {tab === 'notifications' && <OrderAlertsCard token={token} storeId={storeId} slug={data?.business?.slug || currentStore?.slug}/>}
      {tab === 'notifications' && <div className="dashboard-panel">
        <h3>Broadcast to subscribers</h3>
        <p className="muted">{data?.subscribers || 0} visitor{(data?.subscribers || 0) === 1 ? ' has' : 's have'} allowed notifications from this shop. Send an offer or new-arrival alert straight to their phone.</p>
        <form onSubmit={sendBroadcast} className="notify-form">
          <label>Title<input value={notify.title} onChange={e => setNotify({ ...notify, title: e.target.value })} placeholder="Fresh stock arrived!" maxLength={80} required/></label>
          <label>Message<textarea rows="3" value={notify.body} onChange={e => setNotify({ ...notify, body: e.target.value })} placeholder="Basmati rice back in stock. Order now on WhatsApp!" maxLength={200} required/></label>
          <label>Open this product (optional)<select value={notify.productId} disabled={Boolean(notify.link.trim())} onChange={e => setNotify({ ...notify, productId: e.target.value })}><option value="">Shop home page</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Or paste a link (optional)<input type="url" inputMode="url" value={notify.link} onChange={e => setNotify({ ...notify, link: e.target.value })} placeholder={`https://digitalshop.website/store/${data?.business?.slug || 'your-shop'}/product/12`} maxLength={300}/><small className="muted">Tapping the notification opens this page. Links must be pages of this shop.</small></label>
          <label>Image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={notifyImgBusy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image under 5 MB'); return; } setNotifyImgBusy(true); setError(''); try { const body = new FormData(); body.append('image', file); const r = await api(`/owner/${storeId}/upload`, { method: 'POST', token, body }); if (!/^https:\/\/ik\.imagekit\.io\//.test(r.imageUrl || '')) throw Error('Image hosting is unavailable. Try again later.'); setNotifyImg(r.imageUrl); } catch (err) { setError(err.message); } finally { setNotifyImgBusy(false); } }}/><small className="muted">If you skip it, your default notification image, cover or logo is used.</small></label>
          {notifyImgBusy && <small><span className="button-spinner"/>Uploading image...</small>}
          {notifyImg && <div className="upload-preview"><img src={imageSrc(notifyImg)} alt="Notification image preview"/><span>Image ready</span><button type="button" className="btn btn-outline btn-small" onClick={() => setNotifyImg('')}>Remove</button></div>}
          {notifyResult && <p className="notice success">{notifyResult}</p>}
          <button className="btn btn-green" disabled={busy || !(data?.subscribers > 0)}><Busy active={busy}><Bell size={16}/> {busy ? 'Sending...' : 'Send notification'}</Busy></button>
          {!(data?.subscribers > 0) && <p className="muted">Visitors can subscribe from the prompt on your storefront.</p>}
        </form>
      </div>}
      {tab === 'settings' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel"><h3>Table QR codes</h3><p className="muted">Print one for each table. Scanning opens the menu with that table number selected.</p><div className="table-qr-grid">{Array.from({ length: data.business.tableCount }, (_, i) => <div key={i + 1} className="table-qr-card"><strong>Table {i + 1}</strong><img src={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} alt={`QR for table ${i + 1}`}/><a href={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} download={`table-${i + 1}.svg`}>Download QR</a></div>)}</div></div>}
      {pagedTabs.includes(tab) && <div ref={list.sentinel} className="pagination-sentinel" aria-live="polite"><span>{list.rows.length} of {list.total} matching {tab}</span>{list.loading ? <span>Loading...</span> : list.error ? <><span role="alert">{list.error}</span><button className="btn btn-outline btn-small" onClick={list.more}>Retry</button></> : list.hasMore && <button className="btn btn-outline btn-small" onClick={list.more}>Load 10 more</button>}</div>}

      {tab === 'settings' && data?.business && <Settings business={data.business} token={token} storeId={storeId} onSaved={() => { load(); flash('Shop updated'); }} onRemoved={() => { setData(null); reloadStoreLists().then(() => flash('Store removed. You have 30 days to restore it.')).catch(e => setError(e.message)); }} onError={setError}/>}
      {tab === 'settings' && data?.business && !staffMode && <section className="settings-connections"><div className="settings-connections-head"><h3>Messages & connections</h3><p className="muted">Your own accounts, your own billing. Nothing is enabled automatically.</p></div><NotificationSettings token={token} storeId={storeId} /><PaymentSettings token={token} storeId={storeId} /></section>}
      {(tab === 'overview' || !storeId) && !staffMode && <div className="overview-management"><div className="section-heading"><div><span className="kicker">SHOP MANAGEMENT</span><h2>Manage your stores</h2></div></div>
    {deletedStores.length > 0 && <div className="dashboard-panel removed-stores"><h3>Recently removed stores</h3>{deletedStores.map(store => <div className="removed-store" key={store.id}><div><strong>{store.name}</strong><small>Restore by {new Date(store.restoreUntil).toLocaleDateString('en-IN')} · {store.slug}</small></div><label>Store link<input value={restoreSlug[store.id] || ''} onChange={e => setRestoreSlug(prev => ({ ...prev, [store.id]: e.target.value }))} placeholder={store.slug}/></label><button className="btn btn-outline btn-small" disabled={busy || restoreSlug[store.id] !== store.slug || new Date() >= new Date(store.restoreUntil)} onClick={() => action(async () => { await api(`/owner/deleted-stores/${store.id}/restore`, { method: 'POST', token, body: { slug: restoreSlug[store.id] } }); await reloadStoreLists(); flash('Store restored'); })}>Restore store</button></div>)}</div>}
    <div className="dashboard-panel store-create"><h3>Add a store</h3><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { const { store } = await api('/owner/stores', { method: 'POST', token, body: newStore }); const result = await api('/owner/stores', { token }); setStores(result.stores); setStoreId(store.id); setNewStore({ name: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 }); flash('Store created'); }); }}><input placeholder="Store name" aria-label="Store name" required value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })}/><input placeholder="Custom slug (optional)" aria-label="Store slug" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })}/><input placeholder="WhatsApp number (country code)" aria-label="WhatsApp number" required value={newStore.whatsapp} onChange={e => setNewStore({ ...newStore, whatsapp: e.target.value })}/><label>Store type<select value={newStore.storeType} onChange={e => setNewStore({ ...newStore, storeType: e.target.value, tableCount: e.target.value === 'restaurant' ? 1 : 0 })}><option value="retail">Retail / kirana</option><option value="restaurant">Restaurant</option><option value="services">Services</option></select></label>{newStore.storeType === 'restaurant' && <label>Number of tables<input type="number" min="1" max="100" required value={newStore.tableCount} onChange={e => setNewStore({ ...newStore, tableCount: Number(e.target.value) })}/></label>}<button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? 'Creating...' : 'Create store'}</Busy></button></form></div>
      </div>}
      </>}
    </>}
  </div>
  {editing && <ProductModal restaurant={data?.business?.storeType === 'restaurant'} categories={categories} product={editing} busy={busy} onClose={() => setEditing(null)} onSave={saveProduct}/>}
  </AdminShell>;
}
