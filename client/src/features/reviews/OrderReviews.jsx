import React, { useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { StarInput } from './Stars.jsx';

// Shown on the private order tracking page once the order is done. The tracking token is the only credential.
function ItemReview({ slug, kind, id, token, item }) {
  const [rating, setRating] = useState(item.review?.rating || 0), [text, setText] = useState(item.review?.text || '');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); if (busy) return;
    if (!rating) { setErr('Tap a star to rate'); return; }
    setBusy(true); setErr(''); setMsg('');
    try { await api(`/public/stores/${encodeURIComponent(slug)}/${kind === 'lead' ? 'lead-orders' : 'restaurant-orders'}/${id}/reviews`, { method: 'POST', token, body: { productId: item.productId, rating, text }, feedback: false }); setMsg(item.review ? 'Review updated. Thank you!' : 'Thank you for your review!'); }
    catch (e2) { setErr(e2.message || 'Could not save your review'); } finally { setBusy(false); }
  };
  return <form className="review-form" onSubmit={submit}><b>{item.name || 'Item'}</b>
    <StarInput value={rating} onChange={setRating} label={`Rating for ${item.name}`}/>
    <textarea maxLength={600} value={text} onChange={e => setText(e.target.value)} placeholder="Tell others what you liked (optional)" aria-label={`Review for ${item.name}`}/>
    {err && <p className="notice error" role="alert">{err}</p>}{msg && <p className="notice" role="status">{msg}</p>}
    <div><button className="btn btn-green btn-small" disabled={busy}>{busy ? 'Saving...' : item.review ? 'Update review' : 'Submit review'}</button></div>
  </form>;
}
export default function OrderReviews({ slug, kind, id, token }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    api(`/public/stores/${encodeURIComponent(slug)}/${kind === 'lead' ? 'lead-orders' : 'restaurant-orders'}/${id}/reviews`, { token, feedback: false }).then(r => { if (live) setItems(r.items || []); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [slug, kind, id, token]);
  if (!items || !items.length) return null;
  return <section className="reviews" aria-label="Rate your order"><h3>How was your order?</h3>{items.map(i => <ItemReview key={i.productId} slug={slug} kind={kind} id={id} token={token} item={i}/>)}</section>;
}
