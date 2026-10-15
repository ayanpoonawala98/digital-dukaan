// Reserved-table order gate for dine-in orders. The owner reserves a table for a phone number (a hold with a phone);
// while it is active, an order on that table is accepted only from the reserved phone - proved by a verified WhatsApp
// session where the store has phone verification, or typed once, which also binds that browser so repeat orders from
// the same browser just work. Everyone else is refused. Ordering must never break on a schema or database hiccup, so a
// gate failure logs and lets the order through (same fail-open rule as the anti-fraud signals).
import { createHash } from 'node:crypto';
import { TableHold, ensureTableBillSchema } from './table-bills.js';
import { platformSession } from '../whatsapp/storefront-verify.js';
import { orderPhone } from '../crm/customer-pure.js';
import { bad } from '../../shared/utils/core.js';

const sha = v => createHash('sha256').update(String(v)).digest('hex');
const browserId = req => { const b = String(req.headers?.['x-ds-browser'] || ''); return /^[A-Za-z0-9_-]{20,64}$/.test(b) ? b : ''; };
const RESERVED_MSG = 'This table is reserved. Please order with the phone number it was reserved with.';
const reserved = () => Object.assign(bad(409, RESERVED_MSG), { code: 'TABLE_RESERVED' });

// Throws TABLE_RESERVED when this dine-in order is not from the reserving phone or browser. No-op when the table is free.
export async function gateReservedTable(req, business, table, rawPhone) {
  let hold;
  try {
    await ensureTableBillSchema();
    hold = await TableHold.findOne({ where: { businessId: business.id, tableNumber: table } });
  } catch (err) {
    console.error('Table reservation check failed; order allowed', { businessId: business.id, tableNumber: table, message: err.message });
    return;
  }
  if (!hold || !hold.phone) return; // no reservation (a plain "occupied" hold gates nothing)
  let auth = null;
  try { auth = await platformSession(req); } catch { auth = null; }
  const bind = async () => {
    const b = browserId(req);
    if (b && !hold.browserHash) await hold.update({ browserHash: sha(b) }).catch(err => console.error('Reservation browser bind failed', { message: err.message }));
  };
  if (auth && auth.identity.phone === hold.phone) { await bind(); return; }
  const browser = browserId(req);
  if (browser && hold.browserHash && sha(browser) === hold.browserHash) return;
  const typed = orderPhone(rawPhone);
  if (typed && typed === hold.phone) { await bind(); return; }
  throw reserved();
}
