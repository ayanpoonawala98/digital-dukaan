import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const targets = '.section-intro, .feature-card, .perk, .bottom-cta .cta-inner, .catalog-head, .product-card, .store-end, .store-contact, .dashboard-panel, .stat-card, .page-title, .auth-card, .request-card, .product-detail';

/** Progressive enhancement. Without IntersectionObserver, content is always visible. */
export default function Motion() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('in-view'); observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px 45px 0px' });
    const seen = new WeakSet();
    const scan = () => document.querySelectorAll(targets).forEach(element => {
      if (seen.has(element)) return;
      seen.add(element);
      element.classList.add('reveal-ready');
      observer.observe(element);
    });
    scan();
    // Fail-safe: never leave content hidden if observer timing misses an element.
    const failsafe = setInterval(() => document.querySelectorAll('.reveal-ready:not(.in-view)').forEach(el => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight + 200 || r.height > window.innerHeight) el.classList.add('in-view'); }), 1500);
    const mutation = new MutationObserver(scan);
    mutation.observe(document.getElementById('root'), { childList: true, subtree: true });
    return () => { clearInterval(failsafe); mutation.disconnect(); observer.disconnect(); };
  }, [pathname]);
  return null;
}
