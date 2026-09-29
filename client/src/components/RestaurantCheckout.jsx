import React, { useEffect, useState } from 'react';
import { ArrowRight, ShoppingBag, X } from 'lucide-react';
import { api, inr } from '../lib/api.js';
import Busy from './Busy.jsx';
import { translate } from '../lib/i18n.js';

export default function RestaurantCheckout({ slug, business, cart, open, onClose, lang = 'en' }) {
  const t = key => translate(lang, key);
  const suggested = new URLSearchParams(window.location.search).get('table');
  const initialTable = /^\d{1,3}$/.test(suggested || '') && Number(suggested) <= business.tableCount && Number(suggested) > 0 ? suggested : '';
  const [orderType, setOrderType] = useState('dine-in');
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [referralCode, setReferralCode] = useState(() => new URLSearchParams(window.location.search).get('ref') || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [placed, setPlaced] = useState(null);
  useEffect(() => { if (open) { setError(''); setPlaced(null); } }, [open]);
  const submit = async e => {
    e.preventDefault(); if (busy || !cart.items.length) return;
    setBusy(true); setError('');
    try {
      const result = await api(`/public/stores/${slug}/restaurant-orders`, { method: 'POST', body: {
        orderType, tableNumber: orderType === 'dine-in' ? Number(tableNumber) : null,
        customerName: orderType === 'dine-in' ? null : customerName,
        customerPhone: orderType === 'dine-in' ? null : customerPhone,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
        couponCode: couponCode.trim().toUpperCase(), referralCode: referralCode.trim().toUpperCase(),
        items: cart.items.map(i => ({ id: i.id, qty: i.qty }))
      } });
      setPlaced(result); cart.clear();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  if (!open) return null;
  return <div className="drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer restaurant-checkout anim-slide" aria-label="Place restaurant order">
      <div className="drawer-head"><h3><ShoppingBag size={20}/> Your order</h3><button className="icon-btn" onClick={onClose} aria-label="Close order form"><X size={20}/></button></div>
      {placed ? <div className="empty-state" role="status"><h3>Order #{placed.orderId} received</h3><p>Items total {inr(placed.subtotal)}{placed.discount > 0 ? `, discount ${inr(placed.discount)}` : ''}. Order total {inr(placed.total)}.</p><p>The restaurant has your order. Payment and any delivery fee are arranged with the restaurant. Keep this number for your reference.</p><button className="btn btn-green" onClick={onClose}>{t('back')}</button></div> : <>
        {!cart.items.length ? <div className="empty-state">Your order is empty. Add something from the menu.</div> : <>
          <div className="drawer-items">{cart.items.map(item => <div className="cart-row" key={item.id}><strong>{item.qty} × {item.name}</strong><span>{inr(item.qty * item.price)}</span><button type="button" className="icon-btn" onClick={() => cart.setQty(item.id, 0)} aria-label={`Remove ${item.name}`}><X size={16}/></button></div>)}</div>
          <form className="restaurant-order-form" onSubmit={submit}>
            <label>{t('type')}<select value={orderType} onChange={e => setOrderType(e.target.value)}><option value="dine-in">{t('dine')}</option><option value="takeaway">{t('takeaway')}</option><option value="delivery">{t('delivery')}</option></select></label>
            {orderType === 'dine-in' ? <label>{t('table')}<select value={tableNumber} onChange={e => setTableNumber(e.target.value)} required><option value="">Choose your table</option>{Array.from({ length: business.tableCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
              : <><label>{t('name')}<input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={100} required/></label><label>{t('phone')}<input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} minLength={8} maxLength={25} required/></label></>}
            {orderType === 'delivery' && <label>{t('address')}<textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} maxLength={500} required rows={3}/></label>}
            <label>Referral code <small>(optional; reward after order confirmation)</small><input value={referralCode} onChange={e => setReferralCode(e.target.value)} placeholder="FR..." maxLength={24}/></label>
            <label>Coupon code <small>(optional)</small><input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="SAVE10" maxLength={24}/></label>
            <div className="drawer-totals"><div className="grand"><span>Items subtotal</span><b>{inr(cart.subtotal)}</b></div></div>
            {orderType === 'delivery' && <p className="drawer-hint">Delivery fee and payment are arranged with the restaurant. Nothing is charged here.</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="btn btn-green full" disabled={busy}><Busy active={busy}>{busy ? 'Placing...' : t('submit')}</Busy><ArrowRight size={17}/></button>
            <p className="drawer-hint">Your order goes to the restaurant's dashboard. No payment is taken online.</p>
          </form>
        </>}
      </>}
    </aside>
  </div>;
}
