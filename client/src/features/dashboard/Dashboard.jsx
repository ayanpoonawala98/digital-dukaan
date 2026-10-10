import { ownerMessages } from '../../shared/lib/owner-messages.js';
import { ot, registerOwnerMessages, translateOwnerPlan, ownerLanguageSnapshot } from '../../shared/lib/owner-i18n.js';
import { OwnerLanguage, useOwnerLanguage } from '../../shared/components/OwnerLanguage.jsx';
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
import { TabBoundary } from '../../shared/components/TabBoundary.jsx';
import ReviewsAdmin from '../reviews/ReviewsAdmin.jsx';
import { Moon, Sun, ArrowRight, ArrowUpRight, Bell, ChartNoAxesCombined, Copy, Download, FileSpreadsheet, LayoutDashboard, LogOut, MessageCircle, Package, Plus, QrCode, Send, Settings as SettingsIcon, Star, Tags, Trash2, Upload, X, ShoppingBag, Lock } from 'lucide-react';
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
import { groupNavItems, statusLabel, verticalWords } from '../../shared/lib/owner-ui.js';
import EnquiriesPanel from './EnquiriesPanel.jsx';
import { ThemeToggle, useTheme } from '../../app/theme.jsx';
import { STORE_THEMES, storeThemeStyle, normalizeHexColor } from '../storefront/store-theme.js';
import { isTabLocked } from '../../shared/lib/feature-locks.js';


registerOwnerMessages(ownerMessages);

// Read-only plan, trial and payment status for the owner. Admin changes it in Clients; this only shows it.
function PlanCard({ token }) {
  const [plan, setPlan] = useState(null);
  useEffect(() => { let live = true; api('/owner/plan', { token, feedback: false }).then(p => { if (live) setPlan(p); }).catch(() => {}); return () => { live = false; }; }, [token]);
  if (!plan) return null;
  const quiet = plan.tone === 'info' && plan.status !== 'trial';
  return <div className={`notice plan-card ${plan.tone === 'info' ? '' : plan.tone}`} role={plan.tone === 'error' ? 'alert' : 'status'}><div><strong>{plan.plan} {ot("plan")}{plan.monthlyFee ? ot(" · {v0}/month", {v0: inr(plan.monthlyFee)}) : ''}.</strong> {translateOwnerPlan(ownerLanguageSnapshot(), plan.text)}{!quiet && <small className="muted"> {ot("Questions about billing? Contact Digital Shop.")}</small>}</div></div>;
}

