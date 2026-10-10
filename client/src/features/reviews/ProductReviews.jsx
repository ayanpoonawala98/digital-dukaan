import { storefrontError } from '../../shared/lib/storefront-i18n.js';
import { st, storeLocale } from '../../shared/lib/storefront-i18n.js';
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
  if (!loading && (error ? !reviews.length : (!summary || !summary.count))) return null; // no reviews or a failed first load: hide the section, never show a red error to shoppers
  return <section className="reviews" aria-label={st("Customer reviews")}>
    <div className="reviews-head"><h2>{st("Reviews")}</h2>{summary?.count > 0 && <Stars value={summary.avg} count={summary.count} size={18}/>}</div>
    {reviews.map(r => <article className="review-item" key={r.id}><Stars value={r.rating}/>{r.text && <p>{r.text}</p>}<small className="muted">{r.name} {st("· Verified order ·")} {new Date(r.createdAt).toLocaleDateString(storeLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}</small></article>)}
    {error && <p className="notice error" role="alert">{storefrontError(error)}</p>}
    {loading && <p className="muted">{st("Loading reviews...")}</p>}
    {next && !loading && <button type="button" className="btn btn-outline" onClick={() => load(next)}>{st("Show more reviews")}</button>}
  </section>;
}
