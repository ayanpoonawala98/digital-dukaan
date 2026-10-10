import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Wait for lazy routes to render before scrolling to an in-page destination.
export default function HashScroll() {
 const { pathname, hash, key } = useLocation();
 useEffect(() => {
  if (!hash) return;
  let id; try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  let frame, observer;
  const scroll = () => {
   const target = document.getElementById(id);
   if (!target) return false;
   frame = requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
   observer?.disconnect();
   return true;
  };
  if (!scroll()) { observer = new MutationObserver(scroll); observer.observe(document.getElementById('root'), { childList: true, subtree: true }); }
  return () => { observer?.disconnect(); cancelAnimationFrame(frame); };
 }, [pathname, hash, key]);
 return null;
}