// Phone navigation: a thumb-height bottom bar with one button per task group; a group opens a sheet of its screens.
function MobileNav({ items, tab, setTab, superMode, current, onLogout }) {
  const [open, setOpen] = useState(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const { home, groups } = groupNavItems(items);
  const group = groups.find(g => g.id === open);
  const activeGroup = groups.find(g => g.keys.includes(tab))?.id;
  useEffect(() => { if (!open) return undefined; const k = e => { if (e.key === 'Escape') setOpen(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  const go = key => { setOpen(null); setTab(key); };
  return <>
    {group && <div className="mnav-layer" onClick={() => setOpen(null)}><div className="mnav-sheet" role="dialog" aria-label={group.label} onClick={e => e.stopPropagation()}>
      <div className="mnav-sheet-head"><strong>{group.label}</strong><button type="button" className="mnav-close" aria-label={ot("Close menu")} onClick={() => setOpen(null)}>{ot("Close")}</button></div>
      <div className="mnav-grid">{group.items.map(([key, label, Icon]) => { const locked = !superMode && current && isTabLocked(current, key); return <button key={key} type="button" className={`${tab === key ? 'selected' : ''}${locked ? ' nav-locked' : ''}`} onClick={() => go(key)}><Icon size={22}/><span>{label}</span>{locked && <Lock size={12} aria-label={ot("Locked by platform admin")}/>}</button>; })}</div>
      {group.id === 'setup' || (!groups.some(g => g.id === 'setup') && group.id === groups.at(-1).id) ? <div className="mnav-account"><button type="button" className="mnav-theme" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>} {theme === 'dark' ? ot("Light mode") : ot("Dark mode")}</button>{!superMode && current && <a href={storeLink(current.slug)} target="_blank" rel="noreferrer"><ArrowUpRight size={18}/> {ot("View storefront")}</a>}<button type="button" onClick={onLogout}><LogOut size={18}/> {ot("Log out")}</button></div> : null}
    </div></div>}
    <nav className="mnav" aria-label={ot("Main navigation")}>
      {home && <button type="button" className={tab === home[0] ? 'selected' : ''} aria-current={tab === home[0] ? 'page' : undefined} onClick={() => go(home[0])}>{React.createElement(home[2], { size: 22 })}<span>{ot("Home")}</span></button>}
      {groups.map(g => { const Icon = g.items[0][2]; return <button key={g.id} type="button" className={activeGroup === g.id ? 'selected' : ''} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}><Icon size={22}/><span>{g.label}</span></button>; })}
    </nav>
  </>;
}
export function AdminShell({ children, superMode = false, tab, setTab, stores = [], storeId, setStoreId }) {
  const { session, save } = useAuth();
  const nav = useNavigate();
  const current = stores.find(s => String(s.id) === String(storeId));
  const staffMode = session.user.role === 'staff';

  const { theme } = useTheme();
  const items = superMode
    ? [['overview', ot("Overview"), LayoutDashboard], ['sales', ot("Sales & commission"), ChartNoAxesCombined], ['clients', ot("Clients"), UsersIcon], ['businesses', ot("Businesses"), StoreIcon], ['users', ot("Users"), UsersIcon], ['requests', ot("Shop requests"), MessageCircle]]
    : staffMode ? [['overview', ot("Overview"), LayoutDashboard], ...(session.user.permissions?.includes('products') ? [['products', ot("Products"), Package]] : []), ...(session.user.permissions?.includes('leads') && current?.storeType !== 'restaurant' ? [['leads', verticalWords(current?.storeType).orders, MessageCircle]] : []), ...(session.user.permissions?.includes('coupons') ? [['coupons', ot("Coupons"), Tags]] : []), ...(session.user.permissions?.includes('customers') ? [['customers', ot("Customers"), UsersIcon]] : []), ...(session.user.permissions?.includes('import') ? [['imports', ot("Bulk import"), Upload]] : []), ...(current?.storeType === 'restaurant' && session.user.permissions?.includes('orders_view') ? [['tables', ot("Tables"), StoreIcon], ['restaurant', ot("Kitchen"), ShoppingBag]] : []), ...(import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' && session.user.permissions?.includes('whatsapp') ? [['whatsapp-cloud', ot("WhatsApp inbox"), MessageCircle]] : [])]
    : [['overview', ot("Overview"), LayoutDashboard], ['products', ot("Products"), Package], ['categories', ot("Categories"), Tags], ...(current?.storeType === 'restaurant' ? [] : [['leads', verticalWords(current?.storeType).orders, MessageCircle]]), ['customers', ot("Customers"), UsersIcon], ['reviews', ot("Reviews"), Star], ['sales', ot("Sales"), ChartNoAxesCombined], ['coupons', ot("Coupons"), Tags], ['staff', ot("Staff"), Package], ...(current?.storeType === 'restaurant' ? [['tables', ot("Tables"), StoreIcon], ['restaurant', ot("Kitchen"), ShoppingBag]] : []), ['notifications', ot("Notifications"), Bell], ['campaigns',ot("Email & SMS offers"),MessageCircle], ['broadcast', ot("WhatsApp broadcast"), MessageCircle], ...(import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' ? [['whatsapp-cloud', ot("WhatsApp integration"), MessageCircle]] : []), ['settings', ot("Shop settings"), SettingsIcon]];
  return <div className="admin-layout" style={!superMode && current ? storeThemeStyle(current.accentColor, theme === 'dark') : undefined}>
    <aside className="sidebar">
      <Logo light/>
      <div className="sidebar-label">{ot("WORKSPACE")}</div>
      <nav>{items.map(([key, label, Icon]) => { const locked = !superMode && current && isTabLocked(current, key); return <button key={key} className={`${tab === key ? 'selected' : ''}${locked ? ' nav-locked' : ''}`} onClick={() => setTab(key)}><Icon size={18}/>{label}{locked && <Lock size={13} className="nav-lock-icon" aria-label={ot("Locked by platform admin")}/>}</button>; })}</nav>
      <div className="sidebar-bottom">
        <ThemeToggle className="sidebar-theme" showLabel/>
        {!superMode && current && <a href={storeLink(current.slug)} target="_blank" rel="noreferrer"><ArrowUpRight size={17}/> {ot("View storefront")}</a>}
        <button onClick={() => { save(null); nav('/'); }}><LogOut size={17}/> {ot("Log out")}</button>
      </div>
    </aside>
    <MobileNav items={items} tab={tab} setTab={setTab} superMode={superMode} current={current} onLogout={() => { save(null); nav('/'); }}/>
    <div className="admin-main">
      <div className="admin-top">
        <span>{superMode ? ot("SUPERADMIN / DIGITAL SHOP") : <select className="store-switcher" value={storeId || ''} onChange={e => setStoreId(e.target.value)}><option value="" disabled>{ot("Select store")}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</span>
        {!superMode && <OwnerLanguage/>}
        <div className="admin-profile"><span>{session.user.name?.[0]?.toUpperCase()}</span><div><strong>{session.user.name}</strong><small>{superMode ? ot("Superadmin") : staffMode ? ot("Shop staff") : ot("Shop owner")}</small></div></div>
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
    if (draft.imageUrls.length + files.length > 5) { setError(ot("Maximum 5 photos per product")); return; }
    if (files.some(f => !['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024)) { setError(ot("Choose JPEG, PNG or WebP photos under 5 MB each")); return; }
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
    if (!/^https?:\/\//i.test(url) || draft.imageUrls.length >= 5 || draft.imageUrls.includes(url)) { setError(ot("Use a unique http(s) URL; maximum 5 photos")); return; }
    setDraft(d => { const imageUrls = [...d.imageUrls, url]; return { ...d, imageUrls, imageUrl:imageUrls[0] || '' }; }); setImageInput(''); setError('');
  };
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal anim-pop"><button className="modal-close" onClick={onClose} aria-label={ot("Close")}><X/></button>
      <span className="kicker">{ot("YOUR CATALOG")}</span>
      <h2>{product.id ? ot("Edit product") : ot("Add a product")}</h2>
      <form onSubmit={e => { e.preventDefault(); onSave(draft); }}>
        <Notice error={error}/>
        <label>{ot("Product name")}<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required/></label>
        <div className="form-row">
          <label>{ot("Price (₹)")}<input type="number" min="0" step="0.01" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} required/></label>
          <label>{ot("Category")}<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} required><option value="">{ot("Select a category")}</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>{ot("Listing type")}<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}><option value="product">{ot("Product (physical item)")}</option><option value="service">{ot("Service (bookable)")}</option></select></label>
          {draft.kind === 'service'
            ? <label>{ot("Duration")} <small>{ot("(e.g. 45 mins)")}</small><input value={draft.duration} onChange={e => setDraft({ ...draft, duration: e.target.value })} placeholder={ot("45 mins")}/></label>
            : <label>{ot("Stock")} <small>{ot("(blank = unlimited)")}</small><input type="number" min="0" step="1" value={draft.stock} onChange={e => setDraft({ ...draft, stock: e.target.value })} placeholder={ot("e.g. 24")}/></label>}
        </div>
        <label className="check-label"><input type="checkbox" checked={draft.featured} onChange={e => setDraft({ ...draft, featured: e.target.checked })}/> <Star size={15}/> {draft.kind === 'service' ? ot("Featured service") : ot("Featured product")}</label>
        <label>{ot("Description")}<textarea rows="3" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder={ot("Tell people what makes it special")}/></label>
        <label>{ot("Product photos")} <small>{ot("(up to 5, JPEG / PNG / WebP, 5 MB each)")}</small><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading || draft.imageUrls.length >= 5}/></label>
        {uploading && <p className="muted" role="status">{ot("Uploading photos...")}</p>}
        <div className="form-row"><label>{ot("Or add an image URL")}<input type="url" value={imageInput} onChange={e => setImageInput(e.target.value)} placeholder="https://..."/></label><button type="button" className="btn btn-outline btn-small" onClick={addUrl} disabled={!imageInput.trim() || uploading || draft.imageUrls.length >= 5}>{ot("Add URL")}</button></div>
        {draft.imageUrls.length > 0 && <div className="photo-editor" aria-label={ot("Product photos")}>{draft.imageUrls.map((url, i) => <div className="photo-editor-item" key={`${url}-${i}`}><img src={storeImage(imageSrc(url),480)} alt={ot("Product photo {v0}", {v0: i + 1})}/><span>{i === 0 ? ot("Cover photo") : ot("Photo {v0}", {v0: i + 1})}</span><button type="button" className="icon-btn" onClick={() => removePhoto(i)} aria-label={ot("Remove photo {v0}", {v0: i + 1})}><X size={17}/></button></div>)}</div>}
        {restaurant && <MenuOptionsEditor draft={draft} setDraft={setDraft}/>}
        {draft.kind !== 'service' || true ? <CustomFieldsEditor value={draft.customFields} onChange={customFields => setDraft(d => ({ ...d, customFields }))}/> : null}
        <label className="check-label"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/> {ot("Visible on storefront")}</label>
        <button className="btn btn-green full" disabled={busy || uploading || !categories.length}><Busy active={busy || uploading}>{busy ? ot("Saving...") : ot("Save product")}</Busy> <ArrowRight size={18}/></button>
        {!categories.length && <p className="muted">{ot("Add a category before adding products.")}</p>}
      </form>
    </div>
  </div>;
}

import { leadStatusOptions } from '../restaurant/order-flows.js';
import { KotButton } from '../restaurant/kot-print.jsx';
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
      else if (openWhatsApp && !phone) setError(ot("Add the customer’s WhatsApp number to send an update"));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const items = Array.isArray(lead.items) && lead.items.length ? lead.items : null;
  return <tr>
    <td data-label={ot('Order')}><small>{ot("Order #")}{lead.orderNumber ?? lead.id}</small><strong>{String(lead.productName || '').replace(/^1 items$/, '1 item')}</strong>{items && <small className="lead-items">{items.map(i => `${i.qty} × ${i.name}${i.answers?.length ? ` (${i.answers.map(a => `${a.label}: ${a.value}`).join(', ')})` : ''}`).join(', ')}</small>}</td>
    <td data-label={ot('Total')}>{inr(lead.price)}</td>
    <td data-label={ot('When')}>{new Date(lead.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
    <td data-label={ot('Customer no.')}><input className="phone-input" value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => phone !== (lead.customerPhone || '') && save(status, false)} placeholder={ot("Customer no.")} aria-label={ot("Customer WhatsApp number")}/></td>
    <td data-label={ot('Status')}><select className={`status-select s-${status}`} value={status} disabled={busy} onChange={e => save(e.target.value, false)}>{LEAD_STATUSES.map(([v, l]) => <option key={v} value={v}>{ot(l)}</option>)}</select></td>
    <td className="row-actions" data-label={ot('Actions')}>
      <button className="table-button" disabled={busy} onClick={() => save(status, true)} title={ot("Send status update on WhatsApp")}><Busy active={busy}><Send size={14}/> {busy ? ot("Updating...") : ot("Update")}</Busy></button>
      <button className="table-button" disabled={pdfBusy} onClick={async () => { setPdfBusy(true); try { await download(`/owner/${storeId}/leads/${lead.id}/invoice`, `estimate-${lead.id}.pdf`, token); } catch (e) { setError(e.message); } finally { setPdfBusy(false); } }} title={ot("Download estimate PDF")}><Busy active={pdfBusy}><Download size={14}/> {pdfBusy ? ot("Loading...") : ot("PDF")}</Busy></button>
      <KotButton lead token={token} storeId={storeId} order={lead}/>
      <PayActions kind="leads" order={lead} token={token} storeId={storeId}/>
      {error && <small className="error-text">{ot(error)}</small>}
    </td>
  </tr>;
}

const FESTIVAL_PRESETS = [
  { name:'Diwali glow', color:'#94631d', banner:'Diwali ki khushiyan, aapki dukaan par ✨', headline:'Celebrate Diwali with us', message:'Explore festive picks and find something for everyone.' },
  { name:'Eid moonlight', color:'#225caa', banner:'Eid Mubarak! Discover our festive picks 🌙', headline:'Wishing you a joyful Eid', message:'Take a look at our handpicked festive collection.' }
];

const STAFF_PERMS = [['orders_view', "Kitchen: see all orders and tables", true], ['order_status', "Kitchen: change status, print KOT, sold-out, new order, add items", true], ['billing', "Billing: bill tables and take payment (discount up to 10%)", true], ['whatsapp', "WhatsApp inbox and replies"], ['import', "Bulk import"], ['products', "Add and edit products, categories and sold-out (no delete)"], ['leads', "See enquiries/orders and update status"], ['coupons', "Create and edit discount coupons"], ['customers', "Customers: see, add and edit customers, send a notification to one"]];
const DEFAULT_STAFF_PERMS = ['orders_view', 'order_status', 'whatsapp', 'import'];
const KITCHEN_PERMS = ['orders_view', 'order_status'];
const FULL_PERMS = ['orders_view', 'order_status', 'billing', 'whatsapp', 'import', 'products', 'leads', 'coupons', 'customers'];
function PermissionChecks({ value, onChange, disabled, restaurant }) {
  const toggle = key => onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  return <fieldset className="perm-checks" disabled={disabled}><legend>{ot("Can do")}</legend><div className="perm-presets">{restaurant && <button type="button" className="btn btn-outline" onClick={() => onChange([...KITCHEN_PERMS])}>{ot("Kitchen staff")}</button>}<button type="button" className="btn btn-outline" onClick={() => onChange(FULL_PERMS.filter(k => restaurant || k !== 'billing'))}>{ot("Full access")}</button></div>{STAFF_PERMS.filter(([, , rest]) => !rest || restaurant).map(([key, label]) => <label key={key} className="perm-check"><input type="checkbox" checked={value.includes(key)} onChange={() => toggle(key)}/> {ot(label)}</label>)}</fieldset>;
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
    if (d.whatsappUrl) window.open(d.whatsappUrl, '_blank'); else setMsg((await copy(d.url)) ? ot("Payment link copied. Add the customer number to send it on WhatsApp.") : d.url);
  });
  const check = () => run('check', async () => { const d = await api(`${base}/payment-link/refresh`, { method: 'POST', token, body: {}, feedback: false }); setO(d.order); setMsg(d.status === 'paid' ? '' : ot("Not paid yet ({v0}).", {v0: d.status})); });
  const bill = () => run('bill', async () => { const d = await api(`${base}/bill-link`, { token, feedback: false }); if (d.whatsappUrl) window.open(d.whatsappUrl, '_blank'); else { window.open(d.url, '_blank'); } });
  const paid = o.paymentStatus === 'paid', cancelled = o.status === 'cancelled';
  return <div className="pay-actions">
    {paid ? <span className="pay-badge paid">{ot("Paid online")}</span> : o.paymentStatus === 'created' ? <span className="pay-badge pending">{ot("Payment link sent")}</span> : o.paymentStatus === 'expired' ? <span className="pay-badge expired">{ot("Link expired")}</span> : null}
    {!PAYMENTS_LOCKED && !paid && !cancelled && <button type="button" className="table-button" disabled={!!busy} onClick={payLink} title={ot("Create a Razorpay payment link (UPI, cards, netbanking) and send it on WhatsApp")}><Busy active={busy === 'pay'}>{o.paymentStatus === 'created' ? ot("Resend pay link") : ot("Pay link")}</Busy></button>}
    {!PAYMENTS_LOCKED && o.paymentLinkId && !paid && <button type="button" className="table-button" disabled={!!busy} onClick={check}><Busy active={busy === 'check'}>{ot("Check payment")}</Busy></button>}
    {!cancelled && <button type="button" className="table-button" disabled={!!busy} onClick={bill} title={ot("Send the customer a bill link on WhatsApp")}><Busy active={busy === 'bill'}>{ot("Send bill")}</Busy></button>}
    {msg && <small className="error-text">{msg}</small>}
  </div>;
}

const PAYMENTS_LOCKED = true; // Razorpay payment links are locked (coming soon)
function PaymentSettings({ token, storeId }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null), [f, setF] = useState({ keyId: '', keySecret: '' }), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  useEffect(() => { api(`/owner/${storeId}/payments`, { token, feedback: false }).then(d => { setView(d.razorpay); setF({ keyId: '', keySecret: '' }); }).catch(() => setView(false)); }, [storeId, token]);
  if (view === false) return null;
  if (!view) return <div className="dashboard-panel settings-panel"><h3>{ot("Online payments")}</h3><BrandLoader compact/></div>;
  const save = async (body, ok) => { setBusy(true); setMsg(null); try { const d = await api(`/owner/${storeId}/payments`, { token, method: 'PUT', body, feedback: false }); setView(d.razorpay); setF({ keyId: '', keySecret: '' }); setMsg({ ok }); } catch (e) { setMsg({ error: e.message }); } finally { setBusy(false); } };
  return <div className="dashboard-panel settings-panel notify-settings accordion-panel">
    <button type="button" className="accordion-head" aria-expanded={open} onClick={() => setOpen(o => !o)}><h3>{ot("Online payments (Razorpay)")}</h3><span className="accordion-chev" aria-hidden="true">{open ? '\u25B4' : '\u25BE'}</span></button>
    {open && <>
    <p className="muted">{ot("Let customers pay an order by UPI, card or netbanking through a payment link. The money goes to your own Razorpay account. Digital Shop never touches it.")}</p>
    <div className="notify-row"><strong>{ot("Razorpay")}</strong><span className={`status-pill ${view.configured && !PAYMENTS_LOCKED ? 'on' : 'off'}`}>{PAYMENTS_LOCKED ? ot("🔒 Coming soon") : view.configured ? ot("Connected ({v0}) {v1}", {v0: view.mode || 'keys saved', v1: view.keyId}) : ot("Not connected")}</span></div>
    {view.mode === 'test' && view.configured && <p className="notice warn">{ot("These are TEST keys. Payments will not move real money. Use live keys when you are ready.")}</p>}
    <form onSubmit={e => { e.preventDefault(); if (PAYMENTS_LOCKED) return; save({ keyId: f.keyId || undefined, keySecret: f.keySecret || undefined }, 'Razorpay connected'); }}>
      <div className="notify-two"><label>{ot("Key ID")}<input disabled={PAYMENTS_LOCKED} value={f.keyId} onChange={e => setF({ ...f, keyId: e.target.value })} placeholder={view.configured ? ot("{v0} saved", {v0: view.keyId}) : 'rzp_live_xxxxxxxxxx'} autoComplete="off"/></label>
        <label>{ot("Key Secret")}<input disabled={PAYMENTS_LOCKED} type="password" autoComplete="new-password" value={f.keySecret} onChange={e => setF({ ...f, keySecret: e.target.value })} placeholder={view.keySecretSaved ? ot("•••••••• saved. Type to replace") : ot("Key Secret")}/></label></div>
      {msg?.ok && <p className="notice success">{ot(msg.ok)}</p>}{msg?.error && <p className="notice error">{ot(msg.error)}</p>}
      <div className="notify-actions"><button className="btn btn-green" disabled={PAYMENTS_LOCKED || busy || (!f.keyId && !f.keySecret)}><Busy active={busy}>{ot("Save and verify")}</Busy></button>
        {view.configured && <button type="button" className="btn btn-outline" disabled={PAYMENTS_LOCKED || busy} onClick={() => save({ clear: true }, 'Razorpay disconnected')}>{ot("Disconnect")}</button>}</div>
    </form>
    <p className="muted">{ot("Get the keys in your Razorpay Dashboard under Account & Settings, then API keys. Razorpay charges its own fee per payment. Keys are encrypted and never shown again. After a customer pays, press Check payment on the order to confirm it.")}</p>
    </>}
  </div>;
}

function NotificationSettings({ token, storeId }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [testing, setTesting] = useState(''), [msg, setMsg] = useState(null), [keys, setKeys] = useState(null), [kf, setKf] = useState({}), [kBusy, setKBusy] = useState(false);
  const applyKeys = k => { setKeys(k); setKf({ emailMode: k.emailMode, smsMode: k.smsMode, resend: { from: k.resend.from }, smtp: { host: k.smtp.host, port: k.smtp.port || 587, secure: k.smtp.secure, user: k.smtp.user, from: k.smtp.from }, emailHttp: { url: k.emailHttp.url, method: k.emailHttp.method || 'POST', contentType: k.emailHttp.contentType || 'json', headers: k.emailHttp.headers, body: k.emailHttp.body }, fast2sms: { route: k.fast2sms.route || 'quick', senderId: k.fast2sms.senderId, templateId: k.fast2sms.templateId }, smsHttp: { url: k.smsHttp.url, method: k.smsHttp.method || 'POST', contentType: k.smsHttp.contentType || 'json', headers: k.smsHttp.headers, body: k.smsHttp.body } }); };
  useEffect(() => { api(`/owner/${storeId}/notifications`, { token, feedback: false }).then(d => { setState(d.providers); setForm(d.settings); applyKeys(d.keys); }).catch(() => setState(false)); }, [storeId, token]);
  if (state === false) return null;
  if (!form) return <div className="dashboard-panel settings-panel"><h3>{ot("SMS & email - your business")}</h3><BrandLoader compact/></div>;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { const d = await api(`/owner/${storeId}/notifications`, { token, method: 'PUT', body: form, successMessage: 'Alert settings saved' }); setForm(d.settings); } catch (err) { setMsg({ error: err.message }); } finally { setBusy(false); }
  };
  const test = async channel => {
    setTesting(channel); setMsg(null);
    try { if(!window.confirm(channel === 'sms' ? ot("Send a real test SMS to your saved alert number? Your business SMS wallet will be charged.") : ot("Send a test email to your saved alert address? It uses your business email quota."))) return; await api(`/owner/${storeId}/notifications/test`, { token, method: 'POST', body: { channel }, feedback: false }); setMsg({ ok: ot('Test {type} sent. Check your {place}.', {type: ot(channel === 'email' ? 'Email' : 'SMS'), place: ot(channel === 'email' ? 'inbox' : 'phone')}) }); } catch (err) { setMsg({ error: err.message }); } finally { setTesting(''); }
  };
  const sampleReport = async () => { setTesting('report'); setMsg(null); try { if(!window.confirm(ot("Send a sample report using your enabled owner channels? Email quota and any SMS charges belong to your business provider."))) return; const d = await api(`/owner/${storeId}/notifications/report`, { token, method: 'POST', body: {}, feedback: false }); setMsg({ ok: ot('Sample report sent by {channels}.', {channels:d.channels.map(c=>ot(c)).join(ot('and'))}) }); } catch (err) { setMsg({ error: err.message }); } finally { setTesting(''); } };
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
  const secretIn = (g, f, label, saved, hint) => <label>{label}<input type="password" autoComplete="new-password" value={kf[`${g}_secret`]?.[f] || ''} onChange={e => setKf(x => ({ ...x, [`${g}_secret`]: { ...x[`${g}_secret`], [f]: e.target.value } }))} placeholder={saved ? ot("{v0} saved. Type to replace", {v0: hint || '••••••••'}) : ot("Paste it here")}/></label>;
  const textIn = (g, f, label, ph) => <label>{label}<input value={kf[g]?.[f] ?? ''} onChange={e => setK(g, f, e.target.value)} placeholder={ph}/></label>;
  const httpFields = (g, kview, isSms) => <>
    <div className="notify-two">{textIn(g, 'url', ot("API URL (https)"), isSms ? 'https://api.yourgateway.com/send?to={{to}}' : 'https://api.yourmail.com/v1/send')}
      <label>{ot("Method")}<select value={kf[g]?.method || 'POST'} onChange={e => setK(g, 'method', e.target.value)}><option>{ot("POST")}</option><option>{ot("GET")}</option></select></label></div>
    <div className="notify-two"><label>{ot("Body format")}<select value={kf[g]?.contentType || 'json'} onChange={e => setK(g, 'contentType', e.target.value)}><option value="json">{ot("JSON")}</option><option value="form">{ot("Form (key=value)")}</option><option value="text">{ot("Plain text")}</option></select></label>
      {secretIn(g, 'key', ot("API key or token"), kview.keySaved, kview.keyHint)}</div>
    <label>{ot("Headers")} <small>{ot("(one per line, e.g. Authorization: Bearer")} {'{{key}}'})</small><textarea rows={2} value={kf[g]?.headers || ''} onChange={e => setK(g, 'headers', e.target.value)}/></label>
    <label>{ot("Body template")} <small>{ot("(for POST)")}</small><textarea rows={3} value={kf[g]?.body || ''} onChange={e => setK(g, 'body', e.target.value)} placeholder={isSms ? '{"to":"{{to_intl}}","message":"{{message}}"}' : '{"to":"{{to}}","subject":"{{subject}}","text":"{{message}}"}'}/></label>
    <p className="muted">{ot("Placeholders:")} {isSms ? ot("{{to}} (10-digit), {{to_intl}} (with country code), ") : '{{to}}, {{subject}}, '}{ot("{{message}}, {{store}}, {{key}}, {{key_b64}} (key as base64, handy for Basic auth)")}{ot(". Put secrets only in the key field and use")} {'{{key}}'}.</p>
  </>;
  const badge = p => <span className={`status-pill ${p.configured ? 'on' : 'off'}`}>{p.configured ? (p.source === 'own' ? ot("Ready: your {v0}", {v0: p.label}) : ot("Needs your own provider")) : ot("Not connected - alerts cannot send")}</span>;
  return <form onSubmit={save} className="dashboard-panel settings-panel notify-settings accordion-panel">
    <button type="button" className="accordion-head" aria-expanded={open} onClick={() => setOpen(o => !o)}><h3>{ot("SMS & email - your business")}</h3><span className="accordion-chev" aria-hidden="true">{open ? '\u25B4' : '\u25BE'}</span></button>
    {open && <>
    <p className="muted">{ot("Connect your business account, then choose your alerts. All messages use this store's own provider and sender. Charges and quotas belong to that provider account, not Digital Shop. No platform account is used as a fallback. Saving a provider does not turn alerts on.")}</p>
    <div className="notify-row"><strong>{ot("Email")}</strong>{badge(state.email)}</div>
    <details className="notify-provider"><summary>{state.email.configured && state.email.source === 'own' ? ot("Change my email provider") : ot("Set up my business email")}</summary>
      <label>{ot("Provider")}<select value={kf.emailMode || ''} onChange={e => setKf(x => ({ ...x, emailMode: e.target.value }))}><option value="">{ot("Not connected (no sending)")}</option><option value="resend">{ot("Resend (easy, free tier)")}</option><option value="smtp">{ot("SMTP (advanced; standard ports blocked on current hosting)")}</option><option value="http">{ot("Custom email API (any HTTP service)")}</option></select></label>
      {kf.emailMode === 'resend' && <><ol className="notify-steps"><li>{ot("Create a Resend account for your business.")}</li><li>{ot("Add and verify a domain you own in Resend (DNS records).")}</li><li>{ot("Create an API key, add it below, and use an address on your verified domain as Send from.")}</li><li>{ot("Save provider, set your alert email, then switch on alerts and Save alerts.")}</li></ol><p className="muted">{ot("Resend free tier: 3,000 emails/month, 100/day. Check current limits in your own account.")} <a href="https://resend.com/pricing" target="_blank" rel="noreferrer">{ot("Open Resend")}</a></p>{secretIn('resend', 'apiKey', ot("Resend API key"), keys?.resend.apiKeySaved, keys?.resend.apiKeyHint)}{textIn('resend', 'from', ot("Send from"), ot("Shop <alerts@yourdomain.com>"))}</>}
      {kf.emailMode === 'smtp' && <><p className="notice">{ot("Current free hosting blocks SMTP ports 25, 465 and 587. Use Resend or a custom HTTPS email API instead. Port 2525 is provider-dependent and not verified here.")}</p><div className="notify-two">{textIn('smtp', 'host', ot("SMTP server"), 'smtp.example.com')}<label>{ot("Port")}<select value={kf.smtp?.port || 587} onChange={e => setK('smtp', 'port', e.target.value)}><option value="587">{ot("587 (STARTTLS)")}</option><option value="465">{ot("465 (SSL)")}</option><option value="2525">2525</option><option value="25">25</option></select></label></div>
        <label className="check-label"><input type="checkbox" checked={Boolean(kf.smtp?.secure)} onChange={e => setK('smtp', 'secure', e.target.checked)}/> {ot("Use SSL from the start (port 465)")}</label>
        <div className="notify-two">{textIn('smtp', 'user', ot("Username"), ot("usually your email"))}{secretIn('smtp', 'pass', ot("Password or app password"), keys?.smtp.passSaved)}</div>{textIn('smtp', 'from', ot("Send from"), ot("Shop <alerts@yourdomain.com>"))}</>}
      {kf.emailMode === 'http' && httpFields('emailHttp', keys?.emailHttp || {}, false)}
      <div className="notify-actions"><button type="button" className="btn btn-green btn-small" disabled={kBusy} onClick={() => saveProvider('email')}><Busy active={kBusy}>{kf.emailMode ? ot("Save email provider") : ot("Remove my email provider")}</Busy></button></div>
      <p className="muted">{ot("Only this store can use these credentials. Keys are encrypted and not shown after saving.")}</p></details>
    <label className="check-label"><input type="checkbox" disabled={!state.email.configured && !form.ownerEmailAlerts} checked={form.ownerEmailAlerts} onChange={e => set('ownerEmailAlerts', e.target.checked)}/> {ot("Email me for every new enquiry or order")}</label>
    <label className="check-label"><input type="checkbox" disabled={!state.email.configured && !form.customerEmail} checked={form.customerEmail===true} onChange={e=>set('customerEmail',e.target.checked)}/> {ot("Email customers order receipt and status updates")} <small>{ot("(only if they provided an email and requested updates; no marketing)")}</small></label>
    <label>{ot("Alert email")} <small>{ot("(leave blank to use your login email)")}</small><input type="email" value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} placeholder="you@example.com"/></label>
    <div className="notify-row"><strong>{ot("SMS")}</strong>{badge(state.sms)}</div>
    <details className="notify-provider"><summary>{state.sms.configured && state.sms.source === 'own' ? ot("Change my SMS provider") : ot("Set up my business SMS")}</summary>
      <label>{ot("Provider")}<select value={kf.smsMode || ''} onChange={e => setKf(x => ({ ...x, smsMode: e.target.value }))}><option value="">{ot("Not connected (no sending)")}</option><option value="fast2sms">{ot("Fast2SMS (easy, India)")}</option><option value="http">{ot("Custom SMS API (MSG91, Twilio, Textlocal, any gateway)")}</option></select></label>
      {kf.smsMode === 'fast2sms' && <><ol className="notify-steps"><li>{ot("Create your business Fast2SMS account and check its wallet balance.")}</li><li>{ot("For DLT, complete the provider's sender and message-template approval; copy sender ID and template/message ID.")}</li><li>{ot("Add your API key below and select the correct route. Quick costs more than DLT.")}</li><li>{ot("Save provider, add your alert mobile, then select alerts and Save alerts.")}</li></ol><p className="muted">{ot("Customer SMS needs the correct approved template/variables for each message. One template must not be assumed to fit every confirmation, status or report. Check the provider setup before enabling customer SMS.")} <a href="https://www.fast2sms.com/" target="_blank" rel="noreferrer">{ot("Open Fast2SMS")}</a></p>{secretIn('fast2sms', 'apiKey', ot("Fast2SMS API key"), keys?.fast2sms.apiKeySaved, keys?.fast2sms.apiKeyHint)}<label>{ot("Route")}<select value={kf.fast2sms?.route || 'quick'} onChange={e => setK('fast2sms', 'route', e.target.value)}><option value="quick">{ot("Quick (paid, ₹5/SMS advertised; not a free test)")}</option><option value="dlt">{ot("DLT (approved template, for customer SMS)")}</option></select></label>
        {kf.fast2sms?.route === 'dlt' && <div className="notify-two">{textIn('fast2sms', 'senderId', ot("DLT sender ID"), ot("ABCDEF"))}{textIn('fast2sms', 'templateId', ot("DLT message ID"), '123456')}</div>}</>}
      {kf.smsMode === 'http' && httpFields('smsHttp', keys?.smsHttp || {}, true)}
      <div className="notify-actions"><button type="button" className="btn btn-green btn-small" disabled={kBusy} onClick={() => saveProvider('sms')}><Busy active={kBusy}>{kf.smsMode ? ot("Save SMS provider") : ot("Remove my SMS provider")}</Busy></button></div>
      <p className="muted">{ot("SMS is charged by your provider. Only this store can use these credentials. Keys are encrypted and not shown after saving.")}</p></details>
    <label className="check-label"><input type="checkbox" disabled={!state.sms.configured && !form.ownerSmsAlerts} checked={form.ownerSmsAlerts} onChange={e => set('ownerSmsAlerts', e.target.checked)}/> {ot("Text me for every new enquiry or order")}</label>
    <label>{ot("Your mobile number")} <small>{ot("(10-digit Indian number)")}</small><input type="tel" inputMode="numeric" value={form.ownerPhone} onChange={e => set('ownerPhone', e.target.value)} placeholder="98765 43210"/></label>
    <label className="check-label"><input type="checkbox" disabled={!state.sms.configured && !form.customerSms} checked={form.customerSms} onChange={e => set('customerSms', e.target.checked)}/> {ot("Text customers order confirmation and status updates from my SMS account")} <small>{ot("(only if they gave a number)")}</small></label>
    <label className="check-label"><input type="checkbox" disabled={!form.ownerEmailAlerts && !form.ownerSmsAlerts && !form.lowStockAlerts} checked={form.lowStockAlerts} onChange={e => set('lowStockAlerts', e.target.checked)}/> {ot("Alert me when stock runs low")} <small>{ot("(one message a day, only when something is low. Uses your email and SMS alert settings above)")}</small></label>
    {form.lowStockAlerts && <label>{ot("Alert when stock is at or below")}<input type="number" min="1" max="100" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))}/></label>}
    <label className="check-label"><input type="checkbox" disabled={!form.ownerEmailAlerts && !form.ownerSmsAlerts && !form.weeklyReport} checked={form.weeklyReport} onChange={e => set('weeklyReport', e.target.checked)}/> {ot("Send me a weekly shop report every Monday morning")} <small>{ot("(last 7 days:")} {ot("enquiries or orders, top items, low stock")})</small></label>
    {msg?.ok && <p className="notice success">{ot(msg.ok)}</p>}{msg?.error && <p className="notice error">{ot(msg.error)}</p>}
    <div className="notify-actions">
      <button className="btn btn-green" disabled={busy}><Busy active={busy}>{busy ? ot("Saving...") : ot("Save alerts")}</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || !state.email.configured} onClick={() => test('email')}><Busy active={testing === 'email'}>{ot("Send test email")}</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || !state.sms.configured} onClick={() => test('sms')}><Busy active={testing === 'sms'}>{ot("Send paid test SMS")}</Busy></button>
      <button type="button" className="btn btn-outline" disabled={!!testing || (!state.email.configured && !state.sms.configured)} onClick={sampleReport}><Busy active={testing === 'report'}>{ot("Send sample weekly report")}</Busy></button>
    </div>
    <p className="muted">{ot("Save alert recipients/settings first. Test buttons send a real message and use your provider quota or SMS balance. Never paste keys in chat; add them only in the provider fields here.")}</p>
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
  return <div className="shop-settings-studio"><section className="settings-hero"><div className="settings-identity">{business.logoUrl?<img src={storeImage(imageSrc(business.logoUrl),192)} alt=""/>:<span className="settings-monogram">{business.name.slice(0,1)}</span>}<div><span className="settings-eyebrow">{ot("YOUR SHOP, YOUR WAY")}</span><h2>{business.name}</h2><p>{business.storeType==='restaurant'?ot("Restaurant"):ot("Store")} {ot("setup · Changes publish only when saved")}</p></div></div><a className="btn btn-outline" href={storeLink(business.slug)} target="_blank" rel="noreferrer">{ot("View shop")} <ArrowUpRight size={16}/></a></section><nav className="settings-tabs" aria-label={ot("Shop settings sections")}>{[['business',ot("Business details"),'01'],['storefront',ot("Look & offers"),'02'],["orders",ot("Orders & delivery"),'03'],['hours',ot("Hours & QR"),'04']].map(([key,label,num])=><button key={key} type="button" className={settingsSection===key?'active':''} aria-pressed={settingsSection===key} onClick={()=>setSettingsSection(key)}><span>{num}</span>{label}</button>)}</nav><form onSubmit={submit} onInvalidCapture={e=>{const section=e.target.closest('.settings-page');if(section){const keys=['business','storefront','orders','hours'];setSettingsSection(keys[Array.from(section.parentElement.querySelectorAll('.settings-page')).indexOf(section)]);}}} className="settings-grid settings-workspace">
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='business'}>
      <div className="settings-card-head"><span className="settings-eyebrow">{ot("BUSINESS DETAILS")}</span><h3>{ot("The essentials")}</h3><p className="muted">{ot("Help customers recognize and contact your shop.")}</p></div><label>{ot("Store type")}<select value={form.storeType} onChange={e => setForm(f => ({ ...f, storeType: e.target.value, blockWhenClosed: e.target.value === 'restaurant' && f.storeType !== 'restaurant' ? true : f.blockWhenClosed, tableCount: e.target.value === 'restaurant' && !f.tableCount ? 1 : f.tableCount }))}><option value="retail">{ot("Retail / kirana")}</option><option value="restaurant">{ot("Restaurant")}</option><option value="services">{ot("Services")}</option></select></label>{form.storeType === 'restaurant' && <label>{ot("Number of tables")}<input type="number" min="1" max="100" value={form.tableCount} onChange={e => set('tableCount', Number(e.target.value))} required/></label>}

      <label>{ot("Shop name")}<input value={form.name} onChange={e => set('name', e.target.value)} required/></label>
      <label>{ot("Short description")}<textarea rows="3" value={form.description} onChange={e => set('description', e.target.value)}/></label>
      <label>{ot("Location")}<input value={form.location} onChange={e => set('location', e.target.value)} placeholder={ot("Mumbai, India")}/></label>
      <label>{ot("WhatsApp number")} <small>{ot("(country code, no +)")}</small><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} required/></label>
      <label>{ot("GSTIN")} <small>{ot("(optional, shown on estimates)")}</small><input value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="27ABCDE1234F1Z5" maxLength={15}/></label>
      {form.storeType === 'restaurant' && <div className="gst-setting"><label>{ot("Bill GST")}<select value={form.gstMode} onChange={e => set('gstMode', e.target.value)}><option value="">{ot("Choose per bill (as before)")}</option><option value="off">{ot("Off - no GST on bills")}</option><option value="inclusive">{ot("Inclusive - prices already include GST")}</option><option value="exclusive">{ot("Exclusive - GST added on top")}</option></select></label>{(form.gstMode === 'inclusive' || form.gstMode === 'exclusive') && <label>{ot("GST rate")}<select value={form.gstRate} onChange={e => set('gstRate', Number(e.target.value))}>{[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>}<p className="muted">{ot("Your GSTIN above is printed on every receipt. A fixed setting applies to every new bill; saved bills never change.")}</p></div>}
      <p className="muted">{ot("Your shop link:")} {storeLink(business.slug)}</p>
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='storefront'}>
      <div className="settings-card-head"><span className="settings-eyebrow">{ot("STOREFRONT")}</span><h3>{ot("Make it look like you")}</h3><p className="muted">{ot("Your color, images and offers, all in one place.")}</p></div><div className="settings-section-head"><h4>{ot("Visitor offer popup")}</h4><button type="button" className="btn btn-outline btn-small" onClick={() => setPreviewOffer(true)}>{ot("Preview popup")}</button></div><label className="check-label"><input type="checkbox" checked={form.offerPopupActive} onChange={e => set('offerPopupActive', e.target.checked)}/> {ot("Show an offer when a visitor opens this store")}</label><label>{ot("Popup headline")} <small>{ot("(optional, defaults to your shop name)")}</small><input maxLength={90} value={form.offerPopupTitle} onChange={e => set('offerPopupTitle', e.target.value)} placeholder={ot("A little something for you")}/></label><label>{ot("Offer message")}<textarea rows="2" maxLength={220} value={form.offerPopupText} onChange={e => set('offerPopupText', e.target.value)} placeholder={ot("20% off fresh arrivals this week")}/></label><div className="form-row"><label>{ot("Button label")} <small>{ot("(optional)")}</small><input maxLength={40} value={form.offerPopupCtaText} onChange={e => set('offerPopupCtaText', e.target.value)} placeholder={ot("Shop the offer")}/></label><label>{ot("Button link")} <small>{ot("(https:// link, optional)")}</small><input type="url" value={form.offerPopupCtaUrl} onChange={e => set('offerPopupCtaUrl', e.target.value)} placeholder="https://example.com/offer"/></label></div><label>{ot("Offer image")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('offerPopupImageUrl')}/></label>{form.offerPopupImageUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.offerPopupImageUrl),640)} alt={ot("Offer preview")}/><button type="button" className="btn btn-outline btn-small" onClick={() => set('offerPopupImageUrl', '')}>{ot("Remove image")}</button></div>}
      <label>{ot("Offer banner text")} <small>{ot("(scrolling strip on top of your shop)")}</small><input value={form.bannerText} onChange={e => set('bannerText', e.target.value)} placeholder={ot("Free delivery above ₹499!")}/></label><label className="check-label"><input type="checkbox" checked={form.bannerActive} onChange={e => set('bannerActive', e.target.checked)}/> {ot("Show text announcement bar")}</label><fieldset className="theme-choices"><legend>{ot("Festive presets")}</legend><p className="muted">{ot("Prepares a color, banner and offer. Review and save to publish; existing text can be edited first.")}</p><div className="festival-presets">{FESTIVAL_PRESETS.map(preset => <button type="button" className="btn btn-outline btn-small" key={preset.name} onClick={() => setForm(f => ({ ...f, accentColor:preset.color, bannerText:preset.banner, bannerActive:true, offerPopupTitle:preset.headline, offerPopupText:preset.message, offerPopupActive:true }))}>{preset.name}</button>)}</div></fieldset><fieldset className="theme-choices"><legend>{ot("Shop color theme")}</legend><p className="muted">{ot("Sets your shop and this dashboard together. Original green is the default.")}</p><div className="theme-swatches">{[...STORE_THEMES, ...(normalizeHexColor(form.accentColor) && !STORE_THEMES.some(t => t.color === normalizeHexColor(form.accentColor)) ? [{ name: 'Current custom', color:normalizeHexColor(form.accentColor) }] : [])].map(option => <button key={option.color} type="button" className={`theme-swatch ${form.accentColor === option.color ? 'chosen' : ''}`} onClick={() => set('accentColor', option.color)} aria-pressed={form.accentColor === option.color} title={option.name}><span style={{ background:option.color }}/>{option.name}</button>)}</div><CustomStoreColor value={form.accentColor} onChange={color => set('accentColor', color)}/><small>{ot("Save all changes to publish this color to your shop.")}</small></fieldset>
      <label>{ot("Shop logo")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('logoUrl')}/>{uploading === 'logoUrl' && <small><span className="button-spinner"/>{ot("Uploading logo...")}</small>}</label>
      {form.logoUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.logoUrl),640)} alt={ot("Logo preview")}/><span>{ot("Logo ready")}</span></div>}
      <label>{ot("Default notification image (optional)")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('notifyImageUrl')}/>{uploading === 'notifyImageUrl' && <small><span className="button-spinner"/>{ot("Uploading image...")}</small>}<small className="muted">{ot("Used in push notifications and WhatsApp order messages. If empty, your cover, then logo, is used.")}</small></label>
      {form.notifyImageUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.notifyImageUrl),640)} alt={ot("Notification image preview")}/><span>{ot("Notification image ready")}</span><button type="button" className="btn btn-outline btn-small" onClick={() => set('notifyImageUrl', '')}>{ot("Remove")}</button></div>}
      {settingsSection==='storefront'&&<LocationPicker form={form} set={set}/>}
      <label>{ot("Cover photo")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={uploadImage('coverUrl')}/>{uploading === 'coverUrl' && <small><span className="button-spinner"/>{ot("Uploading cover...")}</small>}</label>
      {form.coverUrl && <div className="upload-preview"><img src={storeImage(imageSrc(form.coverUrl),640)} alt={ot("Cover preview")}/><span>{ot("Cover ready")}</span></div>}
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='orders'}>
      <div className="settings-card-head"><span className="settings-eyebrow">{ot("ORDERS & PAYMENTS")}</span><h3>{ot("Orders & delivery")}</h3><p className="muted">{ot("Set your delivery charges, minimum order and UPI details.")}</p></div>
      <div className="form-row">
        <label>{ot("Delivery charge (₹)")}<input type="number" min="0" step="1" value={form.deliveryCharge} onChange={e => set('deliveryCharge', e.target.value)}/></label>
        <label>{ot("Free delivery above (₹)")} <small>{ot("(blank = never)")}</small><input type="number" min="0" step="1" value={form.freeDeliveryAbove} onChange={e => set('freeDeliveryAbove', e.target.value)} placeholder="499"/></label>
      </div>
      <label>{ot("Minimum order (₹)")}<input type="number" min="0" step="1" value={form.minOrder} onChange={e => set('minOrder', e.target.value)}/></label>
      {business.storeType === 'restaurant' && <label>{ot("Takeaway ready in (minutes)")} <small>{ot("(optional, shown to customers)")}</small><input type="number" min="1" max="240" step="1" value={form.prepMinutes} onChange={e => set('prepMinutes', e.target.value)} placeholder={ot("e.g. 20")}/></label>}
      <label>{ot("UPI ID")} <small>{ot("(sent in the order message so customers can pay)")}</small><input value={form.upiId} onChange={e => set('upiId', e.target.value)} placeholder="yourshop@upi"/></label>
    </div>
    <div className="dashboard-panel settings-panel settings-page" hidden={settingsSection!=='hours'}>
      <div className="settings-card-head"><span className="settings-eyebrow">{ot("BUSINESS HOURS")}</span><h3>{ot("When you are open")}</h3><p className="muted">{ot("Choose how customers can order, in Indian time.")}</p></div>
      <label className="check-label"><input type="checkbox" checked={form.isOpen} onChange={e => set('isOpen', e.target.checked)}/> <span>{ot("Shop is open")} <small style={{ display: 'block', fontWeight: 400 }}>{ot("(untick to close the shop right now, whatever the hours)")}</small></span></label>
      <label className="check-label"><input type="checkbox" checked={form.autoHours} onChange={e => set('autoHours', e.target.checked)}/> <span>{ot("Open and close automatically by time")} <small style={{ display: 'block', fontWeight: 400 }}>{ot("(Indian time)")}</small></span></label>
      {form.autoHours && <div className="form-row"><label>{ot("Opens at")}<input type="time" value={form.openTime} onChange={e => set('openTime', e.target.value)} required/></label><label>{ot("Closes at")}<input type="time" value={form.closeTime} onChange={e => set('closeTime', e.target.value)} required/></label></div>}
      {form.autoHours && <p className="muted">{ot("Customers see Open between these times and a big Closed banner outside them. A closing time earlier than the opening time means the shop stays open past midnight.")}</p>}
      <label className="check-label"><input type="checkbox" checked={form.blockWhenClosed} onChange={e => set('blockWhenClosed', e.target.checked)}/> <span>{ot("No orders while the shop is closed")} <small style={{ display: 'block', fontWeight: 400 }}>{ot("(on: customers cannot order when closed, good for restaurants. off: they can still send an order that you confirm when you open)")}</small></span></label>
      <label>{ot("Opening hours note")} <small>{ot("(optional text, shown if automatic hours are off)")}</small><input value={form.openingHours} onChange={e => set('openingHours', e.target.value)} placeholder={ot("8:00 AM - 10:00 PM")}/></label>
      <h3>{ot("Shop QR code")}</h3>
      <div className="qr-inline"><img src={`${BASE}/api/public/stores/${business.slug}/qr`} alt={ot("Shop QR code")}/><div><p className="muted">{ot("Print this and stick it on your counter - customers scan it to open your shop.")}</p><a className="btn btn-outline btn-small" href={`${BASE}/api/public/stores/${business.slug}/qr`} download={`${business.slug}-qr.svg`}><Download size={15}/> {ot("Download QR")}</a></div></div>
    </div>
    <div className="settings-save"><div><strong>{JSON.stringify(form)!==savedForm?ot("Unsaved changes"):ot("Settings up to date")}</strong><small>{ot("Applies to all four sections. Provider settings are saved separately.")}</small></div><button className="btn btn-green" disabled={busy || !!uploading}><Busy active={busy}>{busy ? ot("Saving...") : ot("Save shop settings")}</Busy></button></div>
  </form>{previewOffer && <OfferPopup business={{ ...business, ...form }} accentColor={form.accentColor} preview onClose={() => setPreviewOffer(false)}/>}<details className="dashboard-panel remove-store-panel"><summary>{ot("Store removal")} <span>{ot("Advanced")}</span></summary><h3>{ot("Remove this store")}</h3><p className="muted">{ot("The store goes offline and disappears from your dashboard. You can restore it within 30 days. Store data is kept during that window.")}</p><label>{ot("Type")} <strong>{business.slug}</strong> {ot("to confirm")}<input value={removeSlug} onChange={e => { setRemoveSlug(e.target.value); setConfirmRemove(false); }} autoComplete="off" placeholder={business.slug}/></label><button type="button" className="btn btn-outline danger" disabled={removeBusy || removeSlug !== business.slug} onClick={() => setConfirmRemove(true)}>{ot("Remove store")}</button>{confirmRemove && <div className="remove-confirm" role="alertdialog" aria-label={ot("Confirm store removal")}><p>{ot("Take")} <strong>{business.name}</strong> {ot("offline? You can restore it within 30 days.")}</p><button type="button" className="btn btn-outline btn-small" onClick={() => setConfirmRemove(false)}>{ot("Cancel")}</button><button type="button" className="btn btn-outline btn-small danger" disabled={removeBusy || removeSlug !== business.slug} onClick={async () => { setRemoveBusy(true); try { await api(`/owner/${storeId}`, { method: 'DELETE', token, body: { slug: removeSlug } }); onRemoved(); } catch (err) { onError(err.message); } finally { setRemoveBusy(false); setConfirmRemove(false); } }}><Busy active={removeBusy}>{removeBusy ? ot("Removing...") : ot("Confirm removal")}</Busy></button></div>}</details><ChangePassword/></div>;
}

