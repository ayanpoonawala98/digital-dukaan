import React, { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { imageSrc, inr } from '../lib/api.js';
import { storeImage } from '../lib/store-image.js';
import { VegDot, TagChips } from './MenuBits.jsx';

// Item sheet for restaurant menus: size, add-ons, note, quantity, live price.
export default function MenuItemSheet({ product, onClose, onAdd }) {
  const variants = product.variants || [], groups = product.addonGroups || [];
  const [variant, setVariant] = useState(variants[0]?.name || '');
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const base = variants.length ? Number(variants.find(v => v.name === variant)?.price ?? product.price) : Number(product.price);
  const addonList = useMemo(() => groups.flatMap(g => (picked[g.id] || []).map(n => ({ group: g.name, name: n, price: Number(g.options.find(o => o.name === n)?.price || 0) }))), [groups, picked]);
  const unit = base + addonList.reduce((s, a) => s + a.price, 0);
  const toggle = (g, name) => setPicked(p => {
    const cur = p[g.id] || [];
    if (g.max === 1) return { ...p, [g.id]: name ? [name] : [] };
    if (cur.includes(name)) return { ...p, [g.id]: cur.filter(n => n !== name) };
    if (cur.length >= g.max) { setError(`Choose at most ${g.max} for ${g.name}`); return p; }
    setError(''); return { ...p, [g.id]: [...cur, name] };
  });
  const add = () => {
    const missing = groups.find(g => g.required && !(picked[g.id] || []).length);
    if (missing) { setError(`Please choose ${missing.name}`); return; }
    onAdd(qty, { variant, addons: picked, addonList, note: note.trim(), unitPrice: unit });
  };
  return <div className="drawer-overlay item-sheet-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="item-sheet anim-slide" role="dialog" aria-label={product.name}>
      <button className="icon-btn item-sheet-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      {product.imageUrl && <img className="item-sheet-img" src={storeImage(imageSrc(product.imageUrl), 720)} alt={product.name}/>}
      <div className="item-sheet-body">
        <h3><VegDot veg={product.veg}/> {product.name}</h3>
        <TagChips tags={product.tags}/>
        {product.description && <p className="muted">{product.description}</p>}
        {variants.length > 0 && <fieldset className="opt-group"><legend>Choose size <small>required</small></legend>
          {variants.map(v => <label className="opt-row" key={v.name}><input type="radio" name="variant" checked={variant === v.name} onChange={() => setVariant(v.name)}/><span>{v.name}</span><b>{inr(v.price)}</b></label>)}</fieldset>}
        {groups.map(g => <fieldset className="opt-group" key={g.id}><legend>{g.name} <small>{g.required ? 'required' : 'optional'}{g.max > 1 ? `, up to ${g.max}` : ''}</small></legend>
          {g.max === 1 && !g.required && <label className="opt-row"><input type="radio" name={g.id} checked={!(picked[g.id] || []).length} onChange={() => toggle(g, '')}/><span>None</span><b/></label>}
          {g.options.map(o => <label className="opt-row" key={o.name}><input type={g.max === 1 ? 'radio' : 'checkbox'} name={g.id} checked={(picked[g.id] || []).includes(o.name)} onChange={() => toggle(g, o.name)}/><span>{o.name}</span><b>{o.price > 0 ? `+ ${inr(o.price)}` : 'Free'}</b></label>)}</fieldset>)}
        <label className="opt-note">Note for the kitchen <small>(optional)</small><input value={note} maxLength={140} onChange={e => setNote(e.target.value)} placeholder="e.g. less spicy, no onion"/></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="item-sheet-foot">
          <div className="qty-stepper"><button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease"><Minus size={14}/></button><span>{qty}</span><button type="button" onClick={() => setQty(q => Math.min((product.stock ?? 99) || 99, q + 1))} aria-label="Increase"><Plus size={14}/></button></div>
          <button className="btn btn-green" onClick={add}>Add to order · {inr(unit * qty)}</button>
        </div>
      </div>
    </div>
  </div>;
}
