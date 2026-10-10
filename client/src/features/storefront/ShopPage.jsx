import { useShowcaseScroll } from './showcase-scroll.js';
import { useProductPages } from '../dashboard/use-product-pages.js';
import { storeImage } from './store-image.js';
import {downloadShopCard} from './shop-card-download.js';
import { shouldInvite, hasSeenPushInvite, rememberPushInvite } from './push-prompt.js';
import ClosedBanner, { hoursLabel } from './ClosedBanner.jsx';
import { notify } from '../notifications/notifications.js';
import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import { storeThemeStyle } from './store-theme.js';
import { useTheme } from '../../app/theme.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, Clock, Heart, Phone, MapPin, MessageCircle, Download, Minus, Package, Plus, QrCode, Search, Share2, ShoppingBag, Star, Trash2, X } from 'lucide-react';
import { api, imageSrc, inr } from '../../shared/lib/api.js';
import { storeLink, storePath } from './store-domain.js';
import { translate } from '../../shared/lib/i18n.js';
import { CustomFieldInputs, missingRequired } from '../dashboard/CustomFields.jsx';
import ContactFields, { contactBody, useContact } from '../../shared/components/ContactFields.jsx';
import RestaurantCheckout from '../restaurant/RestaurantCheckout.jsx';
import MenuItemSheet from '../restaurant/MenuItemSheet.jsx';
import { MenuViewSwitch, useMenuView, groupByCategory } from '../restaurant/MenuViewSwitch.jsx';
import { VegDot, TagChips } from '../restaurant/MenuBits.jsx';
import { saveOrder, pushSupported, currentBrowserSubscription, subscribeBrowser } from './my-orders.js';
import { useCart, useOrders, useWishlist } from './shop.js';
import { Footer, Header } from '../../shared/components/chrome.jsx';
import LoadSkeleton from '../../shared/components/LoadSkeleton.jsx';
import BrandLoader from '../../shared/components/BrandLoader.jsx';
import OfferPopup from './OfferPopup.jsx';

