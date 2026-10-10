import { st } from '../../shared/lib/storefront-i18n.js';
import { storeImage } from './store-image.js';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { imageSrc } from '../../shared/lib/api.js';

export default function ProductGallery({ product }) {
  const images = (Array.isArray(product.imageUrls) && product.imageUrls.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []).slice(0, 5);
  const [index, setIndex] = useState(0);
  const touch = useRef(null);
  useEffect(() => setIndex(0), [product.id]);
  const next = () => setIndex(n => (n + 1) % images.length);
  const prev = () => setIndex(n => (n + images.length - 1) % images.length);
  return <div className="product-gallery">
    <div className="detail-image anim-scale" onTouchStart={e => { touch.current = e.touches[0]?.clientX; }} onTouchEnd={e => {
      if (touch.current == null || images.length < 2) return;
      const delta = e.changedTouches[0]?.clientX - touch.current;
      if (Math.abs(delta) > 45) delta < 0 ? next() : prev();
      touch.current = null;
    }}>
      {images.length ? <img src={storeImage(imageSrc(images[index]), 1200)} alt={st("{v0}, photo {v1} of {v2}",{v0:product.name,v1:index+1,v2:images.length})}/> : <Package size={80}/>}
      {images.length > 1 && <><button className="gallery-arrow gallery-prev" onClick={prev} aria-label={st("Previous photo")}><ChevronLeft size={20}/></button><button className="gallery-arrow gallery-next" onClick={next} aria-label={st("Next photo")}><ChevronRight size={20}/></button><span className="gallery-count">{index + 1} / {images.length}</span></>}
      {product.stock === 0 && product.kind !== 'service' && <span className="chip chip-out">{st("Out of stock")}</span>}
      {product.stock !== null && product.stock > 0 && product.stock <= 5 && <span className="chip chip-low">{st("Only")} {product.stock} {st("left")}</span>}
      {product.kind === 'service' && <span className="chip chip-service">{product.duration || st("Service")}</span>}
    </div>
    {images.length > 1 && <div className="gallery-thumbs" aria-label={st("Product photo gallery")}>{images.map((url, i) => <button key={`${url}-${i}`} onClick={() => setIndex(i)} className={index === i ? 'selected' : ''} aria-label={st("Show photo {v0}",{v0:i+1})} aria-current={index === i ? 'true' : undefined}><img src={storeImage(imageSrc(url), 192)} alt=""/></button>)}</div>}
  </div>;
}
