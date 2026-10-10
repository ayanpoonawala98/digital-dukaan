import { pt as ot } from '../lib/presentation-i18n.js';
import React from 'react';

// App-wide loader: the Digital Shop bag mark with soft ripples and a bouncing dot row.
// CSS only (transform/opacity); the animation is switched off under prefers-reduced-motion.
export default function BrandLoader({ label = 'Loading', compact = false, full = false }) {
  return <div className={`brand-loader${compact ? ' compact' : ''}${full ? ' full' : ''}`} role="status" aria-live="polite" aria-label={ot(label)}>
    <span className="sr-only">{ot(label)}</span>
    <div className="bl-mark" aria-hidden="true">
      <i className="bl-ring"/><i className="bl-ring r2"/>
      <svg viewBox="0 0 64 64" className="bl-bag"><rect width="64" height="64" rx="16" fill="#0e9f6e"/><path d="M14 26h36l-3.4 22a5 5 0 0 1-5 4H22.4a5 5 0 0 1-5-4L14 26z" fill="#fff"/><path className="bl-handle" d="M22 26v-4a10 10 0 0 1 20 0v4" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round"/><path d="M24 36h6v-4M34 36h6M24 43h3m4 0h9" fill="none" stroke="#0e9f6e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="31.5" r="1.8" fill="#0e9f6e"/><circle cx="40" cy="36" r="1.8" fill="#0e9f6e"/></svg>
    </div>
    {!compact && <b className="bl-word" aria-hidden="true">Digital Shop</b>}
    <span className="bl-dots" aria-hidden="true"><i/><i/><i/></span>
  </div>;
}
