import { ot } from '../../shared/lib/owner-i18n.js';
import React from 'react';
const VEG = { veg: ['#0a8f3c', 'Vegetarian'], nonveg: ['#b3261e', 'Non-vegetarian'], egg: ['#d98a00', 'Contains egg'] };
export function VegDot({ veg }) {
  if (!VEG[veg]) return null;
  const [color, label] = VEG[veg];
  return <span className="veg-dot" style={{ borderColor: color }} role="img" aria-label={ot(label)} title={ot(label)}><i style={{ background: color }}/></span>;
}
const TAGS = { bestseller: ['Bestseller', 'tag-best'], spicy: ['Spicy', 'tag-spicy'], new: ['New', 'tag-new'], 'chefs-special': ["Chef's special", 'tag-chef'] };
export function TagChips({ tags }) {
  const list = (tags || []).filter(t => TAGS[t]);
  return list.length ? <span className="tag-row">{list.map(t => <em key={t} className={`menu-tag ${TAGS[t][1]}`}>{ot(TAGS[t][0])}</em>)}</span> : null;
}
export const lineText = item => [item.variant && `(${item.variant})`, ...[].concat(Array.isArray(item.addons) ? item.addons : (item.addonList || [])).filter(a => a && a.name).map(a => `+ ${a.name}`)].filter(Boolean).join(' ');
