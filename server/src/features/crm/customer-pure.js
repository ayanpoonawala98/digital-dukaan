// Pure helpers for the Customers section. No database access, so they are unit tested directly.
const IN_MOBILE = /^[6-9]\d{9}$/;

// Order forms accept loose phone numbers. Customers are keyed by digits with country code,
// matching what the CRM stores ("919876543210"). A bare 10 digit Indian mobile gets 91.
export function orderPhone(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (IN_MOBILE.test(d)) return `91${d}`;
  if (d.length === 11 && d.startsWith('0') && IN_MOBILE.test(d.slice(1))) return `91${d.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}
export const cleanOrderEmail = value => {
  const e = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return e && e.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};
export const orderAmount = order => {
  const n = Number(order?.total ?? order?.price ?? 0);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0;
};
// Short, human label for a browser so the admin can tell devices apart. Never stores the raw agent.
export function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Firefox\//i.test(ua) ? 'Firefox' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}
// Notification pictures: the shop logo is the small icon (square 192), the cover or a chosen ImageKit picture is the big image (1200x630).
const ikResize = (value, tr) => { try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password) return ''; if (u.hostname === 'ik.imagekit.io' && !u.searchParams.has('tr')) u.search = `?tr=${tr}`; return u.href; } catch { return ''; } };
export const pushIcon = store => ikResize(store?.logoUrl, 'w-192,h-192,c-at_max,f-png') || '/icon-192.png';
export function pushPicture(store, choice) {
  if (choice === 'none') return '';
  const own = typeof choice === 'string' && /^https:\/\/ik\.imagekit\.io\/[^\s]{1,300}$/.test(choice) ? choice : '';
  return ikResize(own || store?.coverUrl || '', 'w-1200,h-630,c-at_max,f-jpg,q-80');
}
// Admin-written push. Title and body are plain text; the link must stay inside this shop.
export function pushMessage(input, store) {
  const title = String(input?.title ?? '').trim(), body = String(input?.body ?? '').trim();
  if (!title || title.length > 65) return { error: 'Title is required, up to 65 characters' };
  if (!body || body.length > 180) return { error: 'Message is required, up to 180 characters' };
  let url = `/store/${store.slug}`;
  if (input?.url !== undefined && input.url !== '') {
    const u = String(input.url);
    if (!u.startsWith(`/store/${store.slug}`) || u.startsWith('//') || u.length > 300 || /[\s\\]/.test(u)) return { error: 'Link must be a page of this shop' };
    url = u;
  }
  return { title, body, url, payload: JSON.stringify({ title, body, url, icon: pushIcon(store), badge: '/icon-192.png', ...(pushPicture(store, input?.image) ? { image: pushPicture(store, input?.image) } : {}) }) };
}
// Push goes to a customer's devices unless they opted out or were removed. The browser permission itself is the opt-in.
export const canPush = customer => !customer.archivedAt && customer.optInStatus !== 'opted_out';
// Email and SMS need the shop's own provider, a usable address and recorded opt-in. Push needs a device.
export function channelAvailability(customer, devices, providers) {
  const optedIn = customer.optInStatus === 'opted_in' && !customer.archivedAt;
  const phoneOk = Boolean(orderPhone(customer.phone));
  const reason = (ok, provider, address, label) => ok ? '' : !provider ? `Connect your own ${label} provider in Notifications first` : !address ? `No ${label === 'email' ? 'email' : 'phone'} saved` : 'Customer has not opted in';
  return {
    push: { enabled: devices > 0 && canPush(customer), reason: devices > 0 ? (canPush(customer) ? '' : 'Customer opted out') : 'No browser registered yet' },
    email: { enabled: Boolean(providers?.email && customer.email && optedIn), reason: reason(Boolean(providers?.email && customer.email && optedIn), providers?.email, customer.email, 'email') },
    sms: { enabled: Boolean(providers?.sms && phoneOk && optedIn), reason: reason(Boolean(providers?.sms && phoneOk && optedIn), providers?.sms, phoneOk, 'SMS') }
  };
}
// Sends in small parallel chunks; a gone browser (404/410) is reported so the caller can delete it.
export async function sendToDevices(devices, payload, send, { chunk = 20 } = {}) {
  let sent = 0, failed = 0; const gone = [];
  for (let i = 0; i < devices.length; i += chunk) {
    await Promise.all(devices.slice(i, i + chunk).map(async d => {
      try { await send({ endpoint: d.endpoint, keys: d.keys }, payload); sent++; }
      catch (err) { failed++; if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(d); }
    }));
  }
  return { sent, failed, gone };
}