function useShop(slug) {
  const [shop, setShop] = useState(null), [error, setError] = useFeedbackState('');
  useEffect(() => { api(`/public/stores/${slug}`).then(setShop).catch(e => setError(e.message)); }, [slug]);
  return { shop, error };
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function PushPrompt({ slug, business, blocked = false }) {
  const [state, setState] = useState('loading'), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const supported = pushSupported();
  useEffect(() => { setOpen(false); }, [slug]);
  useEffect(() => {
    let active = true;
    setError(''); setState('loading');
    if (!supported) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    currentBrowserSubscription().then(sub => {
      if (!active) return;
      let saved = ''; try { saved = localStorage.getItem(`dd-store-push-${slug}`); } catch {}
      const enabled = sub && saved === sub.endpoint;
      if (enabled) rememberPushInvite('subscribed');
      setState(enabled ? 'on' : 'ask');
    });
    return () => { active = false; };
  }, [slug, supported]);
  useEffect(() => {
    if (!shouldInvite({ state, blocked, seen: hasSeenPushInvite() })) return;
    const timer = setTimeout(() => {
      if (hasSeenPushInvite()) return;
      rememberPushInvite('shown');
      setOpen(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [state, blocked, slug]);
  const dismiss = () => { rememberPushInvite('dismissed'); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === 'Escape' && state !== 'busy') dismiss(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, state]);
  const subscribe = async () => {
    setError(''); setState('busy');
    try {
      const sub = await subscribeBrowser(slug);
      await api(`/public/stores/${encodeURIComponent(slug)}/push-subscription`, { method: 'POST', body: { endpoint: sub.endpoint, keys: sub.keys } });
      try { localStorage.setItem(`dd-store-push-${slug}`, sub.endpoint); } catch {}
      rememberPushInvite('subscribed'); setState('on'); setOpen(false);
    } catch (err) {
      setState(Notification.permission === 'denied' ? 'denied' : 'ask');
      setError(err.message || 'Could not enable notifications. Try again.');
    }
  };
  return <div className="store-notify-widget">{!open ? <button type="button" className={`notify-fab ${state === 'on' ? 'enabled' : ''}`} onClick={() => { rememberPushInvite('manual'); setOpen(true); }} aria-label={state === 'on' ? 'Shop notifications enabled' : 'Open shop notifications'}><Bell size={22}/>{state === 'on' && <span className="notify-fab-check">✓</span>}</button> : <section className="push-prompt storefront-notify-popup" role="dialog" aria-label="Shop notifications">
    <button type="button" className="notify-close" onClick={dismiss} aria-label="Close notification popup" disabled={state === 'busy'}><X size={18}/></button>
    <Bell size={20}/><div className="push-text"><strong>{state === 'on' ? 'Shop notifications on' : 'Stay updated with this shop'}</strong>
    <span>{state === 'unsupported' ? 'Open in Chrome on Android, or add this shop to your iPhone home screen and open the app, to enable notifications.' : state === 'denied' ? 'Notifications are blocked. Allow them for this site in your browser settings, then reload.' : state === 'on' ? `Offers and new arrivals from ${business.name} will appear as browser notifications.` : `Get offers and new arrivals from ${business.name}.`}</span>
    {error && <span role="alert">{error}</span>}</div>
    <button type="button" className="btn btn-green btn-small" onClick={subscribe} disabled={['loading','busy','unsupported','denied','on'].includes(state)}>{state === 'on' ? 'Notifications on' : state === 'busy' ? 'Turning on...' : state === 'loading' ? 'Checking...' : state === 'denied' ? 'Blocked in browser' : state === 'unsupported' ? 'Browser not supported' : 'Notify me'}</button>
    <button type="button" className="notify-later" onClick={dismiss} disabled={state === 'busy'}>Not now</button>
    <small className="notify-privacy">Optional. You can use the bell anytime. We will not ask again on every visit.</small>
  </section>}</div>;
}

function InstallApp({ name, t = k => k }) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const capture = event => { event.preventDefault(); setPrompt(event); };
    const finish = () => { setInstalled(true); setPrompt(null); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', finish);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', finish); };
  }, []);
  if (installed) return null;
  const install = async () => {
    if (!prompt) { setInstructions(value => !value); return; }
    setBusy(true);
    try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setInstructions(true); }
    finally { setBusy(false); }
  };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return <div className="install-app"><button type="button" className="chip-btn" disabled={busy} onClick={install} aria-expanded={instructions}><Download size={16}/>{busy ? 'Opening install...' : t('install')}</button>{instructions && <div className="install-guide" role="status"><strong>Put {name} on your home screen</strong><span>{ios ? 'In Safari, tap Share, then Add to Home Screen.' : 'In your browser menu, choose Install app or Add to Home screen.'}</span><button type="button" onClick={() => setInstructions(false)} aria-label="Close install instructions"><X size={15}/></button></div>}</div>;
}

function QrModal({ slug, business, onClose }) {
  const BASE = import.meta.env.VITE_API_URL || '';
  const qrUrl = `${BASE}/api/public/stores/${slug}/qr`;
  const shopLink = storeLink(slug);
  const [copied, setCopied] = useState(false), [downloading,setDownloading]=useState('');
  const save=async format=>{setDownloading(format);try{await downloadShopCard(slug,format);}catch{}finally{setDownloading('');}};
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal qr-modal anim-pop">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X/></button>
      <span className="kicker">SHARE THIS SHOP</span>
      <h2>Scan to open {business.name}</h2>
      <div className="qr-frame qr-themed-online"><img src={qrUrl} alt={`QR code for ${business.name}`}/></div>
      <div className="url-pill">{shopLink}</div>
      <div className="qr-actions">
        <button className="btn btn-green" disabled={!!downloading} onClick={()=>save('png')}>{downloading==='png'?'Preparing...':'Download image'}</button><button className="btn btn-outline" disabled={!!downloading} onClick={()=>save('pdf')}>{downloading==='pdf'?'Preparing...':'Download PDF'}</button>
        <button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(shopLink); notify('success', 'Link copied.'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { notify('error', 'Could not copy the link. Please copy it manually.'); } }}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
    </div>
  </div>;
}

