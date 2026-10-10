import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

const TAGS = [['bestseller', 'Bestseller'], ['spicy', 'Spicy'], ['new', 'New'], ['chefs-special', "Chef's special"]];
const VEG = [['', 'Not shown'], ['veg', 'Veg'], ['nonveg', 'Non-veg'], ['egg', 'Egg']];

// Restaurant-only product options: veg tag, labels, sizes/variants and add-on groups.
export default function MenuOptionsEditor({ draft, setDraft }) {
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const variants = draft.variants || [], groups = draft.addonGroups || [];
  const setVariant = (i, patch) => set({ variants: variants.map((v, k) => k === i ? { ...v, ...patch } : v) });
  const setGroup = (i, patch) => set({ addonGroups: groups.map((g, k) => k === i ? { ...g, ...patch } : g) });
  const setOption = (gi, oi, patch) => setGroup(gi, { options: groups[gi].options.map((o, k) => k === oi ? { ...o, ...patch } : o) });
  return <fieldset className="menu-options-editor"><legend>Restaurant menu options</legend>
    <div className="form-row">
      <label>Veg / non-veg mark<select value={draft.veg || ''} onChange={e => set({ veg: e.target.value })}>{VEG.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="tag-picker"><span>Labels</span>{TAGS.map(([k, l]) => <label key={k} className="check-label"><input type="checkbox" checked={(draft.tags || []).includes(k)} onChange={e => set({ tags: e.target.checked ? [...(draft.tags || []), k] : (draft.tags || []).filter(t => t !== k) })}/> {l}</label>)}</div>
    </div>
    <div className="opt-block"><b>Sizes / variants</b> <small className="muted">e.g. Half and Full. If you add any, customers must pick one and the price below is replaced by the variant price.</small>
      {variants.map((v, i) => <div className="opt-edit-row" key={i}><input value={v.name} maxLength={40} placeholder="Name (Half)" onChange={e => setVariant(i, { name: e.target.value })}/><input type="number" min="0" step="0.01" value={v.price} placeholder="Price" onChange={e => setVariant(i, { price: e.target.value })}/><button type="button" className="icon-btn" aria-label="Remove variant" onClick={() => set({ variants: variants.filter((_, k) => k !== i) })}><Trash2 size={15}/></button></div>)}
      {variants.length < 8 && <button type="button" className="btn btn-outline btn-small" onClick={() => set({ variants: [...variants, { name: '', price: draft.price || '' }] })}><Plus size={14}/> Add size</button>}
    </div>
    <div className="opt-block"><b>Add-on groups</b> <small className="muted">e.g. Extras (cheese, dip) or Spice level. Required groups must be chosen by the customer.</small>
      {groups.map((g, gi) => <div className="addon-group-edit" key={gi}>
        <div className="opt-edit-row"><input value={g.name} maxLength={40} placeholder="Group name (Extras)" onChange={e => setGroup(gi, { name: e.target.value })}/><label className="check-label"><input type="checkbox" checked={Boolean(g.required)} onChange={e => setGroup(gi, { required: e.target.checked })}/> Required</label><label>Max <input type="number" min="1" max="15" value={g.max || 1} onChange={e => setGroup(gi, { max: Number(e.target.value) })} style={{ width: 64 }}/></label><button type="button" className="icon-btn" aria-label="Remove group" onClick={() => set({ addonGroups: groups.filter((_, k) => k !== gi) })}><Trash2 size={15}/></button></div>
        {(g.options || []).map((o, oi) => <div className="opt-edit-row sub" key={oi}><input value={o.name} maxLength={40} placeholder="Option (Extra cheese)" onChange={e => setOption(gi, oi, { name: e.target.value })}/><input type="number" min="0" step="0.01" value={o.price ?? 0} placeholder="Price +" onChange={e => setOption(gi, oi, { price: e.target.value })}/><button type="button" className="icon-btn" aria-label="Remove option" onClick={() => setGroup(gi, { options: g.options.filter((_, k) => k !== oi) })}><Trash2 size={15}/></button></div>)}
        {(g.options || []).length < 15 && <button type="button" className="btn btn-outline btn-small" onClick={() => setGroup(gi, { options: [...(g.options || []), { name: '', price: 0 }] })}><Plus size={14}/> Add option</button>}
      </div>)}
      {groups.length < 6 && <button type="button" className="btn btn-outline btn-small" onClick={() => set({ addonGroups: [...groups, { id: `g${Date.now().toString(36)}`, name: '', required: false, max: 1, options: [{ name: '', price: 0 }] }] })}><Plus size={14}/> Add add-on group</button>}
    </div>
  </fieldset>;
}
