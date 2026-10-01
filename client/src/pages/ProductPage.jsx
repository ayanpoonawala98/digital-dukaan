import { storeThemeStyle } from '../lib/store-theme.js';
import { useTheme } from '../theme.jsx';
import ProductGallery from '../components/ProductGallery.jsx';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Clock, Copy, Heart, MessageCircle, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { api, imageSrc, inr } from '../lib/api.js';
import { storePath } from '../lib/store-domain.js';
import { saveOrder } from '../lib/my-orders.js';
import { useCart, useWishlist } from '../lib/shop.js';
import { Footer, Header } from '../components/chrome.jsx';

function BuyButton({ slug, id, qty, children }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const buy = async () => {
    setBusy(true); setError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { url, tracking } = await api(`/public/stores/${slug}/products/${id}/enquire`, { method: 'POST', body: { qty } });
      if (tracking) saveOrder(slug, { kind: 'lead', id: tracking.id, token: tracking.token, total: tracking.total });
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { if (tab) tab.close(); setError(e.message); } finally { setBusy(false); }
  };
  return <><button onClick={buy} disabled={busy} className="btn btn-green">{busy ? 'Opening...' : children || 'Buy on WhatsApp'} <ArrowUpRight size={18}/></button>{error && <small className="error-text">{error}</small>}</>;
}

export default function ProductPage({ hostedSlug }) {
  const { slug: pathSlug, id } = useParams();
  const slug = hostedSlug || pathSlug;
  const { theme } = useTheme();
  const [data, setData] = useState(null), [error, setError] = useState(''), [copied, setCopied] = useState(false), [qty, setQtyState] = useState(1);
  const cart = useCart(slug), wishlist = useWishlist(slug);
  useEffect(() => { api(`/public/stores/${slug}/products/${id}`).then(setData).catch(e => setError(e.message)); }, [slug, id]);
  if (error) return <><Header/><div className="container empty-state page-fade">{error}</div></>;
  if (!data) return <div className="container empty-state">Loading product...</div>;
  const { business, product } = data;
  const isService = product.kind === 'service';
  const out = !isService && product.stock === 0;
  const restaurant = business.storeType === 'restaurant';
  const low = product.stock !== null && product.stock > 0 && product.stock <= 5;
  return <div className="page-fade" style={storeThemeStyle(business.accentColor, theme === 'dark')}>
    <Header shop={slug}/>
    <main className="detail-wrap"><div className="container">
      <div className="breadcrumbs"><Link to={storePath(slug)}>{business.name}</Link><span>/</span><span>{product.category?.name || 'Products'}</span><span>/</span><span>{product.name}</span></div>
      <div className="detail-grid">
        <ProductGallery product={product}/>
        <div className="detail-info anim-up">
          <span className="kicker">{product.category?.name || 'THE COLLECTION'}</span>
          <h1>{product.name}<span className="accent-dot">.</span></h1>
          <p className="detail-price">{inr(product.price)}</p>
          <div className="detail-line"/>
          <p className="detail-description">{product.description || (restaurant ? 'Freshly prepared for you.' : 'A lovely find from our collection. Message us to know more.')}</p>
          {!business.isOpen && <p className="notice warn"><Clock size={15}/> {business.name} is closed right now. Your order will be confirmed when the shop opens{business.openingHours ? ` (${business.openingHours})` : ''}.</p>}
          {!out && <div className="qty-row"><span>Quantity</span><div className="qty-stepper"><button onClick={() => setQtyState(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={14}/></button><span>{qty}</span><button onClick={() => setQtyState(product.stock !== null ? Math.min(product.stock, qty + 1) : qty + 1)} aria-label="Increase quantity"><Plus size={14}/></button></div></div>}
          <div className="detail-actions">
            {!out && !restaurant && <BuyButton slug={slug} id={id} qty={qty}>{isService ? 'Book on WhatsApp' : undefined}</BuyButton>}
            {!out && <button className="btn btn-outline" onClick={() => cart.add(product, qty)}><ShoppingBag size={17}/> {restaurant ? 'Add to order' : isService ? 'Add to booking' : 'Add to cart'}</button>}
            <button className={`icon-btn heart-lg ${wishlist.has(product.id) ? 'active' : ''}`} onClick={() => wishlist.toggle(product.id)} aria-label="Save to favorites"><Heart size={19}/></button>
          </div>
          {cart.count > 0 && <Link className="text-link" to={`${storePath(slug)}${restaurant ? window.location.search : ''}`}>View cart ({cart.count} items, {inr(cart.subtotal)}) on the shop page <ArrowUpRight size={14}/></Link>}
          <p className="detail-hint"><MessageCircle size={16}/> {restaurant ? 'Place your order from the menu. Nothing is charged online.' : `Opens a conversation with ${business.name}`}</p>
          <button className="share-link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}><Copy size={16}/>{copied ? 'Link copied!' : 'Copy product link'}</button>
          <div className="detail-line"/>
          <p className="detail-small">{restaurant ? 'Add items to your order, then choose dine-in, takeaway or delivery from the menu.' : "Have a question? Tap the button above to talk to us directly. We'd love to help."}</p>
        </div>
      </div>
    </div></main>
    <Footer><span>{business.name} · Powered by Digital Dukaan</span></Footer>
  </div>;
}
