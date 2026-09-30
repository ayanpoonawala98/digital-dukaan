import React from 'react';

export default function LoadSkeleton({ label = 'Loading', cards = 4, rows = 2 }) {
  return <section className="load-skeleton" role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}...</span>
    <div className="load-skeleton-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => <div className="load-skeleton-card" key={i}><i className="load-shimmer load-icon"/><i className="load-shimmer load-value"/><i className="load-shimmer load-caption"/></div>)}
    </div>
    {rows > 0 && <div className="load-skeleton-panel" aria-hidden="true"><i className="load-shimmer load-heading"/>{Array.from({ length: rows }, (_, i) => <i className="load-shimmer load-row" key={i}/>)}</div>}
  </section>;
}
