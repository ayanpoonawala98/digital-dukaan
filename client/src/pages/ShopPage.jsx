import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, Clock, Heart, MapPin, MessageCircle, Minus, Package, Plus, QrCode, Search, Share2, ShoppingBag, Star, Trash2, X } from 'lucide-react';
import { api, imageSrc, inr } from '../lib/api.js';
import { storeLink, storePath } from '../lib/store-domain.js';
import { translate } from '../lib/i18n.js';
import RestaurantCheckout from '../components/RestaurantCheckout.jsx';
import { useCart, useOrders, useWishlist } from '../lib/shop.js';
import { Footer, Header } from '../components/chrome.jsx';

function useShop(slug) {
  const [shop, setShop] = useState(null), [error, setError] = useState('');
  useEffect(() => { api(`/public/stores/${slug}`).then(setShop).catch(e => setError(e.message)); }, [slug]);
  return { shop, error };
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function PushPrompt({ slug, business }) {
  const [state, setState] = useState('hidden');
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'default') return;
    if (localStorage.getItem(`dd-push-dismissed-${slug}`)) return;
    const t = setTimeout(async () => {
      try {
        const { vapidPublicKey } = await api(`/public/stores/${slug}/push-key`);
        if (vapidPublicKey) setState('ask');
      } catch {}
    }, 6000);
    return () => clearTimeout(t);
  }, [slug]);
  const subscribe = async () => {
    try {
      const { vapidPublicKey } = await api(`/public/stores/${slug}/push-key`);
      const reg = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState('hidden');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidPublicKey) });
      const json = sub.toJSON();
      await api(`/public/stores/${slug}/push-subscription`, { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
      setState('done');
      setTimeout(() => setState('hidden'), 3000);
    } catch { setState('hidden'); }
  };
  const dismiss = () => { localStorage.setItem(`dd-push-dismissed-${slug}`, '1'); setState('hidden'); };
  if (state === 'hidden') return null;
  return <div className="push-prompt anim-up">
    {state === 'done'
      ? <><Bell size={20}/><div><strong>You're subscribed!</strong><p>We'll ping you about new stock and offers from {business.name}.</p></div></>
      : <><Bell size={20}/><div><strong>Never miss fresh stock</strong><p>Get offers and new arrivals from {business.name} as notifications.</p></div>
        <div className="push-actions"><button className="btn btn-green btn-small" onClick={subscribe}>Notify me</button><button className="btn-ghost" onClick={dismiss}>Not now</button></div></>}
  </div>;
}

