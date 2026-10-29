import { verifyHeaders, needsCredentials } from './phone-verify.js';
import { notify, successFor } from '../../features/notifications/notifications.js';
const BASE = import.meta.env.VITE_API_URL || '';
export const imageSrc = url => url?.startsWith('/uploads/') ? `${BASE}${url}` : url;
export const inr = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
// Bare server 403s that say nothing useful; show the friendlier translated line instead.
const GENERIC_403 = new Set(['Not allowed', 'Account unavailable']);
const reason403 = text => (text && !GENERIC_403.has(text) ? text : 'Kindly contact admin to enable access.');
export async function api(path, { token, body, feedback = true, successMessage, ...options } = {}) {
  const isForm = body instanceof FormData;
  const method = (options.method || 'GET').toUpperCase();
  let data;
  let status = 0;
  try {
    const res = await fetch(`${BASE}/api${path}`, { cache: 'no-store', ...(needsCredentials(path) ? { credentials: 'include' } : {}), ...options, headers: { ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...verifyHeaders(path, method), ...options.headers }, body: isForm ? body : body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(Error(res.status === 403 ? reason403(data?.error) : data?.error || 'Something went wrong. Please try again.'), { code: data?.code });
  } catch (error) {
    const message = error instanceof TypeError ? 'Unable to connect. Check your internet connection and try again.' : error.message;
    if (feedback) notify('error', message);
    throw Object.assign(Error(message), { status, code: error.code });
  }
  if (feedback && !['GET', 'HEAD', 'OPTIONS'].includes(method)) notify('success', successMessage || successFor(path, method, data));
  return data;
}
export async function download(path, filename, token) {
  try {
    const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) { const d = res.status === 403 ? await res.json().catch(() => ({})) : null; throw Error(res.status === 403 ? reason403(d?.error) : 'Download failed. Please try again.'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('success', 'Download started.');
  } catch (error) { notify('error', error.message); throw error; }
}
