import { pt } from '../../shared/lib/presentation-i18n.js';
import React from 'react';
import './reviews.css';
// Read-only stars. `value` 0 to 5 (halves round to the nearest whole star).
export function Stars({ value = 0, count, size = 14 }) {
  const full = Math.round(Number(value) || 0);
  return <span className="stars" role="img" aria-label={count !== undefined ? pt(count===1 ? "{rating} out of 5, 1 review" : "{rating} out of 5, {count} reviews",{rating:Number(value).toFixed(1),count}) : pt("{rating} out of 5",{rating:Number(value).toFixed(1)})} style={{ fontSize: size }}>
    {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= full ? '' : 'off'} aria-hidden="true">★</span>)}
    {count !== undefined && <span className="stars-text">{Number(value).toFixed(1)} ({count})</span>}
  </span>;
}
export function StarInput({ value, onChange, label = 'Rating' }) {
  return <div className="star-input" role="radiogroup" aria-label={pt(label)}>
    {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={pt(n===1?"{n} star":"{n} stars",{n})} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>)}
  </div>;
}
