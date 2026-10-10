import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { imageSrc } from '../../shared/lib/api.js';
import { storeThemeStyle } from './store-theme.js';

export default function OfferPopup({ business, onClose, preview = false, accentColor }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusables = [...document.querySelectorAll('.offer-popup button, .offer-popup a')];
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    closeRef.current?.focus();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="modal-overlay offer-modal-layer" style={storeThemeStyle(accentColor || business.accentColor, document.documentElement.dataset.theme === 'dark')} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal offer-popup anim-pop" role="dialog" aria-modal="true" aria-label={`Offer from ${business.name}`} aria-labelledby="offer-title" aria-describedby="offer-body">
      <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close offer"><X/></button>
      {business.offerPopupImageUrl && <img src={imageSrc(business.offerPopupImageUrl)} alt="Store offer"/>}
      <span className="kicker">{preview ? 'PREVIEW · ' : ''}A NOTE FROM {business.name.toUpperCase()}</span>
      <h2 id="offer-title">{business.offerPopupTitle || business.name}</h2>
      <p id="offer-body">{business.offerPopupText || (preview ? 'Your offer message will appear here. Add a message in Shop settings before publishing.' : '')}</p>
      <div className="offer-popup-actions">
        {business.offerPopupCtaText && (business.offerPopupCtaUrl || '').startsWith('https://')
          ? preview ? <button className="btn btn-green" onClick={onClose}>{business.offerPopupCtaText} <ArrowUpRight size={17}/></button>
            : <a className="btn btn-green" href={business.offerPopupCtaUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>{business.offerPopupCtaText} <ArrowUpRight size={17}/></a>
          : <button className="btn btn-green" onClick={onClose}>Explore the shop</button>}
        <button className="btn btn-ghost" onClick={onClose}>Not now</button>
      </div>
    </div>
  </div>, document.body);
}
