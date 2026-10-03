// Owner-defined product questions (e.g. "Lens type", "Eye power") and the customer's answers.
const fail = m => Object.assign(new Error(m), { status: 400 });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const FIELD_TYPES = ['select', 'text', 'number'];

export function cleanFieldDefs(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw fail('Custom fields must be a list');
  if (input.length > 12) throw fail('Add at most 12 custom fields per product');
  const used = new Set();
  return input.map((raw, i) => {
    const label = clean(raw?.label, 60);
    if (!label) throw fail('Every custom field needs a question or label');
    const type = FIELD_TYPES.includes(raw?.type) ? raw.type : 'text';
    let id = /^[a-z0-9][a-z0-9_-]{0,29}$/.test(String(raw?.id || '')) ? raw.id : (slug(label) || `f${i + 1}`);
    while (used.has(id)) id = `${id.slice(0, 26)}-${i + 1}`;
    used.add(id);
    const def = { id, label, type, required: raw?.required === true };
    if (type === 'select') {
      const opts = [...new Set((Array.isArray(raw.options) ? raw.options : String(raw.options || '').split(/[\n,]/)).map(o => clean(o, 60)).filter(Boolean))].slice(0, 25);
      if (opts.length < 2) throw fail(`"${label}" needs at least two choices`);
      def.options = opts;
    }
    if (raw?.help) def.help = clean(raw.help, 120);
    return def;
  });
}

// Returns [{ label, value }] in the owner's field order, or throws a customer-readable error.
export function validateAnswers(defs, raw, productName = '') {
  const list = Array.isArray(defs) ? defs : [], input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, out = [];
  for (const d of list) {
    const v = clean(input[d.id], 200);
    if (!v) { if (d.required) throw fail(`Please answer "${d.label}"${productName ? ` for ${productName}` : ''}`); continue; }
    if (d.type === 'select' && !d.options.includes(v)) throw fail(`Choose one of the listed options for "${d.label}"`);
    if (d.type === 'number' && (!/^-?\d{1,6}(\.\d{1,2})?$/.test(v) || !Number.isFinite(Number(v)))) throw fail(`"${d.label}" must be a number`);
    out.push({ label: d.label, value: v });
  }
  return out;
}
export const answersLines = answers => (Array.isArray(answers) ? answers : []).filter(a => a?.label && a?.value).map(a => `${a.label}: ${a.value}`);