export default function Dashboard() {
  const ownerLanguage = useOwnerLanguage();
  const { session } = useAuth(), token = session.token;
  const staffMode = session.user.role === 'staff';
  const location = useLocation();
  const orderLinkApplied = React.useRef(false);
  const pendingOrderTab = React.useRef(false);
  const linkedStore = new URLSearchParams(location.search).get('store');
  const initialTab = useRef(['imports','whatsapp-cloud','overview','products','categories','customers','leads','sales','tables','staff','coupons','restaurant','campaigns','broadcast','notifications','settings','reviews'].find(k => k === (location.hash || '').replace(/^#\/?/, '')) || null);
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
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [deleteProductId, setDeleteProductId] = useState(null), [deleteStaffId, setDeleteStaffId] = useState(null);
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
  const [supportStaff, setStaff] = useState([]), [staffForm, setStaffForm] = useState({ name:'', email:'', password:'', permissions:[...DEFAULT_STAFF_PERMS] });
  const [couponForm, setCouponForm] = useState({ code: '', percentOff: 10, minOrder: '', maxDiscount: '', usageLimit: '', expiresOn: '' });
  const [importResult, setImportResult] = useState(''), [actionKey, setActionKey] = useState(''), [exportBusy, setExportBusy] = useState(false);

  const settingsBiz = data?.business && String(data.business.id) === String(storeId) ? data.business : stores.find(x => String(x.id) === String(storeId));
  const reloadStoreLists = async () => { const [live, removed] = await Promise.all([api('/owner/stores', { token }), ...(!staffMode ? [api('/owner/deleted-stores', { token })] : [])]); setStores(live.stores); setDeletedStores(removed?.stores || []); setStoreId(current => {
    if (!orderLinkApplied.current) {
      const requested = requestedOrderStore(live.stores, location.search);
      if (requested !== null) {
        orderLinkApplied.current = true;
        if (!requested) { setError(ot("This store is not available in your account. Sign in with the store owner account.")); return ''; }
        pendingOrderTab.current = requestedOrderTab(location.search) || 'leads';
        return requested.id;
      }
    }
    return live.stores.some(s => String(s.id) === String(current)) ? current : live.stores[0]?.id || '';
  }); };
  useEffect(() => { reloadStoreLists().catch(e => setError(e.message)).finally(() => setStoreListLoading(false)); }, []);
  const pagedTabs=['products','categories','coupons','staff','leads','restaurant'];
  const [listRefresh,setListRefresh]=useState(0);
  const listFeature=tab==='categories'?'products':tab;
  const permissionFeature=tab==='restaurant'?'orders_view':listFeature;
  const listEnabled=!!storeId&&!!data&&String(data.business?.id)===String(storeId)&&pagedTabs.includes(tab)&&data.business?.featureLocks?.[listFeature]!==true&&(!staffMode||(session.user.permissions||[]).includes(permissionFeature));
  const list=useOwnerPages(storeId,tab==='restaurant'?'restaurant-orders':tab,filters,token,listRefresh,listEnabled);
  // Live refresh for the order lists: quiet 30s poll while the tab is visible, so new orders appear without pressing Refresh.
  const pollRef=useRef(list.poll);pollRef.current=list.poll;
  useEffect(()=>{if(!listEnabled||!['leads','restaurant'].includes(tab))return;const t=setInterval(()=>{if(document.visibilityState==='visible')pollRef.current?.();},30000);return()=>clearInterval(t);},[listEnabled,tab,storeId]);
  const leads=tab==='leads'?list.rows:supportLeads;
  const restaurantOrders=tab==='restaurant'?list.rows:supportRestaurantOrders;
  const products=tab==='products'?list.rows:supportProducts;
  const categories=tab==='categories'?list.rows:supportCategories;
  const coupons=tab==='coupons'?list.rows:supportCoupons;
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
  useEffect(() => { const keep = initialTab.current; if (storeId) initialTab.current = null; setTab(pendingOrderTab.current || keep || 'overview'); pendingOrderTab.current = false; setRestaurantOrders([]); setData(null); setProducts([]); setCategories([]); setLeads([]); setEditing(null); setImportResult(''); setCoupons([]); setStaff([]); setSales(null); setDeleteProductId(null); setCategoryEdit(null); setCategoryName(''); load(); }, [storeId]);

  useEffect(()=>{ setFilters(f=>({...f,q:'',status:'all',page:1})); },[tab,storeId]);
  useEffect(() => { if (tab === 'settings' && data?.business && String(data.business.id) === String(storeId)) return; const timer=setTimeout(()=>{ if(storeId) load(); },300); return ()=>clearTimeout(timer); }, [tab,filters.from,filters.to]);
  const reportDownload = async kind => { setExportBusy(true); try { await download(`/owner/${storeId}/${kind}/report.csv?${kind === 'sales-summary' ? new URLSearchParams({from:filters.from,to:filters.to}) : queryString}`, `${kind}-${data?.business?.slug || 'store'}.csv`,token); } catch(e){setError(e.message);} finally{setExportBusy(false);} };
  const flash = msg => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const action = async (fn, key = 'action') => { if (busy) return; setBusy(true); setActionKey(key); setError(''); try { await fn(); setListRefresh(n=>n+1); await load(true); } catch (e) { setError(e.message); } finally { setBusy(false); setActionKey(''); } };

  const saveProduct = draft => action(async () => {
    const body = { ...draft, price: Number(draft.price), stock: draft.kind === 'service' || draft.stock === '' ? null : Number(draft.stock), category: draft.category, kind: draft.kind, duration: draft.kind === 'service' ? draft.duration : '' };
    delete body.__storeId;
    await api(editing?.id ? `/owner/${storeId}/products/${editing.id}` : `/owner/${storeId}/products`, { method: editing?.id ? 'PATCH' : 'POST', token, body });
    setEditing(null);
    flash(editing?.id ? ot("Product updated") : ot("Product added"));
  });

  const saveCategory = e => {
    e.preventDefault();
    action(async () => {
      await api(categoryEdit ? `/owner/${storeId}/categories/${categoryEdit}` : `/owner/${storeId}/categories`, { method: categoryEdit ? 'PATCH' : 'POST', token, body: { name: categoryName } });
      setCategoryEdit(null); setCategoryName('');
      flash(ot("Category saved"));
    });
  };

  const uploadBroadcastImage = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(ot("Choose a JPEG, PNG or WebP image under 5 MB")); return; }
    setBroadcastImageBusy(true); setError(''); setBroadcastImageUrl('');
    const selectedStore = storeId;
    try {
      const body = new FormData(); body.append('image', file);
      const result = await api(`/owner/${selectedStore}/upload`, { method: 'POST', token, body });
      if (!/^https:\/\/ik\.imagekit\.io\//.test(result.imageUrl || '')) throw Error(ot("Hosted image is unavailable. Try again later."));
      if (String(selectedStore) === String(broadcastStoreRef.current)) setBroadcastImageUrl(result.imageUrl);
    } catch (err) { setError(err.message); } finally { setBroadcastImageBusy(false); }
  };

  const sendBroadcast = e => {
    e.preventDefault();
    action(async () => {
      const result = await api(`/owner/${storeId}/push-broadcast`, { method: 'POST', token, body: { title: notify.title, body: notify.body, ...(notify.link.trim() ? { link: notify.link.trim() } : notify.productId ? { productId: notify.productId } : {}), ...(notifyImg ? { image: notifyImg } : {}) } });
      setNotify({ title: '', body: '', link: '', productId: '' }); setNotifyImg('');
      setNotifyResult(ot("Sent to {v0} subscriber{v1}{v2}.", {v0: result.sent, v1: result.sent === 1 ? '' : 's', v2: result.gone ? `, removed ${result.gone} expired` : ''}));
    });
  };

  const headings = { reviews:['Reviews.','What customers say about your items.'], tables:['Tables.','Every table, delivery and takeaway in one live view.'], imports:['Bulk import.','Add products and customers with a reviewed column mapping.'], 'whatsapp-cloud': ['WhatsApp integration.', 'Connected shop inbox and service replies.'], overview: ['Your shop at a glance.', 'See what customers are browsing and which requests need your attention.'], products: ['Your products.', 'Keep your collection looking its best.'], categories: ['Categories.', 'Help customers find exactly what they need.'], customers: ['Your customers.', 'Store-scoped contacts and consent records.'], leads: ['WhatsApp orders.', 'Track incoming requests and follow up with customers.'], sales: ['Sales and enquiries.', data?.business?.storeType === 'restaurant' ? 'A clear view of recorded restaurant orders and customer enquiries.' : 'A clear view of customer enquiries and their value.'], staff: ['Staff accounts.', 'Give helpers limited access without sharing your password.'], coupons: ['Coupons.', 'Create discounts customers can use at checkout.'], restaurant: ['Table orders.', 'New restaurant orders arrive here.'], campaigns:['Email & SMS offers.','Offers from your business account to consented customers.'], broadcast: ['WhatsApp broadcast.', 'Prepare offers and send them yourself, one recipient at a time.'], notifications: ['Notifications.', 'Reach your customers even after they leave.'], settings: ['Shop settings.', 'Make your corner of the internet yours.'] };
  const currentStore = stores.find(s => String(s.id) === String(storeId));
  useEffect(() => { const h = ot(headings[tab]?.[0] || '')?.replace(/\.$/, ''); document.title = [h, currentStore?.name, 'Digital Shop'].filter(Boolean).join(' - '); return () => { document.title = 'Digital Shop - Your shop, one link away'; }; }, [tab, currentStore?.name, ownerLanguage]);
  useEffect(() => { if (tab === 'leads' && currentStore?.storeType === 'restaurant') setTab('restaurant'); }, [tab, currentStore?.storeType]);
  const tabLocked = currentStore ? isTabLocked(currentStore, tab) : false;
  const BASE = import.meta.env.VITE_API_URL || '';
  // Changing one order's status updates only that order's card. No dashboard-wide reload, no list reset, other cards stay usable.
  const updateRestaurantOrder = async (order, status) => {
    setError(''); setActionKey(`order-${order.id}`);
    try {
      const { order: fresh } = await api(`/owner/${storeId}/restaurant-orders/${order.id}`, { method: 'PATCH', token, body: { status } });
      list.patchRow(order.id, fresh); setRestaurantOrders(prev => prev.map(x => (x.id === order.id ? { ...x, ...fresh } : x)));
      return fresh;
    } catch (e) { setError(e.message); return null; } finally { setActionKey(''); }
  };

  return <AdminShell tab={tab} setTab={setTab} stores={stores} storeId={storeId} setStoreId={setStoreId}><div className="admin-content" key={`${storeId}:${tab}`}>
    {!storeId ? (storeListLoading ? <LoadSkeleton label={ot("Loading your stores")} cards={2}/> : <div className="dashboard-panel empty-state">{linkedStore ? ot("This store is not available in your account. Sign in with the store owner account.") : ot("Create a store to manage your catalog.")}</div>) : <TabBoundary tabKey={tab}>
      <div className="page-title"><div><span className="kicker">{ot("YOUR WORKSPACE")}</span><h1>{ot((headings[tab]||[tab,''])[0])}</h1><p>{ot((headings[tab]||[tab,''])[1])}</p></div>{tab === 'products' && !tabLocked && <div className="page-title-actions"><button className="btn btn-outline" disabled={loading || exportBusy || !products.length} onClick={async()=>{setExportBusy(true);try{await download(`/owner/${storeId}/products/catalog.pdf`, `products-${currentStore?.slug || storeId}.pdf`,token);}catch(e){setError(e.message);}finally{setExportBusy(false);}}}>{ot("Download products PDF")}</button><button className="btn btn-outline" disabled={loading || exportBusy || !products.length} onClick={async()=>{setExportBusy(true);try{const full=await api(`/owner/${storeId}/products`,{token});downloadProductCsv(productsCsv(full.products),`products-${currentStore?.slug || storeId}.csv`);}catch(e){setError(e.message);}finally{setExportBusy(false);}}}>{ot("Download products CSV")}</button><button className="btn btn-green" onClick={() => setEditing({ __storeId: storeId })}><Plus size={18}/> {ot("Add product")}</button></div>}</div>
      <Notice error={error} success={success}/>{!tabLocked && tab === 'leads' && <FilterBar value={filters} onChange={setFilters} dates statuses={['new','confirmed','packed','shipped','out-for-delivery','delivered','in-progress','completed','cancelled']} onReport={()=>reportDownload('leads')} reportBusy={exportBusy}/>}{!tabLocked && tab === 'restaurant' && <FilterBar value={filters} onChange={setFilters} dates statuses={['new','preparing','served','cancelled']} onReport={()=>reportDownload('restaurant-orders')} reportBusy={exportBusy}/>}{!tabLocked && tab === 'sales' && <FilterBar value={filters} onChange={setFilters} search={false} dates onReport={()=>reportDownload('sales-summary')} reportBusy={exportBusy}/>}{tab === 'products' && !tabLocked && <MappedImport kind="products" token={token} storeId={storeId} onImported={()=>{setListRefresh(n=>n+1);load();}}/>}{['products','categories','coupons','staff'].includes(tab) && <FilterBar value={filters} onChange={setFilters} searchPlaceholder={{products:ot("Product name or category..."),coupons:ot("Coupon code..."),staff:ot("Staff name or phone...")}[tab]} statuses={['products','coupons','staff'].includes(tab)?['active','inactive']:tab==='referrals'?['pending','confirmed']:[]}/>}
      {loading ? <LoadSkeleton label={ot("Loading {v0}", {v0: (headings[tab]||[tab,''])[0]})} cards={tab === 'overview' || tab === 'sales' ? 4 : 2} rows={3}/> : tabLocked ? <div className="dashboard-panel locked-panel" role="status"><Lock size={28}/><h3>{ot("Kindly contact admin")}</h3><p className="muted">{ot("Please contact your platform admin to enable this feature. Your data is safe.")}</p></div> : <>
      {tab === 'overview' && staffMode && currentStore && storeId && <OrderAlertsCard token={token} storeId={storeId} slug={currentStore.slug}/>}
      {tab === 'overview' && data && !staffMode && <>
        <PlanCard token={token}/>
        {data.lowStock?.length > 0 && <div className="notice warn anim-up" role="alert"><Package size={16}/> {ot("Low stock alert:")} {data.lowStock.map(p => ot("{v0} ({v1} left)", {v0: p.name, v1: p.stock})).join(', ')}{ot(". Restock these items.")}</div>}
        {data.business?.storeType === 'restaurant' ? (String(data.business?.id) !== String(storeId) ? null : <RestaurantOverview token={token} storeId={storeId} onOpen={setTab}/>) : <><div className="section-heading"><div><span className="kicker">{ot("STORE SNAPSHOT")}</span><h2>{ot("Today at a glance")}</h2></div><p>{verticalWords(data.business?.storeType).requestsNote}</p></div><div className="stat-grid overview-stats">{[[data.products, ot("Products live in your catalog"), Package], [data.categories, ot("Ways to browse"), Tags], [data.leads, verticalWords(data.business?.storeType).requests, MessageCircle], [data.subscribers, ot("Push subscribers"), Bell]].map(([num, label, Icon], i) => <div className="stat-card anim-up" style={{ animationDelay: `${i * 70}ms` }} key={label}><Icon size={21}/><strong>{num}</strong><span>{label}</span></div>)}</div></>}
        {data.business?.storeType !== 'restaurant' && currentStore && !isTabLocked(currentStore, 'leads') && <EnquiriesPanel token={token} storeId={storeId} slug={data.business?.slug} title={verticalWords(data.business?.storeType).recent}/>}
        <div className="dashboard-panel welcome-panel">
          <div><span className="kicker">{ot("YOUR SHOP LINK")}</span><h2>{data.business?.active ? ot("Ready to share your shop?") : ot("Your shop is paused")}</h2><p>{data.business?.active ? ot("Send your shop link to customers, print your QR code, or share a product directly.") : ot("The catalog is hidden from visitors until you reopen the shop in Settings.")}</p><div className="url-pill">{storeLink(data.business?.slug)}</div></div>
          <div className="welcome-actions"><a href={storeLink(data.business?.slug)} target="_blank" rel="noreferrer" className="btn btn-green">{ot("Visit your shop")} <ArrowUpRight size={17}/></a><button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(storeLink(data.business?.slug)); flash(ot("Shop link copied")); } catch { showToast('error', ot("Could not copy the link. Please copy it manually.")); } }}><Copy size={16}/> {ot("Copy link")}</button></div>
        </div>
        <ShopQr business={data.business} token={token} storeId={storeId}/>
        <div className="overview-grid">
          <div className="dashboard-panel"><h3>{ot("Top products by enquiries")}</h3>{data.topProducts?.length ? <div className="top-list">{data.topProducts.map((t, i) => <div className="top-row" key={t.productName}><span className="top-rank">{i + 1}</span><strong>{t.productName}</strong><span className="top-count">{t.count} {ot("taps")}</span></div>)}</div> : <p className="muted">{ot("Enquiries will rank your bestsellers here.")}</p>}</div>
        </div>
      </>}
      {tab === 'products' && <div className="dashboard-panel">
        {importResult && <p className="notice success">{importResult}</p>}
        {!products.length ? <div className="empty-state"><Package size={36}/><h3>{ot("Your catalog starts here")}</h3><p>{ot("Add a category first, then your first product - or import your catalog from Vyapar.")}</p></div>
          : <div className="table-wrap"><table className="products-table"><thead><tr><th>{ot("Product")}</th><th>{ot("Category")}</th><th>{ot("Price")}</th><th>{ot("Stock")}</th><th>{ot("Status")}</th><th></th></tr></thead><tbody>{products.map(p => <tr key={p.id}>
            <td data-label={ot('Product')}><div className="table-product">{p.imageUrl ? <img src={storeImage(imageSrc(p.imageUrl),160)} alt=""/> : <span><Package size={18}/></span>}<strong>{p.name}</strong>{p.featured && <Star size={13} className="star-on"/>}</div></td>
            <td data-label={ot('Category')}>{p.category?.name || '—'}</td>
            <td data-label={ot('Price')}>{inr(p.price)}</td>
            <td data-label={ot('Stock')}>{p.kind === 'service' ? <span className="status service">{ot("Service")}</span> : p.stock === null || p.stock === undefined ? '∞' : p.stock === 0 ? <span className="status paused">{ot("Out")}</span> : p.stock <= 5 ? <span className="status low">{p.stock} {ot("low")}</span> : p.stock}</td>
            <td data-label={ot('Status')}><span className={`status ${p.active ? 'live' : 'paused'}`}>{p.active ? ot("Live") : ot("Hidden")}</span>{data?.business?.storeType === 'restaurant' && <button type="button" className={`btn btn-small ${p.soldOutToday ? 'btn-green' : 'btn-outline'}`} disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/products/${p.id}`, { method: 'PATCH', token, body: { soldOutToday: !p.soldOutToday } }); flash(ot(p.soldOutToday ? 'Back on the menu' : 'Marked sold out for today')); }, `soldout-${p.id}`)}>{p.soldOutToday ? ot("Put back on menu") : ot("Sold out today")}</button>}</td>
            <td className="row-actions" data-label={ot('Actions')}><button onClick={() => setEditing({ ...p, __storeId: storeId })}>{ot("Edit")}</button>{!staffMode && <>{deleteProductId !== p.id && <button className="danger" disabled={busy} onClick={() => setDeleteProductId(p.id)}>{ot("Delete")}</button>}{deleteProductId === p.id && <span className="inline-delete-confirm" role="group" aria-label={ot("Delete {v0}?", {v0: p.name})}><span>{ot("Delete")} {p.name}? <small>{ot("Order and enquiry history stays. Uploaded media is not deleted.")}</small></span><button className="danger" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/products/${p.id}`, { method: 'DELETE', token }); setDeleteProductId(null); flash(ot("Product deleted")); }, `product-${p.id}`)}><Busy active={actionKey === `product-${p.id}`}>{actionKey === `product-${p.id}` ? ot("Deleting...") : ot("Yes, delete")}</Busy></button><button disabled={busy} onClick={() => setDeleteProductId(null)}>{ot("Cancel")}</button></span>}</>}</td>
          </tr>)}</tbody></table></div>}
      </div>}
      {tab === 'categories' && <div className="dashboard-panel">
        <form className="inline-form" onSubmit={saveCategory}><label>{categoryEdit ? ot("Rename category") : ot("Add a category")}<input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder={ot("e.g. Staples, Snacks, Beverages")} required/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? ot("Saving...") : categoryEdit ? ot("Save changes") : ot("Add category")}</Busy></button>{categoryEdit && <button type="button" className="btn btn-outline" onClick={() => { setCategoryEdit(null); setCategoryName(''); }}>{ot("Cancel")}</button>}</form>
        <div className="category-list">{categories.map(c => <div key={c.id}><span className="category-symbol"><Tags size={18}/></span><div><strong>{c.name}</strong><small>/{c.slug}</small></div><button onClick={() => { setCategoryEdit(c.id); setCategoryName(c.name); }}>{ot("Edit")}</button><button className="danger" disabled={busy} onClick={() => { if (confirm(ot("Delete {v0}? It must be empty.", {v0: c.name}))) action(async () => { await api(`/owner/${storeId}/categories/${c.id}`, { method: 'DELETE', token }); flash(ot("Category deleted")); }, `category-${c.id}`); }}><Busy active={actionKey === `category-${c.id}`}>{actionKey === `category-${c.id}` ? ot("Deleting...") : ot("Delete")}</Busy></button></div>)}{!categories.length && <p className="muted">{ot("No categories yet. Add one to organize your products.")}</p>}</div>
      </div>}
      {tab === 'reviews' && !staffMode && <ReviewsAdmin token={token} storeId={storeId}/>}
      {tab === 'customers' && staffMode && <Customers token={token} storeId={storeId} staffMode/>}
      {tab === 'customers' && !staffMode && <><MappedImport kind="customers" token={token} storeId={storeId} onImported={()=>setCustomerRefresh(n=>n+1)}/><Customers key={customerRefresh} token={token} storeId={storeId}/></>}
      {tab === 'leads' && <div className="dashboard-panel"><button type="button" className="btn btn-outline btn-small" onClick={()=>{setListRefresh(n=>n+1);load();}} disabled={loading}>{ot("Refresh orders")}</button>
        <div className="leads-head"><p className="muted">{ot("Each row records a WhatsApp order request. Confirm details and payment with the customer. Set a status, add the customer’s number and tap Update to send them a status message on WhatsApp.")}</p>{!staffMode && <button className="btn btn-outline btn-small" disabled={exportBusy} onClick={async () => { setExportBusy(true); try { await download(`/owner/${storeId}/export/vyapar.csv`, `vyapar-sales-${data?.business?.slug || 'store'}.csv`, token); } catch (e) { setError(e.message); } finally { setExportBusy(false); } }}><Busy active={exportBusy}><FileSpreadsheet size={16}/> {exportBusy ? ot("Exporting...") : ot("Export to Vyapar")}</Busy></button>}</div>
        {leads.length ? <div className="table-wrap enquiry-table orders-table"><table><thead><tr><th>{ot("Order")}</th><th>{ot("Total")}</th><th>{ot("When")}</th><th>{ot("Customer no.")}</th><th>{ot("Status")}</th><th></th></tr></thead><tbody>{leads.map(l => <LeadRow key={l.id} lead={l} storeType={data?.business?.storeType} token={token} storeId={storeId} onChanged={()=>{setListRefresh(n=>n+1);load();}}/>)}</tbody></table></div> : <div className="empty-state">{ot("No orders yet. Share your shop to get started.")}</div>}
      </div>}
      {tab === 'staff' && !staffMode && <div className="dashboard-panel"><h3>{ot("Staff access")}</h3><p className="muted">{ot("Choose exactly what each helper can see or do. Helpers can always view the store overview. They can never create stores, change shop settings, delete anything or see payment keys. Coupons and billing (taking payment, with a 10% discount cap) are only available if you tick them below. Share temporary passwords through a secure channel. A disabled account cannot sign in. If a password is lost, disable that account and create a fresh one.")}</p><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { await api(`/owner/${storeId}/staff`, { token, method:'POST', body:staffForm }); setStaffForm({ name:'', email:'', password:'', permissions:[...DEFAULT_STAFF_PERMS] }); flash(ot("Staff account created")); }, 'staff-create'); }}><label>{ot("Name")}<input required maxLength={100} value={staffForm.name} onChange={e => setStaffForm({...staffForm,name:e.target.value})}/></label><label>{ot("Email")}<input type="email" required value={staffForm.email} onChange={e => setStaffForm({...staffForm,email:e.target.value})}/></label><label>{ot("Temporary password")}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={staffForm.password} onChange={e => setStaffForm({...staffForm,password:e.target.value})}/></label><PermissionChecks value={staffForm.permissions} onChange={permissions => setStaffForm({...staffForm,permissions})} restaurant={data?.business?.storeType === 'restaurant'}/><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'staff-create'}>{ot("Create staff")}</Busy></button></form><div className="coupon-list">{staff.map(person => <div key={person.id}><strong>{person.name}</strong><span>{person.email}</span><span>{person.active ? ot("Active") : ot("Disabled")}</span><PermissionChecks value={person.permissions || []} disabled={busy} restaurant={data?.business?.storeType === 'restaurant'} onChange={permissions => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'PATCH', body:{ permissions } }); flash(ot("Permissions updated")); }, `staff-perm-${person.id}`)}/><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'PATCH', body:{ active:!person.active } }); }, `staff-${person.id}`)}>{person.active ? ot("Disable") : ot("Enable")}</button>{deleteStaffId !== person.id && <button type="button" className="btn btn-outline btn-small danger" disabled={busy} onClick={() => setDeleteStaffId(person.id)}>{ot("Delete")}</button>}{deleteStaffId === person.id && <span className="inline-delete-confirm" role="group" aria-label={ot("Delete {v0}?",{v0:person.name})}><span>{ot("Delete {name} for good? They can no longer sign in and this cannot be undone. Orders they entered stay.",{name:person.name})}</span><button type="button" className="danger" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/staff/${person.id}`, { token, method:'DELETE' }); setDeleteStaffId(null); flash(ot("Staff deleted")); }, `staff-del-${person.id}`)}><Busy active={actionKey === `staff-del-${person.id}`}>{actionKey === `staff-del-${person.id}` ? ot("Deleting...") : ot("Yes, delete")}</Busy></button><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => setDeleteStaffId(null)}>{ot("Keep")}</button></span>}</div>)}</div></div>}
      {tab === 'coupons' && <div className="dashboard-panel"><h3>{ot("Discount codes")}</h3><p className="muted">{ot("Customers enter a code on the store checkout. Discounts apply to the item subtotal; delivery charges remain unchanged.")}</p>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); if (couponForm.percentOff >= 50 && !couponForm.maxDiscount && !window.confirm(ot("{v0}% off with no maximum discount can cost you a lot on a big order. Create it anyway? You can add a maximum discount in Rs to stay safe.", {v0: couponForm.percentOff}))) return; action(async () => { await api(`/owner/${storeId}/coupons`, { token, method:'POST', body: couponForm }); setCouponForm({ code:'', percentOff:10, minOrder:'', maxDiscount:'', usageLimit:'', expiresOn:'' }); flash(ot("Coupon created")); }, 'coupon-create'); }}>
          <label>{ot("Code")}<input required pattern="[A-Za-z0-9-]{3,24}" maxLength={24} value={couponForm.code} onChange={e => setCouponForm({ ...couponForm, code:e.target.value.toUpperCase() })} placeholder={ot("SAVE10")}/></label><label>{ot("Percent off")}<input type="number" required min="1" max="90" value={couponForm.percentOff} onChange={e => setCouponForm({ ...couponForm, percentOff:Number(e.target.value) })}/></label><label>{ot("Min order (Rs)")} <small>{ot("optional")}</small><input type="number" min="0" value={couponForm.minOrder} onChange={e => setCouponForm({ ...couponForm, minOrder:e.target.value })} placeholder={ot("No minimum")}/></label><label>{ot("Max discount (Rs)")} <small>{ot("optional")}</small><input type="number" min="0" value={couponForm.maxDiscount} onChange={e => setCouponForm({ ...couponForm, maxDiscount:e.target.value })} placeholder={ot("No cap")}/></label><label>{ot("Total uses")} <small>{ot("optional")}</small><input type="number" min="1" step="1" value={couponForm.usageLimit} onChange={e => setCouponForm({ ...couponForm, usageLimit:e.target.value })} placeholder={ot("Unlimited")}/></label><label>{ot("Valid until")} <small>{ot("optional")}</small><input type="date" value={couponForm.expiresOn} onChange={e => setCouponForm({ ...couponForm, expiresOn:e.target.value })}/></label><button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'coupon-create'}>{ot("Create coupon")}</Busy></button>
        </form><div className="coupon-list">{coupons.length ? coupons.map(c => <div key={c.id}><strong>{c.code}</strong><span>{c.percentOff}{ot("% off")}{c.maxDiscount ? ot(" (max Rs.{v0})", {v0: c.maxDiscount}) : ''}{c.minOrder ? ot(", min Rs.{v0}", {v0: c.minOrder}) : ''}{c.usageLimit ? ot(", {v0} uses", {v0: c.usageLimit}) : ''}{c.expiresOn ? ot(", till {v0}", {v0: c.expiresOn}) : ''}</span><span>{c.expiresOn && c.expiresOn < new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) ? ot("Expired") : c.active ? ot("Active") : ot("Off")}</span><button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => action(async () => { await api(`/owner/${storeId}/coupons/${c.id}`, { token, method:'PATCH', body:{ active:!c.active } }); }, `coupon-${c.id}`)}>{c.active ? ot("Turn off") : ot("Turn on")}</button></div>) : <p className="muted">{ot("No coupons yet.")}</p>}</div>
      </div>}
      {tab === 'sales' && <div className="sales-page"><SalesAnalytics report={sales} storeType={data?.business?.storeType}/></div>}
      {tab === 'imports' && staffMode && <>{data?.business?.featureLocks?.products ? <p className="notice">{ot("Product import: kindly contact admin.")}</p> : <MappedImport kind="products" token={token} storeId={storeId}/>} {import.meta.env.VITE_CRM_ENABLED !== 'true' ? <p className="notice">{ot("Customer imports are not enabled for this deployment.")}</p> : data?.business?.featureLocks?.customers ? <p className="notice">{ot("Customer import: kindly contact admin.")}</p> : <MappedImport kind="customers" token={token} storeId={storeId}/>}</>}
      {tab === 'overview' && data && staffMode && <div className="dashboard-panel"><h3>{data.business.name}</h3><p>{data.business.storeType === 'restaurant' ? ot("Restaurant order status is available under Table orders.") : ot("This staff account has overview access only.")}</p></div>}
      {tab === 'tables' && data?.business?.storeType === 'restaurant' && <TablesView token={token} storeId={storeId} staffMode={staffMode} canBill={!staffMode || !Array.isArray(session.user.permissions) || session.user.permissions.includes('billing')}/>}
      {tab === 'restaurant' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel"><RestaurantOrders orders={restaurantOrders} busy={busy} actionKey={actionKey} onStatus={updateRestaurantOrder} onRefresh={()=>{setListRefresh(n=>n+1);load(true);}} token={token} storeId={storeId} staffMode={staffMode} renderPay={o=><PayActions kind="restaurant-orders" order={o} token={token} storeId={storeId} staffMode={staffMode}/>}/></div>}
      {tab === 'whatsapp-cloud' && import.meta.env.VITE_WHATSAPP_INTEGRATION_UI_ENABLED === 'true' && <WhatsAppIntegration token={token} storeId={storeId} staff={staffMode} shopNumber={data?.business?.whatsapp || currentStore?.whatsapp} />}
      {tab === 'campaigns' && !staffMode && <OfferCampaigns token={token} storeId={storeId}/>}
      {tab === 'broadcast' && !staffMode && <div className="dashboard-panel status-creative-panel"><span className="kicker">{ot("READY FOR WHATSAPP STATUS")}</span><h3>{ot("A story-sized shop promo")}</h3><p className="muted">{ot("Download a vertical image with your shop name, live items and link. Post it to your WhatsApp Status yourself. Nothing is posted automatically.")}</p><button type="button" className="btn btn-green" onClick={() => { try { downloadStatusCreative(data.business, products); } catch (err) { setError(err.message); } }}>{ot("Download status image")} <Download size={17}/></button></div>}
      {tab === 'broadcast' && !staffMode && <div className="dashboard-panel"><h3>{ot("Prepare an offer for WhatsApp")}</h3><p className="muted">{ot("Use numbers only for customers who agreed to receive WhatsApp offers. Each link opens a draft for you to review and send. The image goes in as a hosted link, not a WhatsApp photo attachment; link previews depend on WhatsApp.")}</p><label>{ot("Opted-in customer numbers (one per line)")}<textarea rows={4} value={broadcastRecipients} onChange={e => setBroadcastRecipients(e.target.value)} placeholder="919876543210"/></label><label>{ot("Offer text")}<textarea maxLength={500} rows={4} value={broadcastText} onChange={e => setBroadcastText(e.target.value)} placeholder={ot("This week's fresh arrivals are here...")}/></label><label>{ot("Offer image link")} <small>{ot("(optional; JPEG, PNG or WebP, max 5 MB)")}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadBroadcastImage} disabled={broadcastImageBusy}/></label>{broadcastImageBusy && <p className="muted" role="status">{ot("Uploading image...")}</p>}{broadcastImageUrl && <div className="broadcast-image-preview"><img src={broadcastImageUrl} alt={ot("Offer preview")}/><div><strong>{ot("Image link ready")}</strong><small>{ot("It will be included in each WhatsApp draft. Preview display depends on WhatsApp.")}</small><button type="button" className="btn btn-outline btn-small" onClick={() => setBroadcastImageUrl('')}>{ot("Remove image link")}</button></div></div>}<div className="coupon-list">{[...new Set(broadcastRecipients.split(/[\s,;]+/).map(p => p.replace(/\D/g, '')).filter(p => /^[1-9]\d{7,14}$/.test(p)))].map(number => <div key={number}><strong>{number}</strong><a className="btn btn-outline btn-small" href={`https://wa.me/${number}?text=${encodeURIComponent([broadcastText.trim(), broadcastImageUrl, storeLink(data?.business?.slug)].filter(Boolean).join('\n\n'))}`} target="_blank" rel="noreferrer" onClick={e => { if (!broadcastText.trim() || broadcastImageBusy) { e.preventDefault(); setError(broadcastImageBusy ? 'Wait for the image to finish uploading' : 'Write an offer first'); } }}>{ot("Open WhatsApp draft")}</a></div>)}</div></div>}
      {tab === 'notifications' && <OrderAlertsCard token={token} storeId={storeId} slug={data?.business?.slug || currentStore?.slug}/>}
      {tab === 'notifications' && <div className="dashboard-panel">
        <h3>{ot("Broadcast to subscribers")}</h3>
        <p className="muted">{data?.subscribers || 0} {ot("visitor")}{(data?.subscribers || 0) === 1 ? ' has' : ot("s have")} {ot("allowed notifications from this shop. Send an offer or new-arrival alert straight to their phone.")}</p>
        <form onSubmit={sendBroadcast} className="notify-form">
          <label>{ot("Title")}<input value={notify.title} onChange={e => setNotify({ ...notify, title: e.target.value })} placeholder={ot("Fresh stock arrived!")} maxLength={80} required/></label>
          <label>{ot("Message")}<textarea rows="3" value={notify.body} onChange={e => setNotify({ ...notify, body: e.target.value })} placeholder={ot("Basmati rice back in stock. Order now on WhatsApp!")} maxLength={200} required/></label>
          <label>{ot("Open this product (optional)")}<select value={notify.productId} disabled={Boolean(notify.link.trim())} onChange={e => setNotify({ ...notify, productId: e.target.value })}><option value="">{ot("Shop home page")}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>{ot("Or paste a link (optional)")}<input type="url" inputMode="url" value={notify.link} onChange={e => setNotify({ ...notify, link: e.target.value })} placeholder={`https://digitalshop.website/store/${data?.business?.slug || 'your-shop'}/product/12`} maxLength={300}/><small className="muted">{ot("Tapping the notification opens this page. Links must be pages of this shop.")}</small></label>
          <label>{ot("Image (optional)")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={notifyImgBusy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(ot("Choose a JPEG, PNG or WebP image under 5 MB")); return; } setNotifyImgBusy(true); setError(''); try { const body = new FormData(); body.append('image', file); const r = await api(`/owner/${storeId}/upload`, { method: 'POST', token, body }); if (!/^https:\/\/ik\.imagekit\.io\//.test(r.imageUrl || '')) throw Error('Image hosting is unavailable. Try again later.'); setNotifyImg(r.imageUrl); } catch (err) { setError(err.message); } finally { setNotifyImgBusy(false); } }}/><small className="muted">{ot("If you skip it, your default notification image, cover or logo is used.")}</small></label>
          {notifyImgBusy && <small><span className="button-spinner"/>{ot("Uploading image...")}</small>}
          {notifyImg && <div className="upload-preview"><img src={imageSrc(notifyImg)} alt={ot("Notification image preview")}/><span>{ot("Image ready")}</span><button type="button" className="btn btn-outline btn-small" onClick={() => setNotifyImg('')}>{ot("Remove")}</button></div>}
          {notifyResult && <p className="notice success">{notifyResult}</p>}
          <button className="btn btn-green" disabled={busy || !(data?.subscribers > 0)}><Busy active={busy}><Bell size={16}/> {busy ? ot("Sending...") : ot("Send notification")}</Busy></button>
          {!(data?.subscribers > 0) && <p className="muted">{ot("Visitors can subscribe from the prompt on your storefront.")}</p>}
        </form>
      </div>}
      {tab === 'settings' && data?.business?.storeType === 'restaurant' && <div className="dashboard-panel"><h3>{ot("Table QR codes")}</h3><p className="muted">{ot("Print one for each table. Scanning opens the menu with that table number selected.")}</p><div className="table-qr-grid">{Array.from({ length: data.business.tableCount }, (_, i) => <div key={i + 1} className="table-qr-card"><strong>{ot("Table")} {i + 1}</strong><img src={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} alt={ot("QR for table {v0}", {v0: i + 1})}/><a href={`${BASE}/api/public/stores/${data.business.slug}/qr?table=${i + 1}`} download={`table-${i + 1}.svg`}>{ot("Download QR")}</a></div>)}</div></div>}
      {pagedTabs.includes(tab) && <div ref={list.sentinel} className="pagination-sentinel" aria-live="polite"><span>{list.rows.length} {ot("of")} {list.total} {ot("matching")} {ot(tab)}</span>{list.loading ? <span>{ot("Loading...")}</span> : list.error ? <><span role="alert">{ot(list.error)}</span><button className="btn btn-outline btn-small" onClick={list.more}>{ot("Retry")}</button></> : list.hasMore && <button className="btn btn-outline btn-small" onClick={list.more}>{ot("Load 10 more")}</button>}</div>}

      {tab === 'settings' && settingsBiz && <Settings business={settingsBiz} token={token} storeId={storeId} onSaved={() => { load(); flash(ot("Shop updated")); }} onRemoved={() => { setData(null); reloadStoreLists().then(() => flash(ot("Store removed. You have 30 days to restore it."))).catch(e => setError(e.message)); }} onError={setError}/>}
      {tab === 'settings' && settingsBiz && !staffMode && <section className="settings-connections"><div className="settings-connections-head"><h3>{ot("Messages & connections")}</h3><p className="muted">{ot("Your own accounts, your own billing. Nothing is enabled automatically.")}</p></div><NotificationSettings token={token} storeId={storeId} /><PaymentSettings token={token} storeId={storeId} /></section>}
      {(tab === 'overview' || !storeId) && !staffMode && <div className="overview-management"><div className="section-heading"><div><span className="kicker">{ot("SHOP MANAGEMENT")}</span><h2>{ot("Manage your stores")}</h2></div></div>
    {deletedStores.length > 0 && <div className="dashboard-panel removed-stores"><h3>{ot("Recently removed stores")}</h3>{deletedStores.map(store => <div className="removed-store" key={store.id}><div><strong>{store.name}</strong><small>{ot("Restore by")} {new Date(store.restoreUntil).toLocaleDateString('en-IN')} · {store.slug}</small></div><label>{ot("Store link")}<input value={restoreSlug[store.id] || ''} onChange={e => setRestoreSlug(prev => ({ ...prev, [store.id]: e.target.value }))} placeholder={store.slug}/></label><button className="btn btn-outline btn-small" disabled={busy || restoreSlug[store.id] !== store.slug || new Date() >= new Date(store.restoreUntil)} onClick={() => action(async () => { await api(`/owner/deleted-stores/${store.id}/restore`, { method: 'POST', token, body: { slug: restoreSlug[store.id] } }); await reloadStoreLists(); flash(ot("Store restored")); })}>{ot("Restore store")}</button></div>)}</div>}
    <div className="dashboard-panel store-create"><h3>{ot("Add a store")}</h3><form className="inline-form" onSubmit={e => { e.preventDefault(); action(async () => { const { store } = await api('/owner/stores', { method: 'POST', token, body: newStore }); const result = await api('/owner/stores', { token }); setStores(result.stores); setStoreId(store.id); setNewStore({ name: '', slug: '', whatsapp: '', storeType: 'retail', tableCount: 0 }); flash(ot("Store created")); }); }}><input placeholder={ot("Store name")} aria-label={ot("Store name")} required value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })}/><input placeholder={ot("Custom slug (optional)")} aria-label={ot("Store slug")} value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })}/><input placeholder={ot("WhatsApp number (country code)")} aria-label={ot("WhatsApp number")} required value={newStore.whatsapp} onChange={e => setNewStore({ ...newStore, whatsapp: e.target.value })}/><label>{ot("Store type")}<select value={newStore.storeType} onChange={e => setNewStore({ ...newStore, storeType: e.target.value, tableCount: e.target.value === 'restaurant' ? 1 : 0 })}><option value="retail">{ot("Retail / kirana")}</option><option value="restaurant">{ot("Restaurant")}</option><option value="services">{ot("Services")}</option></select></label>{newStore.storeType === 'restaurant' && <label>{ot("Number of tables")}<input type="number" min="1" max="100" required value={newStore.tableCount} onChange={e => setNewStore({ ...newStore, tableCount: Number(e.target.value) })}/></label>}<button className="btn btn-green" disabled={busy}><Busy active={actionKey === 'action'}>{busy ? ot("Creating...") : ot("Create store")}</Busy></button></form></div>
      </div>}
      </>}
    </TabBoundary>}
  </div>
  {editing && <ProductModal restaurant={data?.business?.storeType === 'restaurant'} categories={categories} product={editing} busy={busy} onClose={() => setEditing(null)} onSave={saveProduct}/>}
  </AdminShell>;
}