function CartDrawer({ slug, business, cart, orders, open, onClose, lang }) {
  const t = key => translate(lang, key);
  const [contact, setContact] = useContact();
  const [busy, setBusy] = useState(false), [error, setError] = useFeedbackState(''), [couponCode, setCouponCode] = useState(''), [referralCode, setReferralCode] = useState(() => new URLSearchParams(window.location.search).get('ref') || '');
  const freeAbove = business.freeDeliveryAbove;
  const delivery = freeAbove !== null && freeAbove !== undefined && cart.subtotal >= freeAbove ? 0 : Number(business.deliveryCharge || 0);
  const total = cart.subtotal + delivery;
  const belowMin = business.minOrder > 0 && cart.subtotal < business.minOrder;
  const unanswered = cart.items.find(i => missingRequired(i.customFields, i.answers).length);
  const checkout = async () => {
    setBusy(true); setError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { url, total: confirmedTotal, tracking } = await api(`/public/stores/${slug}/enquire-cart`, { method: 'POST', body: { items: cart.items.map(i => ({ id: i.id, qty: i.qty, answers: i.answers || {} })), couponCode: couponCode.trim().toUpperCase(), referralCode: referralCode.trim().toUpperCase(), ...contactBody(contact) } });
      orders.record(cart.items, confirmedTotal);
      if (tracking) saveOrder(slug, { kind: 'lead', id: tracking.id, token: tracking.token, total: tracking.total });
      cart.clear();
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { if (tab) tab.close(); setError(e.message); } finally { setBusy(false); }
  };
  if (!open) return null;
  return <div className="drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer anim-slide">
      <div className="drawer-head"><h3><ShoppingBag size={20}/> {t('cartTitle')} {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}</h3><button className="icon-btn" onClick={onClose} aria-label="Close cart"><X size={20}/></button></div>
      {!business.isOpen && <p className="notice warn"><Clock size={15}/> {business.blocksOrders ? 'The shop is closed right now and is not taking orders.' : 'The shop is closed right now. You can still send your order - it will be confirmed when the shop opens.'}</p>}
      {!cart.items.length ? <div className="empty-state"><ShoppingBag size={36}/><h3>{t('cartEmpty')}</h3><p>{t('cartEmptyHint')}</p><Link className="btn btn-outline btn-small" to={`/store/${slug}/orders`}>{t('myOrders')}</Link></div> : <>
        <div className="drawer-items">
          {cart.items.map(item => <div className="cart-row" key={item.id}>
            <div className="cart-thumb">{item.imageUrl ? <img src={imageSrc(item.imageUrl)} alt=""/> : <Package size={20}/>}</div>
            <div className="cart-info"><strong>{item.name}</strong><span>{inr(item.price)}</span><CustomFieldInputs compact fields={item.customFields} answers={item.answers} onChange={a => cart.setAnswers(item.id, a)}/></div>
            <div className="qty-stepper">
              <button onClick={() => cart.setQty(item.id, item.qty - 1)} aria-label="Decrease"><Minus size={14}/></button>
              <span>{item.qty}</span>
              <button onClick={() => cart.setQty(item.id, item.qty + 1)} disabled={item.stock !== null && item.stock !== undefined && item.qty >= item.stock} aria-label="Increase"><Plus size={14}/></button>
            </div>
            <button className="icon-btn danger" onClick={() => cart.setQty(item.id, 0)} aria-label={`Remove ${item.name}`}><Trash2 size={16}/></button>
          </div>)}
        </div>
        <div className="drawer-totals">
          <div><span>{t('subtotal')}</span><b>{inr(cart.subtotal)}</b></div>
          <div><span>{t('deliveryLbl')} {freeAbove ? `(free above ${inr(freeAbove)})` : ''}</span><b>{delivery === 0 ? t('freeLbl') : inr(delivery)}</b></div>
          <div className="grand"><span>{t('totalLbl')}</span><b>{inr(total)}</b></div>
        </div>
        <ContactFields contact={contact} onChange={setContact}/>
        <label className="coupon-field">{t('referral')}<input value={referralCode} onChange={e => setReferralCode(e.target.value)} maxLength={24} placeholder="FR..."/></label>
        <label className="coupon-field">{t('couponOpt')}<input value={couponCode} onChange={e => setCouponCode(e.target.value)} maxLength={24} placeholder="SAVE10"/></label>
        {couponCode && <p className="drawer-hint">The shop verifies the code before opening WhatsApp. Total above does not include a possible discount.</p>}
        {unanswered && <p className="notice warn">{t('answerReq').replace('{name}', unanswered.name)}</p>}{belowMin && <p className="notice warn">Minimum order is {inr(business.minOrder)}. Add {inr(business.minOrder - cart.subtotal)} more.</p>}
        {error && <p className="notice error">{error}</p>}
        <button className="btn btn-green full" disabled={busy || belowMin || Boolean(unanswered) || business.blocksOrders} onClick={checkout}>{busy ? t('opening') : t('cart')} <ArrowUpRight size={18}/></button>
        <p className="drawer-hint">{t('noCharge')}</p>
      </>}
    </aside>
  </div>;
}

