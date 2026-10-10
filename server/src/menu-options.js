// Restaurant menu options: variants (Half/Full), add-on groups, veg tag, labels, daily sold-out.
// Prices are always recomputed on the server from the product record, never trusted from the client.
const bad = (status, message) => Object.assign(new Error(message), { status });
export const VEG_VALUES = ['', 'veg', 'nonveg', 'egg'];
export const TAG_VALUES = ['bestseller', 'spicy', 'new', 'chefs-special'];
const money = (v, label) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1000000) throw bad(400, `${label} must be a non-negative number`); return Math.round(n * 100) / 100; };
const text = (v, max, label) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!s) throw bad(400, `${label} is required`); if (s.length > max) throw bad(400, `${label} is too long`); return s; };

export function cleanVariants(value) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > 8) throw bad(400, 'Add up to 8 sizes or variants');
  const seen = new Set();
  return value.map(v => {
    const name = text(v?.name, 40, 'Variant name'), key = name.toLowerCase();
    if (seen.has(key)) throw bad(400, 'Variant names must be different');
    seen.add(key);
    return { name, price: money(v?.price, 'Variant price') };
  });
}

export function cleanAddonGroups(value) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > 6) throw bad(400, 'Add up to 6 add-on groups');
  const ids = new Set();
  return value.map((g, i) => {
    const name = text(g?.name, 40, 'Add-on group name');
    let id = String(g?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || `g${i + 1}`;
    while (ids.has(id)) id += 'x';
    ids.add(id);
    if (!Array.isArray(g?.options) || g.options.length < 1 || g.options.length > 15) throw bad(400, `${name}: add 1 to 15 options`);
    const seen = new Set();
    const options = g.options.map(o => {
      const oname = text(o?.name, 40, 'Add-on name'), key = oname.toLowerCase();
      if (seen.has(key)) throw bad(400, `${name}: option names must be different`);
      seen.add(key);
      return { name: oname, price: money(o?.price ?? 0, 'Add-on price') };
    });
    const required = Boolean(g.required);
    let max = Number(g.max);
    if (!Number.isInteger(max) || max < 1 || max > options.length) max = options.length;
    return { id, name, required, max, options };
  });
}

export const cleanVeg = v => { const s = String(v ?? ''); if (!VEG_VALUES.includes(s)) throw bad(400, 'Choose veg, non-veg, egg or none'); return s; };
export function cleanTags(v) {
  if (v === undefined || v === null || v === '') return [];
  if (!Array.isArray(v) || v.some(t => !TAG_VALUES.includes(t))) throw bad(400, 'Unknown menu label');
  return TAG_VALUES.filter(t => v.includes(t));
}

// India date key for "sold out today"
export const istDay = (date = new Date()) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const isSoldOutToday = (product, date = new Date()) => Boolean(product.soldOutDate) && product.soldOutDate === istDay(date);

export function cleanNote(v, max = 140) {
  const s = String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) throw bad(400, 'Note is too long');
  return s;
}

// Build one validated order line from a product record and a client entry.
export function buildLine(product, entry, qty) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const groups = Array.isArray(product.addonGroups) ? product.addonGroups : [];
  let unit = Number(product.price), variant = '';
  if (variants.length) {
    const found = variants.find(v => v.name === String(entry?.variant ?? ''));
    if (!found) throw bad(400, `Choose a size for ${product.name}`);
    variant = found.name; unit = Number(found.price);
  } else if (entry?.variant) throw bad(400, `${product.name} has no sizes`);
  const picked = entry?.addons && typeof entry.addons === 'object' && !Array.isArray(entry.addons) ? entry.addons : {};
  for (const id of Object.keys(picked)) if (!groups.some(g => g.id === id)) throw bad(400, `Unknown add-on for ${product.name}`);
  const addons = [];
  for (const g of groups) {
    const raw = picked[g.id] === undefined ? [] : picked[g.id];
    if (!Array.isArray(raw) || new Set(raw).size !== raw.length) throw bad(400, `Invalid choice for ${g.name}`);
    if (g.required && raw.length < 1) throw bad(400, `Choose ${g.name} for ${product.name}`);
    if (raw.length > g.max) throw bad(400, `Choose at most ${g.max} for ${g.name}`);
    for (const n of raw) {
      const opt = g.options.find(o => o.name === n);
      if (!opt) throw bad(400, `Invalid choice for ${g.name}`);
      addons.push({ group: g.name, name: opt.name, price: Number(opt.price) }); unit += Number(opt.price);
    }
  }
  const note = cleanNote(entry?.note);
  return { productId: product.id, name: product.name, price: Math.round(unit * 100) / 100, qty, ...(variant ? { variant } : {}), ...(addons.length ? { addons } : {}), ...(note ? { note } : {}), ...(product.veg ? { veg: product.veg } : {}) };
}

export const lineLabel = item => [item.variant && `(${item.variant})`, ...(item.addons || []).map(a => `+ ${a.name}`), item.note && `Note: ${item.note}`].filter(Boolean).join(' ');
