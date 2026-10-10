import BrandLoader from '../../shared/components/BrandLoader.jsx';
import ClosedBanner from './ClosedBanner.jsx';
import MenuItemSheet from '../restaurant/MenuItemSheet.jsx';
import { notify } from '../notifications/notifications.js';
import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import { storeThemeStyle } from './store-theme.js';
import { useTheme } from '../../app/theme.jsx';
import ProductGallery from './ProductGallery.jsx';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Clock, Copy, Heart, MessageCircle, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { api, imageSrc, inr } from '../../shared/lib/api.js';
import { storePath } from './store-domain.js';
import { saveOrder } from './my-orders.js';
import { useCart, useWishlist } from './shop.js';
import { Footer, Header } from '../../shared/components/chrome.jsx';
import { CustomFieldInputs, missingRequired } from '../dashboard/CustomFields.jsx';
import ContactFields, { contactBody, useContact } from '../../shared/components/ContactFields.jsx';
import ProductReviews from '../reviews/ProductReviews.jsx';
import { Stars } from '../reviews/Stars.jsx';
import { useSeo } from '../../shared/lib/seo.js';

function BuyButton({ slug, id, qty, fields, answers, children, blocked }) {
  const [busy, setBusy] = useState(false), [error, setError] = useFeedbackState(''), [contact, setContact] = useContact();
  const buy = async () => {
    const missing = missingRequired(fields, answers);
    if (missing.length) { setError(`Please answer: ${missing.map(f => f.label).join(', ')}`); return; }
    setBusy(true); setError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { url, tracking } = await api(`/public/stores/${slug}/products/${id}/enquire`, { method: 'POST', body: { qty, answers, ...contactBody(contact) } });
      if (tracking) saveOrder(slug, { kind: 'lead', id: tracking.id, token: tracking.token, total: tracking.total });
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { if (tab) tab.close(); setError(e.message); } finally { setBusy(false); }
  };
  return <><ContactFields contact={contact} onChange={setContact}/><button onClick={buy} disabled={busy || blocked} className="btn btn-green">{busy ? 'Opening...' : children || 'Buy on WhatsApp'} <ArrowUpRight size={18}/></button>{error && <small className="error-text">{error}</small>}</>;
}

export default function ProductPage({ hostedSlug }) {
  const { slug: pathSlug, id } = useParams();
  const slug = hostedSlug || pathSlug;
  const { theme } = useTheme();
  const [data, setData] = useState(null), [error, setError] = useFeedbackState(''), [copied, setCopied] = useState(false), [sheet, setSheet] = useState(false), [qty, setQtyState] = useState(1), [answers, setAnswers] = useState({});
  const cart = useCart(slug), wishlist = useWishlist(slug);
  useEffect(() => { api(`/public/stores/${slug}/products/${id}`).then(setData).catch(e => setError(e.message)); }, [slug, id]);
  useSeo({ title: data?.product ? `${data.product.name} - ${data.business.name}` : undefined, description: data?.product ? String(data.product.description || `${data.product.name} from ${data.business.name}. Order on WhatsApp.`).replace(/\s+/g, ' ').slice(0, 300) : undefined, path: hostedSlug || !data?.product ? undefined : `/store/${slug}/product/${id}` });
  if (error) return <><Header/><div className="container empty-state page-fade">{error}</div></>;
  if (!data) return <BrandLoader label="Loading product"/>;
  const { business, product } = data;
  const isService = product.kind === 'service';
  const out = !isService && (product.stock === 0 || Boolean(product.soldOutToday));
  const restaurant = business.storeType === 'restaurant';
  const low = product.stock !== null && product.stock > 0 && product.stock <= 5;
  return <div className="page-fade" style={storeThemeStyle(business.accentColor, theme === 'dark')}>
    <Header shop={slug} business={business}/>
    <ClosedBanner business={business}/>
    <main className="detail-wrap"><div className="container">
      <div className="breadcrumbs"><Link to={storePath(slug)}>{business.name}</Link><span>/</span><span>{product.category?.name || 'Products'}</span><span>/</span><span>{product.name}</span></div>
      <div className="detail-grid">
        <ProductGallery product={product}/>
        <div className="detail-info anim-up">
          <span className="kicker">{product.category?.name || 'THE COLLECTION'}</span>
          <h1>{product.name}<span className="accent-dot">.</span></h1>
          <p className="detail-price">{inr(product.price)}</p>
          {product.ratingCount > 0 && <p><Stars value={product.ratingAvg} count={product.ratingCount} size={16}/></p>}
          <div className="detail-line"/>
          <p className="detail-description">{product.description || (restaurant ? 'Freshly prepared for you.' : 'A lovely find from our collection. Message us to know more.')}</p>
          {!business.isOpen && !business.blocksOrders && <p className="notice warn"><Clock size={15}/> {business.name} is closed right now. Your order will be confirmed when the shop opens{business.openingHours ? ` (${business.openingHours})` : ''}.</p>}
          {!out && <div className="qty-row"><span>Quantity</span><div className="qty-stepper"><button onClick={() => setQtyState(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={14}/></button><span>{qty}</span><button onClick={() => setQtyState(product.stock !== null ? Math.min(product.stock, qty + 1) : qty + 1)} aria-label="Increase quantity"><Plus size={14}/></button></div></div>}
          {!out && !restaurant && <CustomFieldInputs fields={product.customFields} answers={answers} onChange={setAnswers}/>}
          <div className="detail-actions">
            {!out && !restaurant && <BuyButton slug={slug} id={id} qty={qty} fields={product.customFields} answers={answers} blocked={business.blocksOrders}>{isService ? 'Book on WhatsApp' : undefined}</BuyButton>}
            {!out && <button className="btn btn-outline" onClick={() => { const m = missingRequired(product.customFields, answers); if (!restaurant && m.length) { notify('error', `Please answer: ${m.map(f => f.label).join(', ')}`); return; } if (restaurant) { setSheet(true); return; } cart.add(product, qty, answers); }}><ShoppingBag size={17}/> {restaurant ? 'Add to order' : isService ? 'Add to booking' : 'Add to cart'}</button>}
            <button className={`icon-btn heart-lg ${wishlist.has(product.id) ? 'active' : ''}`} onClick={() => wishlist.toggle(product.id)} aria-label="Save to favorites"><Heart size={19}/></button>
          </div>
          {sheet && <MenuItemSheet product={product} onClose={() => setSheet(false)} onAdd={(q, config) => { cart.add(product, q, undefined, config); setSheet(false); }}/>}
          {cart.count > 0 && <Link className="text-link" to={`${storePath(slug)}${restaurant ? window.location.search : ''}`}>View cart ({cart.count} items, {inr(cart.subtotal)}) on the shop page <ArrowUpRight size={14}/></Link>}
          <p className="detail-hint"><MessageCircle size={16}/> {restaurant ? 'Place your order from the menu. Nothing is charged online.' : `Opens a conversation with ${business.name}`}</p>
          <button className="share-link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); notify('success', 'Link copied.'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { notify('error', 'Could not copy the link. Please copy it from the address bar.'); setCopied(false); } }}><Copy size={16}/>{copied ? 'Link copied!' : 'Copy product link'}</button>
          <div className="detail-line"/>
          <p className="detail-small">{restaurant ? 'Add items to your order, then choose dine-in, takeaway or delivery from the menu.' : "Have a question? Tap the button above to talk to us directly. We'd love to help."}</p>
        </div>
      </div>
    <ProductReviews slug={slug} productId={id}/>
    </div></main>
    <Footer><span>{business.name} · Powered by Digital Shop</span></Footer>
  </div>;
}