function WishlistDrawer({ slug, wishlist, open, onClose }) {
  const [products, setProducts] = useState([]);
  useEffect(() => { if (open) api(`/public/stores/${slug}/products`).then(r => setProducts(r.products.filter(p => wishlist.ids.includes(p.id)))).catch(() => {}); }, [open, wishlist.ids, slug]);
  if (!open) return null;
  return <div className="drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer anim-slide">
      <div className="drawer-head"><h3><Heart size={20}/> Saved favorites</h3><button className="icon-btn" onClick={onClose} aria-label="Close wishlist"><X size={20}/></button></div>
      {!products.length ? <div className="empty-state"><Heart size={36}/><h3>No favorites yet</h3><p>Tap the heart on any product to save it here.</p></div>
        : <div className="drawer-items">{products.map(p => <Link to={storePath(slug, p.id)} className="cart-row" key={p.id} onClick={onClose}>
          <div className="cart-thumb">{p.imageUrl ? <img src={imageSrc(p.imageUrl)} alt=""/> : <Package size={20}/>}</div>
          <div className="cart-info"><strong>{p.name}</strong><span>{inr(p.price)}</span></div>
          <button className="icon-btn danger" onClick={e => { e.preventDefault(); wishlist.toggle(p.id); }} aria-label="Remove from favorites"><X size={16}/></button>
        </Link>)}</div>}
    </aside>
  </div>;
}

function animateToCart(source) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector('.cart-fab') || document.querySelector('.header .cart-badge');
  const start = source?.getBoundingClientRect(), end = target?.getBoundingClientRect();
  if (!start || !end) return;
  const bubble = document.createElement('span');
  bubble.className = 'cart-fly'; bubble.textContent = '+1';
  bubble.style.left = `${start.left + start.width / 2}px`; bubble.style.top = `${start.top + start.height / 2}px`;
  document.body.appendChild(bubble);
  const animation = bubble.animate([{ opacity:1, transform:'translate(-50%,-50%) scale(1)' }, { opacity:.8, transform:`translate(${end.left + end.width / 2 - start.left - start.width / 2}px, ${end.top + end.height / 2 - start.top - start.height / 2}px) scale(.35)` }], { duration:650, easing:'cubic-bezier(.22,1,.36,1)' });
  animation.onfinish = () => bubble.remove(); setTimeout(() => bubble.remove(), 800);
}

