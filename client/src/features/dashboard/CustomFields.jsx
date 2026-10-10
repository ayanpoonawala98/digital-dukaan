import { ot } from '../../shared/lib/owner-i18n.js';
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

const TYPE_LABEL = { select: 'Drop-down', text: 'Short text', number: 'Number' };
export const missingRequired = (fields = [], answers = {}) => (fields || []).filter(f => f.required && !String(answers?.[f.id] ?? '').trim());
export const EYEWEAR_PRESET = [
  { label: 'Lens type', type: 'select', options: 'Single vision, Blue-cut, Progressive, Photochromic', required: true },
  { label: 'Right eye power', type: 'number', required: false, help: 'e.g. -2.25' },
  { label: 'Left eye power', type: 'number', required: false, help: 'e.g. -1.75' },
];

// Owner side: define the questions a customer answers for this product.
export function CustomFieldsEditor({ value, onChange }) {
  const fields = Array.isArray(value) ? value : [];
  const patch = (i, p) => onChange(fields.map((f, n) => (n === i ? { ...f, ...p } : f)));
  return <fieldset className="cf-editor"><legend>{ot("Customer questions")} <small>{ot("(optional)")}</small></legend>
    <p className="muted cf-help">{ot("Ask the customer for details before they order, like lens type or eye power. Their answers are added to the WhatsApp message and shown on the order.")}</p>
    {fields.map((f, i) => <div className="cf-row" key={i}>
      <input aria-label={ot("Question")} value={f.label || ''} onChange={e => patch(i, { label: e.target.value })} placeholder={ot("Question, e.g. Lens type")} maxLength={60}/>
      <select aria-label={ot("Answer type")} value={f.type || 'text'} onChange={e => patch(i, { type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{ot(l)}</option>)}</select>
      <label className="check-label cf-req"><input type="checkbox" checked={f.required === true} onChange={e => patch(i, { required: e.target.checked })}/> {ot("Required")}</label>
      <button type="button" className="icon-btn danger" onClick={() => onChange(fields.filter((_, n) => n !== i))} aria-label={ot("Remove question {v0}", {v0: f.label || i + 1})}><Trash2 size={15}/></button>
      {f.type === 'select' && <input className="cf-options" aria-label={ot("Choices")} value={Array.isArray(f.options) ? f.options.join(', ') : (f.options || '')} onChange={e => patch(i, { options: e.target.value })} placeholder={ot("Drop-down choices, separated by commas")}/>}
    </div>)}
    <div className="cf-actions">
      <button type="button" className="btn btn-outline btn-small" disabled={fields.length >= 12} onClick={() => onChange([...fields, { label: '', type: 'text', required: false }])}><Plus size={14}/> {ot("Add a question")}</button>
      {!fields.length && <button type="button" className="btn btn-outline btn-small" onClick={() => onChange(EYEWEAR_PRESET)}>{ot("Use eyewear example")}</button>}
    </div>
  </fieldset>;
}

// Customer side: the questions for one product.
export function CustomFieldInputs({ fields, answers = {}, onChange, compact = false }) {
  if (!fields?.length) return null;
  const set = (id, v) => onChange({ ...answers, [id]: v });
  return <div className={`cf-answers${compact ? ' compact' : ''}`}>{fields.map(f => <label key={f.id}>{f.label}{f.required && <b className="cf-star" aria-hidden="true"> *</b>}
    {f.type === 'select'
      ? <select value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} required={f.required}><option value="">{ot("Choose...")}</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
      : <input type={f.type === 'number' ? 'number' : 'text'} step={f.type === 'number' ? '0.25' : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined} value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} required={f.required} placeholder={f.help || ''} maxLength={200}/>}
  </label>)}</div>;
}
