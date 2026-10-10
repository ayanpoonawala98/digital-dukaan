import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/lib/api.js';
import { Stars } from './Stars.jsx';

// Public list of reviews for one product. Only reviews from real orders exist, so each one is marked verified.
export default function ProductReviews({ slug, productId }) {
  const [state, setState] = useState({ summary: null, reviews: [], next: null, loading: true, error: '' });
  const base = `/public/stores/${encodeURIComponent(slug)}/products/${productId}/reviews`;
  const load = useCallback(async cursor => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const r = await api(cursor ? `${base}?cursor=${cursor}` : base, { feedback: false });
      setState(s => ({ summary: r.summary, reviews: cursor ? [...s.reviews, ...r.reviews] : r.reviews, next: r.nextCursor, loading: false, error: '' }));
    } catch (e) { setState(s => ({ ...s, loading: false, error: e.message })); }
  }, [base]);
  useEffect(() => { load(null); }, [load]);
  const { summary, reviews, next, loading, error } = state;
  if (!loading && !error && (!summary || !summary.count)) return null;
  return <section className="reviews" aria-label="Customer reviews">
    <div className="reviews-head"><h2>Reviews</h2>{summary?.count > 0 && <Stars value={summary.avg} count={summary.count} size={18}/>}</div>
    {reviews.map(r => <article className="review-item" key={r.id}><Stars value={r.rating}/>{r.text && <p>{r.text}</p>}<small className="muted">{r.name} · Verified order · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small></article>)}
    {error && <p className="notice error" role="alert">{error}</p>}
    {loading && <p className="muted">Loading reviews...</p>}
    {next && !loading && <button type="button" className="btn btn-outline" onClick={() => load(next)}>Show more reviews</button>}
  </section>;
}