function ProductCard({ product, slug, wishlist, cart, index, t }) {
  const out = product.stock === 0;
  const low = product.stock !== null && product.stock > 0 && product.stock <= 5;
  return <article className={`product-card anim-up ${out ? 'sold-out' : ''}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
    <Link to={storePath(slug, product.id)} className="product-img">
      {product.imageUrl ? <img src={storeImage(imageSrc(product.imageUrl), 720)} alt={product.name} loading="lazy"/> : <span><Package size={40}/></span>}
      {product.featured && <span className="chip chip-star"><Star size={12}/> {t('bestseller')}</span>}
      {!product.featured && Date.now() - new Date(product.createdAt).getTime() < 30 * 86400000 && <span className="chip chip-new">{t('fresh')}</span>}
      {product.kind === 'service' && <span className="chip chip-service">{product.duration || 'Service'}</span>}
      {product.kind !== 'service' && out && <span className="chip chip-out">{t('outOfStock')}</span>}
      {product.kind !== 'service' && low && <span className="chip chip-low">{t('onlyLeft').replace('{n}', product.stock)}</span>}
      <span className="view-tag">{t('view')} <ArrowUpRight size={14}/></span>
    </Link>
    <button className={`heart-btn ${wishlist.has(product.id) ? 'active' : ''}`} onClick={() => wishlist.toggle(product.id)} aria-label="Save to favorites"><Heart size={17}/></button>
    <div className="product-meta">
      <span>{product.category?.name || 'PRODUCT'}</span>
      <h3><Link to={storePath(slug, product.id)}>{product.name}</Link></h3>
      <div className="product-bottom">
        <b>{inr(product.price)}</b>
        <div className="product-actions">
          {(!out || product.kind === 'service') && <button className="icon-btn cart-add" onClick={e => { animateToCart(e.currentTarget); cart.add(product); }} aria-label={`Add ${product.name} to cart`}><ShoppingBag size={16}/></button>}
          <Link className="round-arrow" aria-label={`View ${product.name}`} to={storePath(slug, product.id)}><ArrowUpRight size={19}/></Link>
        </div>
      </div>
    </div>
  </article>;
}

function RestaurantCard({ product, slug, cart, index, blocked }) {
  const [sheet, setSheet] = useState(false);
  const out = product.stock === 0 || product.soldOutToday;
  const hasOptions = (product.variants || []).length > 0 || (product.addonGroups || []).length > 0;
  const from = (product.variants || []).length ? Math.min(...product.variants.map(v => Number(v.price))) : Number(product.price);
  const inCart = cart.items.filter(i => i.id === product.id).reduce((n, i) => n + i.qty, 0);
  const add = e => { if (hasOptions) setSheet(true); else { animateToCart(e.currentTarget); cart.add(product); } };
  return <article className={`menu-card anim-up ${out ? 'sold-out' : ''}`} style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
    <div className="menu-card-text">
      <div className="menu-card-title"><VegDot veg={product.veg}/><h3><Link to={storePath(slug, product.id)}>{product.name}</Link></h3></div>
      <TagChips tags={[...(product.tags || []), ...(product.featured && !(product.tags || []).includes('bestseller') ? ['bestseller'] : [])]}/>
      <b className="menu-price">{(product.variants || []).length ? 'From ' : ''}{inr(from)}</b>
      {product.description && <p className="menu-desc">{product.description}</p>}
      {hasOptions && !out && <small className="muted">Customisable</small>}
    </div>
    <div className="menu-card-media">
      <Link to={storePath(slug, product.id)} className="menu-img">{product.imageUrl ? <img src={storeImage(imageSrc(product.imageUrl), 480)} alt={product.name} loading="lazy"/> : <span><Package size={32}/></span>}</Link>
      {out ? <span className="menu-out">Sold out today</span> : <button className="menu-add" disabled={blocked} onClick={add} aria-label={`Add ${product.name}`}>{inCart > 0 ? `ADD · ${inCart}` : 'ADD'}<Plus size={14}/></button>}
    </div>
    {sheet && <MenuItemSheet product={product} onClose={() => setSheet(false)} onAdd={(qty, config) => { cart.add(product, qty, undefined, config); setSheet(false); }}/>}
  </article>;
}

function MenuRow({ product, slug, cart, blocked }) {
  const [sheet, setSheet] = useState(false);
  const out = product.stock === 0 || product.soldOutToday;
  const hasOptions = (product.variants || []).length > 0 || (product.addonGroups || []).length > 0;
  const from = (product.variants || []).length ? Math.min(...product.variants.map(v => Number(v.price))) : Number(product.price);
  const inCart = cart.items.filter(i => i.id === product.id).reduce((n, i) => n + i.qty, 0);
  const add = e => { if (hasOptions) setSheet(true); else { animateToCart(e.currentTarget); cart.add(product); } };
  return <li className={`mc-row ${out ? 'sold-out' : ''}`}>
    <div className="mc-body">
      <div className="mc-line"><span className="mc-name"><VegDot veg={product.veg}/><Link to={storePath(slug, product.id)}>{product.name}</Link></span><i className="mc-dots" aria-hidden="true"/><b className="mc-price">{(product.variants || []).length ? 'From ' : ''}{inr(from)}</b>
        {out ? <span className="mc-out">Sold out</span> : <button className="mc-add" disabled={blocked} onClick={add} aria-label={`Add ${product.name}`}>{inCart > 0 ? <>{inCart}<Plus size={13}/></> : <>Add<Plus size={13}/></>}</button>}</div>
      <TagChips tags={[...(product.tags || []), ...(product.featured && !(product.tags || []).includes('bestseller') ? ['bestseller'] : [])]}/>
    </div>
    {sheet && <MenuItemSheet product={product} onClose={() => setSheet(false)} onAdd={(qty, config) => { cart.add(product, qty, undefined, config); setSheet(false); }}/>}
  </li>;
}

function MenuSections({ products, slug, cart, blocked }) {
  return <div className="mc-sheet">{groupByCategory(products).map(g => <section className="mc-section" key={g.name}>
    <h3 className="mc-title"><span>{g.name}</span></h3>
    <ul className="mc-list">{g.items.map(p => <MenuRow key={p.id} product={p} slug={slug} cart={cart} blocked={blocked}/>)}</ul>
  </section>)}</div>;
}

function TableBar({ slug, business }) {
  const n = Number(new URLSearchParams(window.location.search).get('table'));
  const [sent, setSent] = useState(''), [err, setErr] = useState('');
  if (!Number.isInteger(n) || n < 1 || n > business.tableCount) return null;
  const ask = async kind => { setErr(''); try { await api(`/public/stores/${slug}/table-requests`, { method: 'POST', body: { tableNumber: n, kind } }); setSent(kind); setTimeout(() => setSent(''), 6000); } catch (e) { setErr(e.message); } };
  return <div className="table-bar container" role="region" aria-label="Your table"><strong>Table {n}</strong><span>
    <button className="btn btn-outline btn-small" onClick={() => ask('waiter')} disabled={business.blocksOrders}><Bell size={14}/> {sent === 'waiter' ? 'Waiter called' : 'Call waiter'}</button>
    <button className="btn btn-outline btn-small" onClick={() => ask('bill')} disabled={business.blocksOrders}><Clock size={14}/> {sent === 'bill' ? 'Bill requested' : 'Ask for bill'}</button></span>{err && <small className="error-text" role="alert">{err}</small>}</div>;
}

function StoreClosed() { return <ShoppingBag size={42} aria-hidden="true"/>; }

export default function ShopPage({ hostedSlug }) {
  const { slug: pathSlug } = useParams();
  const slug = hostedSlug || pathSlug;
  const { theme } = useTheme();
  const { shop, error } = useShop(slug);
  useShowcaseScroll(slug, Boolean(shop?.business && !shop.paused));
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [menuView, setMenuView] = useMenuView(slug);
  const {products,loading,loadingMore,total,hasMore,pageError,loadMore,sentinel} = useProductPages(slug,search,category,shop?.paused);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('dd-language') || 'en'; } catch { return 'en'; } });
  const t = key => translate(lang, key);
  const setLanguage = next => { setLang(next); try { localStorage.setItem('dd-language', next); } catch {} };
  const [offerOpen, setOfferOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false), [wishOpen, setWishOpen] = useState(false), [qrOpen, setQrOpen] = useState(false);
  const cart = useCart(slug), wishlist = useWishlist(slug), orders = useOrders(slug);

  useEffect(() => { if (!shop?.business?.offerPopupActive || !shop.business.offerPopupText) return; const key = `dd-offer-seen-${slug}`; try { if (sessionStorage.getItem(key)) return; } catch {} const timer = setTimeout(() => setOfferOpen(true), 1100); return () => clearTimeout(timer); }, [shop, slug]);
  const dismissOffer = () => { try { sessionStorage.setItem(`dd-offer-seen-${slug}`, 'yes'); } catch {} setOfferOpen(false); };

  if (error) return <><Header/><div className="container empty-state page-fade"><h2>Shop not found</h2><p>{error}</p><Link to="/">Back home</Link></div></>;
  if (!shop) return <><Header/><BrandLoader label="Loading shop"/></>;
  if (shop.paused) return <><Header/><main className="container empty-state page-fade paused-store" role="status"><StoreClosed/><h1>{shop.business.name} is temporarily closed</h1><p>This shop is paused right now. Please check back later.</p><Link className="btn btn-green" to="/">Back home</Link></main><Footer/></>;
  const { business, categories } = shop;
  return <div className="shop-root page-fade" style={storeThemeStyle(business.accentColor, theme === 'dark')}>
    <Header shop={slug} business={business}/>
    <ClosedBanner business={business}/>
    {business.bannerActive && business.bannerText && <div className="offer-banner"><div className="offer-track"><span>{business.bannerText}</span><span aria-hidden="true">{business.bannerText}</span></div></div>}
    <main>
      <div className="store-banner" style={business.coverUrl ? { backgroundImage: `linear-gradient(rgba(20,18,14,.55), rgba(20,18,14,.72)), url(${storeImage(imageSrc(business.coverUrl), 1440)})` } : undefined}>
        <div className="container">
          <div className="store-identity">
            {business.logoUrl && <img className="store-logo" src={storeImage(imageSrc(business.logoUrl), 192)} alt={`${business.name} logo`}/>}
            <span className={`open-pill ${business.isOpen ? 'open' : 'closed'}`}><Clock size={14}/> {business.isOpen ? 'Open now' : 'Closed'}{hoursLabel(business) ? ` · ${hoursLabel(business)}` : ''}</span>
          </div>
          <h1>{business.name}<span>.</span></h1>
          <p>{business.description || t('tagline')}</p>
          <div className="store-banner-bottom">
            <span><MapPin size={15}/> {business.location || 'Made with care'}</span>
            <div className="store-banner-actions">

              <button className="chip-btn" onClick={() => setQrOpen(true)}><QrCode size={16}/> {t('share')}</button>
              <button className="chip-btn" onClick={() => setWishOpen(true)}><Heart size={16}/> {t('favorites')} {wishlist.ids.length > 0 && `(${wishlist.ids.length})`}</button>
            </div>
          </div>
        </div>
      </div>
      <PushPrompt key={slug} slug={slug} business={business} blocked={offerOpen || cartOpen || wishOpen || qrOpen}/>
      {business.storeType === 'restaurant' && <TableBar slug={slug} business={business}/>}
      <div className="container catalog"><label className="language-select">Language / भाषा / भाषा निवडा <select aria-label="Storefront language" value={lang} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>
        <div className="catalog-head"><div><span className="kicker">{business.storeType === 'restaurant' ? 'THE MENU' : 'CURATED FOR YOU'}</span><h2>{business.storeType === 'restaurant' ? t('menu') : t('collection')}<span className="accent-dot">.</span></h2></div>{business.storeType === 'restaurant' ? <MenuViewSwitch view={menuView} onChange={setMenuView}/> : <span>{total} {t('productsCount')}</span>}</div>
        <div className="catalog-tools">
          <div className="filter-tabs" role="group" aria-label="Product categories"><button className={!category ? 'active' : ''} onClick={() => setCategory('')}>{t('all')}</button>{categories.map(c => <button key={c.id} className={category === c.slug ? 'active' : ''} onClick={() => setCategory(c.slug)}>{c.name}</button>)}</div>
          <label className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')}/></label>
        </div>
        {loading
          ? <div className="product-grid">{Array.from({ length: 6 }).map((_, i) => <div className="product-card skeleton" key={i}><div className="product-img shimmer"/><div className="product-meta"><span className="shimmer-line"/><h3 className="shimmer-line wide"/></div></div>)}</div>
          : products.length
            ? business.storeType === 'restaurant' && menuView === 'menu'
              ? <MenuSections products={products} slug={slug} cart={cart} blocked={business.blocksOrders}/>
              : <div className={business.storeType === 'restaurant' ? 'menu-list' : 'product-grid'}>{products.map((p, i) => business.storeType === 'restaurant' ? <RestaurantCard key={p.id} product={p} slug={slug} cart={cart} index={i} blocked={business.blocksOrders}/> : <ProductCard key={p.id} product={p} slug={slug} wishlist={wishlist} cart={cart} index={i} t={t}/>)}</div>
            : <div className="empty-state"><Package size={38}/><h3>{t('empty')}</h3><p>{t('emptyHint')}</p></div>}
        {!loading && (hasMore || pageError) && <div ref={sentinel} className="pagination-sentinel" aria-live="polite">{pageError && <p role="alert">{pageError}</p>}<button type="button" className="btn btn-outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading more...' : pageError ? 'Retry loading products' : 'Load 10 more'}</button><small>{products.length} of {total} products</small></div>}
      </div>
      {business.storeType !== 'restaurant' && orders.orders.length > 0 && <div className="container order-history">
        <div className="catalog-head"><div><span className="kicker">YOUR HISTORY</span><h2>Order again<span className="accent-dot">.</span></h2></div></div>
        <div className="order-history-list">{orders.orders.map((order, i) => <div className="order-card" key={i}>
          <div><strong>{order.items.reduce((s, x) => s + x.qty, 0)} items · {inr(order.total)}</strong><small>{new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {order.items.slice(0, 3).map(x => x.name).join(', ')}{order.items.length > 3 ? '…' : ''}</small></div>
          <button className="btn btn-outline btn-small" onClick={() => { order.items.forEach(item => cart.add(item, item.qty)); setCartOpen(true); }}>Repeat order</button>
        </div>)}</div>
      </div>}
      <div className="store-end"><div className="container"><span>{business.storeType === 'restaurant' ? 'FRESHLY MADE FOR YOU ✳' : t('talkKicker')}</span><h2>{business.storeType === 'restaurant' ? 'Hungry? Order from the menu.' : <>{t('talkTitle')} <em>{t('talkAccent')}</em></>}</h2><p>{business.storeType === 'restaurant' ? 'Dine in, take away, or order delivery. Your order goes straight to the restaurant.' : t('talkBody')}</p><div className="store-contact-actions"><a className="btn btn-green" href={`tel:+${business.whatsapp}`}><Phone size={17}/> {t('callOwner')}</a><a className="btn btn-outline" href={`https://wa.me/${business.whatsapp}?text=${encodeURIComponent(`Hi ${business.name}, I have a question about your shop.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/> {t('whatsappMsg')}</a></div></div></div>
    </main>
    <div className="container store-install-footer"><InstallApp name={business.name} t={t}/></div>
    <Footer><span>{business.name} · Powered by Digital Shop</span></Footer>
    {cart.count > 0 && !cartOpen && <button className="cart-fab anim-pop" onClick={() => setCartOpen(true)} aria-label="Open cart"><ShoppingBag size={22}/><span key={cart.count} className="cart-badge cart-bump">{cart.count}</span><b>{inr(cart.subtotal)}</b></button>}
    {offerOpen && <OfferPopup business={business} onClose={dismissOffer}/>}
    {business.storeType === 'restaurant' ? <RestaurantCheckout slug={slug} business={business} cart={cart} open={cartOpen} onClose={() => setCartOpen(false)} lang={lang}/> : <CartDrawer slug={slug} business={business} cart={cart} orders={orders} open={cartOpen} onClose={() => setCartOpen(false)} lang={lang}/>}
    <WishlistDrawer slug={slug} wishlist={wishlist} open={wishOpen} onClose={() => setWishOpen(false)}/>
    {qrOpen && <QrModal slug={slug} business={business} onClose={() => setQrOpen(false)}/>}
  </div>;
}
