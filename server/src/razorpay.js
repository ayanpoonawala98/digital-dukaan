// Razorpay Payment Links, per store. The store owner brings their own Razorpay keys (stored encrypted, never returned).
// Payment is only marked paid after Razorpay itself reports status "paid" for that exact link.
const API = 'https://api.razorpay.com/v1';
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };

export const keyMode = id => (/^rzp_live_/.test(id) ? 'live' : /^rzp_test_/.test(id) ? 'test' : '');
export function mergePaymentKeys(current = {}, input = {}) {
  const next = { ...current };
  if (input.clear === true) return {};
  if (input.keyId !== undefined) {
    const id = String(input.keyId).trim();
    if (id && !/^rzp_(live|test)_[A-Za-z0-9]{8,40}$/.test(id)) throw fail(400, 'Razorpay Key ID looks like rzp_live_xxxxxxxx or rzp_test_xxxxxxxx');
    next.keyId = id;
  }
  if (input.keySecret !== undefined && String(input.keySecret).trim() !== '') {
    const sec = String(input.keySecret).trim();
    if (!/^[A-Za-z0-9]{10,64}$/.test(sec)) throw fail(400, 'Razorpay Key Secret is not in the expected format');
    next.keySecret = sec;
  }
  if (next.keySecret && !next.keyId) throw fail(400, 'Add the Razorpay Key ID too');
  return next;
}
export const paymentView = (c = {}) => ({ configured: Boolean(c.keyId && c.keySecret), keyId: c.keyId ? `${c.keyId.slice(0, 9)}...${c.keyId.slice(-3)}` : '', keySecretSaved: Boolean(c.keySecret), mode: keyMode(c.keyId || '') });

const auth = c => `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64')}`;
async function call(creds, method, path, body, fetcher = fetch) {
  if (!creds?.keyId || !creds?.keySecret) throw fail(400, 'Online payments are not set up yet. Add your Razorpay keys first.');
  let res;
  try { res = await fetcher(`${API}${path}`, { method, headers: { authorization: auth(creds), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) }); }
  catch { throw fail(502, 'Could not reach Razorpay. Try again in a moment.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(res.status === 401 ? 400 : 502, res.status === 401 ? 'Razorpay rejected these keys. Check the Key ID and Secret.' : `Razorpay: ${String(data?.error?.description || 'could not create the link').slice(0, 160)}`);
  return data;
}
// amount in rupees; Razorpay needs integer paise and at least Rs 1.
export async function createPaymentLink(creds, { amount, referenceId, description, name, phone }, fetcher) {
  const paise = Math.round(Number(amount) * 100);
  if (!Number.isFinite(paise) || paise < 100) throw fail(400, 'Order total must be at least Rs 1 for an online payment link');
  if (paise > 50000000) throw fail(400, 'Order total is too large for a payment link');
  const digits = String(phone || '').replace(/\D/g, '');
  const body = { amount: paise, currency: 'INR', accept_partial: false, reference_id: String(referenceId).slice(0, 40), description: String(description).slice(0, 2000), notify: { sms: false, email: false }, reminder_enable: false, expire_by: Math.floor(Date.now() / 1000) + 7 * 86400 + 120 };
  if (name || digits.length >= 10) body.customer = { ...(name ? { name: String(name).slice(0, 50) } : {}), ...(digits.length >= 10 ? { contact: `+${digits.length === 10 ? '91' : ''}${digits}` } : {}) };
  const data = await call(creds, 'POST', '/payment_links', body, fetcher);
  if (!data.id || !/^https:\/\//.test(data.short_url || '')) throw fail(502, 'Razorpay did not return a payment link');
  return { id: data.id, url: data.short_url, status: data.status || 'created' };
}
export async function fetchPaymentLink(creds, id, fetcher) {
  if (!/^plink_[A-Za-z0-9]+$/.test(String(id))) throw fail(400, 'No payment link on this order');
  const data = await call(creds, 'GET', `/payment_links/${id}`, null, fetcher);
  return { status: String(data.status || ''), paid: data.status === 'paid', amountPaid: Number(data.amount_paid || 0) / 100 };
}
export async function verifyKeys(creds, fetcher) { await call(creds, 'GET', '/payment_links?count=1', null, fetcher); return true; }
