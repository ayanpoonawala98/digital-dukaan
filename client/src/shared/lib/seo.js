import { useEffect } from 'react';
// Per-page head tags for the SPA (crawlers that run JavaScript, plus the browser tab). Previous values are restored on leave.
const ROOT = 'https://digitalshop.website';
function setMeta(selector, make, value) {
  let el = document.head.querySelector(selector);
  const created = !el;
  if (!el) { el = make(); document.head.appendChild(el); }
  const attr = el.tagName === 'LINK' ? 'href' : 'content', prev = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => { if (created) el.remove(); else if (prev === null) el.removeAttribute(attr); else el.setAttribute(attr, prev); };
}
const meta = (key, val) => () => { const m = document.createElement('meta'); m.setAttribute(key, val); return m; };
export function useSeo({ title, description, path, noindex = false, image } = {}) {
  useEffect(() => {
    const undo = [], prevTitle = document.title;
    if (title) document.title = title;
    if (title) { undo.push(setMeta('meta[property="og:title"]', meta('property', 'og:title'), title), setMeta('meta[name="twitter:title"]', meta('name', 'twitter:title'), title)); }
    if (description) undo.push(setMeta('meta[name="description"]', meta('name', 'description'), description), setMeta('meta[property="og:description"]', meta('property', 'og:description'), description), setMeta('meta[name="twitter:description"]', meta('name', 'twitter:description'), description));
    if (path !== undefined) { const url = ROOT + path; undo.push(setMeta('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, url), setMeta('meta[property="og:url"]', meta('property', 'og:url'), url)); }
    if (image) undo.push(setMeta('meta[property="og:image"]', meta('property', 'og:image'), image), setMeta('meta[name="twitter:image"]', meta('name', 'twitter:image'), image));
    if (noindex) undo.push(setMeta('meta[name="robots"]', meta('name', 'robots'), 'noindex,nofollow'));
    return () => { document.title = prevTitle; undo.reverse().forEach(f => f()); };
  }, [title, description, path, noindex, image]);
}
