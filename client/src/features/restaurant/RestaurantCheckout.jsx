import { useFeedbackState } from '../../shared/components/Toasts.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header, Footer } from '../../shared/components/chrome.jsx';
import { ArrowRight, ShoppingBag, X } from 'lucide-react';
import { api, inr } from '../../shared/lib/api.js';
import Busy from '../../shared/components/Busy.jsx';
import {CustomFieldInputs, missingRequired} from '../dashboard/CustomFields.jsx';
import { translate } from '../../shared/lib/i18n.js';
import { saveOrder, trackingPath } from '../storefront/my-orders.js';
import { VegDot, lineText } from './MenuBits.jsx';
import { lineKey } from '../storefront/shop.js';

export default function RestaurantCheckout({ slug, business, cart, open, onClose, lang = 'en' }) {
  const t = key => translate(lang, key);
  const suggested = new URLSearchParams(window.location.search).get('table');
  const initialTable = /^\d{1,3}$/.test(suggested || '') && Number(suggested) <= business.tableCount && Number(suggested) > 0 ? suggested : '';
  const [orderType, setOrderType] = useState('dine-in');
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail,setCustomerEmail]=useState(''),[customerEmailConsent,setCustomerEmailConsent]=useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useFeedbackState(''), [placed, setPlaced] = useState(null);
  useEffect(() => { if (open) { setError(''); setPlaced(null); } }, [open]);
  const freeAbove = business.freeDeliveryAbove;
  const deliveryFee = orderType === 'delivery' && !(freeAbove !== null && freeAbove !== undefined && cart.subtotal >= freeAbove) ? Number(business.deliveryCharge || 0) : 0;
  const submit = async e => {
    e.preventDefault(); if (busy || !cart.items.length) return;
    if (business.blocksOrders) { setError('The shop is closed right now and is not taking orders.'); return; }
    if (business.minOrder > 0 && cart.subtotal < business.minOrder) { setError(`Minimum order is ${inr(business.minOrder)}. Add more items.`); return; }
    const unanswered = cart.items.find(i => missingRequired(i.customFields, i.answers).length);
    if (unanswered) { setError(`Please answer the required questions for ${unanswered.name}.`); return; }
    setBusy(true); setError('');
    try {
      const result = await api(`/public/stores/${slug}/restaurant-orders`, { method: 'POST', body: {
        orderType, tableNumber: orderType === 'dine-in' ? Number(tableNumber) : null,
        customerName: orderType === 'dine-in' ? null : customerName,
        customerEmail,customerEmailConsent,
        customerPhone: orderType === 'dine-in' ? null : customerPhone,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
        couponCode: couponCode.trim().toUpperCase(),
        note: orderNote.trim(),
        items: cart.items.map(i => ({ id: i.id, qty: i.qty, answers: i.answers || {}, variant: i.variant || undefined, addons: i.addons && Object.keys(i.addons).length ? i.addons : undefined, note: i.note || undefined }))
      } });
      setPlaced(result); cart.clear();
      saveOrder(slug, { kind: 'restaurant', id: result.orderId, token: result.trackingToken, total: result.total });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  if (!open) return null;
  return <div className="drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer restaurant-checkout anim-slide" aria-label="Place restaurant order">
      <div className="drawer-head"><h3><ShoppingBag size={20}/> Your order</h3><button className="icon-btn" onClick={onClose} aria-label="Close order form"><X size={20}/></button></div>
      {placed ? <div className="empty-state" role="status"><h3>Order #{placed.orderNumber ?? placed.orderId} received</h3><p>Items total {inr(placed.subtotal)}{placed.discount > 0 ? `, discount ${inr(placed.discount)}` : ''}{placed.deliveryFee > 0 ? `, delivery fee ${inr(placed.deliveryFee)}` : ''}. Order total {inr(placed.total)}.</p>{placed.estimateMinutes ? <p><b>Ready in about {placed.estimateMinutes} minutes.</b></p> : null}<p>The restaurant has your order. Payment is arranged with the restaurant. Keep this link to check updates for 30 days. Anyone with the link can view this order.</p><Link className="btn btn-green" to={`/store/${slug}/order/${placed.orderId}#token=${encodeURIComponent(placed.trackingToken)}`}>Track this order</Link><button className="btn btn-green" onClick={onClose}>{t('back')}</button></div> : <>
        {!cart.items.length ? <div className="empty-state">Your order is empty. Add something from the menu.</div> : <>
          <div className="drawer-items">{cart.items.map(item => { const k = lineKey(item); return <div className="cart-row" key={k}><div className="cart-info"><strong><VegDot veg={item.veg}/> {item.qty} × {item.name}</strong>{lineText(item) && <small className="muted">{lineText(item)}</small>}<input className="line-note" value={item.note || ''} maxLength={140} placeholder="Note for this item (optional)" aria-label={`Note for ${item.name}`} onChange={e => cart.setNote(k, e.target.value)}/><CustomFieldInputs compact fields={item.customFields} answers={item.answers} onChange={a => cart.setAnswers(k, a)}/></div><span>{inr(item.qty * item.price)}</span><button type="button" className="icon-btn" onClick={() => cart.setQty(k, 0)} aria-label={`Remove ${item.name}`}><X size={16}/></button></div>; })}</div>
          <form className="restaurant-order-form" onSubmit={submit}>
            <label>{t('type')}<select value={orderType} onChange={e => setOrderType(e.target.value)}><option value="dine-in">{t('dine')}</option><option value="takeaway">{t('takeaway')}</option><option value="delivery">{t('delivery')}</option></select></label>
            {orderType === 'dine-in' ? <label>{t('table')}<select value={tableNumber} onChange={e => setTableNumber(e.target.value)} required><option value="">Choose your table</option>{Array.from({ length: business.tableCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
              : <><label>{t('name')}<input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={100} required/></label><label>{t('phone')}<input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} minLength={8} maxLength={25} required/></label></>}
            <label>Email for this order <small>(optional, no offers)</small><input type="email" maxLength={160} value={customerEmail} onChange={e=>{setCustomerEmail(e.target.value);setCustomerEmailConsent(false);}}/></label><label className="check-label"><input type="checkbox" disabled={!customerEmail} checked={customerEmailConsent} onChange={e=>setCustomerEmailConsent(e.target.checked)}/> Email me updates for this order if the store offers email alerts. Not marketing consent.</label>
            {orderType === 'delivery'  && <label>{t('address')}<textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} maxLength={500} required rows={3}/></label>}
            <label>Note for the whole order <small>(optional)</small><input value={orderNote} maxLength={200} onChange={e => setOrderNote(e.target.value)} placeholder="e.g. ring the bell, extra napkins"/></label>
            <label>Coupon code <small>(optional)</small><input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="SAVE10" maxLength={24}/></label>
            {business.minOrder > 0 && <p className="drawer-hint">Minimum order: {inr(business.minOrder)}</p>}
            {orderType === 'delivery' && business.freeDeliveryAbove > 0 && deliveryFee > 0 && <p className="drawer-hint">Free delivery above {inr(business.freeDeliveryAbove)}.</p>}
            {orderType === 'takeaway' && business.prepMinutes > 0 && <p className="drawer-hint">Takeaway is usually ready in about {business.prepMinutes} minutes.</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
            <div className="drawer-foot">
            <div className="drawer-totals"><div><span>Items subtotal</span><b>{inr(cart.subtotal)}</b></div>{orderType === 'delivery' && <div><span>Delivery fee</span><b>{deliveryFee > 0 ? inr(deliveryFee) : 'Free'}</b></div>}<div className="grand"><span>Estimated total</span><b>{inr(cart.subtotal + deliveryFee)}</b></div></div>
            <button className="btn btn-green full" disabled={busy || business.blocksOrders}><Busy active={busy}>{busy ? 'Placing...' : t('submit')}</Busy><ArrowRight size={17}/></button>
            <p className="drawer-hint">Your order goes to the restaurant's dashboard. No payment is taken online.</p>
            </div>
          </form>
        </>}
      </>}
    </aside>
  </div>;
}