function QrModal({ slug, business, onClose }) {
  const BASE = import.meta.env.VITE_API_URL || '';
  const qrUrl = `${BASE}/api/public/stores/${slug}/qr`;
  const shopLink = storeLink(slug);
  const [copied, setCopied] = useState(false);
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal qr-modal anim-pop">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X/></button>
      <span className="kicker">SHARE THIS SHOP</span>
      <h2>Scan to open {business.name}</h2>
      <div className="qr-frame"><img src={qrUrl} alt={`QR code for ${business.name}`}/></div>
      <div className="url-pill">{shopLink}</div>
      <div className="qr-actions">
        <a className="btn btn-green" href={qrUrl} download={`${slug}-qr.svg`}>Download QR</a>
        <button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(shopLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
    </div>
  </div>;
}

function CartDrawer({ slug, business, cart, orders, open, onClose, lang }) {
  const t = key => translate(lang, key);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [couponCode, setCouponCode] = useState(''), [referralCode, setReferralCode] = useState(() => new URLSearchParams(window.location.search).get('ref') || '');
  const freeAbove = business.freeDeliveryAbove;
  const delivery = freeAbove !== null && freeAbove !== undefined && cart.subtotal >= freeAbove ? 0 : Number(business.deliveryCharge || 0);
  const total = cart.subtotal + delivery;
  const belowMin = business.minOrder > 0 && cart.subtotal < business.minOrder;
  const checkout = async () => {
    setBusy(true); setError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { url, total: confirmedTotal } = await api(`/public/stores/${slug}/enquire-cart`, { method: 'POST', body: { items: cart.items.map(i => ({ id: i.id, qty: i.qty })), couponCode: couponCode.trim().toUpperCase(), referralCode: referralCode.trim().toUpperCase() } });
      orders.record(cart.items, confirmedTotal);
      cart.clear();
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { if (tab) tab.close(); setError(e.message); } finally { setBusy(false); }
  };
  if (!open) return null;
  return <div className="drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer anim-slide">
      <div className="drawer-head"><h3><ShoppingBag size={20}/> Your cart {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}</h3><button className="icon-btn" onClick={onClose} aria-label="Close cart"><X size={20}/></button></div>
      {!business.isOpen && <p className="notice warn"><Clock size={15}/> The shop is closed right now. You can still send your order - it will be confirmed when the shop opens.</p>}
      {!cart.items.length ? <div className="empty-state"><ShoppingBag size={36}/><h3>Your cart is empty</h3><p>Add items from the shop to order them together on WhatsApp.</p></div> : <>
        <div className="drawer-items">
          {cart.items.map(item => <div className="cart-row" key={item.id}>
            <div className="cart-thumb">{item.imageUrl ? <img src={imageSrc(item.imageUrl)} alt=""/> : <Package size={20}/>}</div>
            <div className="cart-info"><strong>{item.name}</strong><span>{inr(item.price)}</span></div>
            <div className="qty-stepper">
              <button onClick={() => cart.setQty(item.id, item.qty - 1)} aria-label="Decrease"><Minus size={14}/></button>
              <span>{item.qty}</span>
              <button onClick={() => cart.setQty(item.id, item.qty + 1)} disabled={item.stock !== null && item.stock !== undefined && item.qty >= item.stock} aria-label="Increase"><Plus size={14}/></button>
            </div>
            <button className="icon-btn danger" onClick={() => cart.setQty(item.id, 0)} aria-label={`Remove ${item.name}`}><Trash2 size={16}/></button>
          </div>)}
        </div>
        <div className="drawer-totals">
          <div><span>Subtotal</span><b>{inr(cart.subtotal)}</b></div>
          <div><span>Delivery {freeAbove ? `(free above ${inr(freeAbove)})` : ''}</span><b>{delivery === 0 ? 'FREE' : inr(delivery)}</b></div>
          <div className="grand"><span>Total</span><b>{inr(total)}</b></div>
        </div>
        <label className="coupon-field">Referral code <small>(optional; rewards only after confirmation)</small><input value={referralCode} onChange={e => setReferralCode(e.target.value)} maxLength={24} placeholder="FR..."/></label>
        <label className="coupon-field">Coupon code <small>(optional)</small><input value={couponCode} onChange={e => setCouponCode(e.target.value)} maxLength={24} placeholder="SAVE10"/></label>
        {couponCode && <p className="drawer-hint">The shop verifies the code before opening WhatsApp. Total above does not include a possible discount.</p>}
        {belowMin && <p className="notice warn">Minimum order is {inr(business.minOrder)}. Add {inr(business.minOrder - cart.subtotal)} more.</p>}
        {error && <p className="notice error">{error}</p>}
        <button className="btn btn-green full" disabled={busy || belowMin} onClick={checkout}>{busy ? 'Opening WhatsApp...' : t('cart')} <ArrowUpRight size={18}/></button>
        <p className="drawer-hint">Your order opens as a WhatsApp message to {business.name}. Nothing is charged online.</p>
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

function ProductCard({ product, slug, wishlist, cart, index }) {
  const out = product.stock === 0;
  const low = product.stock !== null && product.stock > 0 && product.stock <= 5;
  return <article className={`product-card anim-up ${out ? 'sold-out' : ''}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
    <Link to={storePath(slug, product.id)} className="product-img">
      {product.imageUrl ? <img src={imageSrc(product.imageUrl)} alt={product.name} loading="lazy"/> : <span><Package size={40}/></span>}
      {product.featured && <span className="chip chip-star"><Star size={12}/> Popular</span>}
      {product.kind === 'service' && <span className="chip chip-service">{product.duration || 'Service'}</span>}
      {product.kind !== 'service' && out && <span className="chip chip-out">Out of stock</span>}
      {product.kind !== 'service' && low && <span className="chip chip-low">Only {product.stock} left</span>}
      <span className="view-tag">View product <ArrowUpRight size={14}/></span>
    </Link>
    <button className={`heart-btn ${wishlist.has(product.id) ? 'active' : ''}`} onClick={() => wishlist.toggle(product.id)} aria-label="Save to favorites"><Heart size={17}/></button>
    <div className="product-meta">
      <span>{product.category?.name || 'PRODUCT'}</span>
      <h3><Link to={storePath(slug, product.id)}>{product.name}</Link></h3>
      <div className="product-bottom">
        <b>{inr(product.price)}</b>
        <div className="product-actions">
          {(!out || product.kind === 'service') && <button className="icon-btn cart-add" onClick={() => cart.add(product)} aria-label={`Add ${product.name} to cart`}><ShoppingBag size={16}/></button>}
          <Link className="round-arrow" aria-label={`View ${product.name}`} to={storePath(slug, product.id)}><ArrowUpRight size={19}/></Link>
        </div>
      </div>
    </div>
  </article>;
}

function StoreClosed() { return <ShoppingBag size={42} aria-hidden="true"/>; }

export default function ShopPage({ hostedSlug }) {
  const { slug: pathSlug } = useParams();
  const slug = hostedSlug || pathSlug;
  const { shop, error } = useShop(slug);
  const [products, setProducts] = useState([]), [search, setSearch] = useState(''), [category, setCategory] = useState(''), [loading, setLoading] = useState(true);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('dd-language') || 'en'; } catch { return 'en'; } });
  const t = key => translate(lang, key);
  const setLanguage = next => { setLang(next); try { localStorage.setItem('dd-language', next); } catch {} };
  const [offerOpen, setOfferOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false), [wishOpen, setWishOpen] = useState(false), [qrOpen, setQrOpen] = useState(false);
  const cart = useCart(slug), wishlist = useWishlist(slug), orders = useOrders(slug);

  useEffect(() => {
    if (shop?.paused) { setProducts([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    const t = setTimeout(() => api(`/public/stores/${slug}/products?${new URLSearchParams({ search, category })}`).then(r => { if (active) setProducts(r.products); }).catch(() => {}).finally(() => { if (active) setLoading(false); }), 200);
    return () => { active = false; clearTimeout(t); };
  }, [slug, search, category, shop?.paused]);

  useEffect(() => { if (!shop?.business?.offerPopupActive || !shop.business.offerPopupText) return; const key = `dd-offer-seen-${slug}-${shop.business.offerPopupText}`; if (sessionStorage.getItem(key)) return; const timer = setTimeout(() => setOfferOpen(true), 1100); return () => clearTimeout(timer); }, [shop, slug]);
  const dismissOffer = () => { try { sessionStorage.setItem(`dd-offer-seen-${slug}-${shop.business.offerPopupText}`, 'yes'); } catch {} setOfferOpen(false); };

  if (error) return <><Header/><div className="container empty-state page-fade"><h2>Shop not found</h2><p>{error}</p><Link to="/">Back home</Link></div></>;
  if (!shop) return <div className="container empty-state">Loading shop...</div>;
  if (shop.paused) return <><Header/><main className="container empty-state page-fade paused-store" role="status"><StoreClosed/><h1>{shop.business.name} is temporarily closed</h1><p>This shop is paused right now. Please check back later.</p><Link className="btn btn-green" to="/">Back home</Link></main><Footer/></>;
  const { business, categories } = shop;
  const accent = business.accentColor || '';

  return <div className="shop-root page-fade" style={accent ? { '--accent': accent } : undefined}>
    <Header shop={slug}/>
    {business.bannerActive && business.bannerText && <div className="offer-banner"><div className="offer-track"><span>{business.bannerText}</span><span aria-hidden="true">{business.bannerText}</span></div></div>}
    <main>
      <div className="store-banner" style={business.coverUrl ? { backgroundImage: `linear-gradient(rgba(20,18,14,.55), rgba(20,18,14,.72)), url(${imageSrc(business.coverUrl)})` } : undefined}>
        <div className="container">
          <div className="store-identity">
            {business.logoUrl && <img className="store-logo" src={imageSrc(business.logoUrl)} alt={`${business.name} logo`}/>}
            <span className={`open-pill ${business.isOpen ? 'open' : 'closed'}`}><Clock size={14}/> {business.isOpen ? 'Open now' : 'Closed'}{business.openingHours ? ` · ${business.openingHours}` : ''}</span>
          </div>
          <h1>{business.name}<span>.</span></h1>
          <p>{business.description || 'Thoughtfully picked. Just for you.'}</p>
          <div className="store-banner-bottom">
            <span><MapPin size={15}/> {business.location || 'Made with care'}</span>
            <div className="store-banner-actions">
              <button className="chip-btn" onClick={() => setQrOpen(true)}><QrCode size={16}/> Share shop</button>
              <button className="chip-btn" onClick={() => setWishOpen(true)}><Heart size={16}/> Favorites {wishlist.ids.length > 0 && `(${wishlist.ids.length})`}</button>
            </div>
          </div>
        </div>
      </div>
      <div className="container catalog"><label className="language-select">Language / भाषा / भाषा निवडा <select aria-label="Storefront language" value={lang} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>
        <div className="catalog-head"><div><span className="kicker">{business.storeType === 'restaurant' ? 'THE MENU' : 'CURATED FOR YOU'}</span><h2>{business.storeType === 'restaurant' ? t('menu') : t('collection')}<span className="accent-dot">.</span></h2></div><span>{products.length} PRODUCTS</span></div>
        <div className="catalog-tools">
          <div className="filter-tabs"><button className={!category ? 'active' : ''} onClick={() => setCategory('')}>{t('all')}</button>{categories.map(c => <button key={c.id} className={category === c.slug ? 'active' : ''} onClick={() => setCategory(c.slug)}>{c.name}</button>)}</div>
          <label className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')}/></label>
        </div>
        {loading
          ? <div className="product-grid">{Array.from({ length: 6 }).map((_, i) => <div className="product-card skeleton" key={i}><div className="product-img shimmer"/><div className="product-meta"><span className="shimmer-line"/><h3 className="shimmer-line wide"/></div></div>)}</div>
          : products.length
            ? <div className="product-grid">{products.map((p, i) => <ProductCard key={p.id} product={p} slug={slug} wishlist={wishlist} cart={cart} index={i}/>)}</div>
            : <div className="empty-state"><Package size={38}/><h3>Nothing here yet</h3><p>Try a different search or category.</p></div>}
      </div>
      {business.storeType !== 'restaurant' && orders.orders.length > 0 && <div className="container order-history">
        <div className="catalog-head"><div><span className="kicker">YOUR HISTORY</span><h2>Order again<span className="accent-dot">.</span></h2></div></div>
        <div className="order-history-list">{orders.orders.map((order, i) => <div className="order-card" key={i}>
          <div><strong>{order.items.reduce((s, x) => s + x.qty, 0)} items · {inr(order.total)}</strong><small>{new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {order.items.slice(0, 3).map(x => x.name).join(', ')}{order.items.length > 3 ? '…' : ''}</small></div>
          <button className="btn btn-outline btn-small" onClick={() => { order.items.forEach(item => cart.add(item, item.qty)); setCartOpen(true); }}>Repeat order</button>
        </div>)}</div>
      </div>}
      <div className="store-end"><div className="container"><span>{business.storeType === 'restaurant' ? 'FRESHLY MADE FOR YOU ✳' : 'GOOD THINGS START WITH A CONVERSATION ✳'}</span><h2>{business.storeType === 'restaurant' ? 'Hungry? Order from the menu.' : <>Like something? <em>Let's talk.</em></>}</h2><p>{business.storeType === 'restaurant' ? 'Dine in, take away, or order delivery. Your order goes straight to the restaurant.' : "Pick a product and message us on WhatsApp. We'd love to hear from you."}</p></div></div>
    </main>
    <Footer><span>{business.name} · Powered by Digital Dukaan</span></Footer>
    {cart.count > 0 && !cartOpen && <button className="cart-fab anim-pop" onClick={() => setCartOpen(true)} aria-label="Open cart"><ShoppingBag size={22}/><span className="cart-badge">{cart.count}</span><b>{inr(cart.subtotal)}</b></button>}
    {offerOpen && <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Offer from this store"><div className="modal offer-popup"><button className="modal-close" onClick={dismissOffer} aria-label="Close offer"><X/></button>{business.offerPopupImageUrl && <img src={imageSrc(business.offerPopupImageUrl)} alt="Store offer"/>}<span className="kicker">A SPECIAL OFFER</span><h2>{business.name}</h2><p>{business.offerPopupText}</p><button className="btn btn-green" onClick={dismissOffer}>Browse store</button></div></div>}
    {business.storeType === 'restaurant' ? <RestaurantCheckout slug={slug} business={business} cart={cart} open={cartOpen} onClose={() => setCartOpen(false)} lang={lang}/> : <CartDrawer slug={slug} business={business} cart={cart} orders={orders} open={cartOpen} onClose={() => setCartOpen(false)} lang={lang}/>}
    <WishlistDrawer slug={slug} wishlist={wishlist} open={wishOpen} onClose={() => setWishOpen(false)}/>
    {qrOpen && <QrModal slug={slug} business={business} onClose={() => setQrOpen(false)}/>}
    <PushPrompt slug={slug} business={business}/>
  </div>;
}
