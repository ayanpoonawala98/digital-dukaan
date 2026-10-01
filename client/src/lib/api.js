import { notify, successFor } from './notifications.js';
const BASE = import.meta.env.VITE_API_URL || '';
export const imageSrc = url => url?.startsWith('/uploads/') ? `${BASE}${url}` : url;
export const inr = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export async function api(path, { token, body, feedback = true, successMessage, ...options } = {}) {
  const isForm = body instanceof FormData;
  const method = (options.method || 'GET').toUpperCase();
  let data;
  try {
    const res = await fetch(`${BASE}/api${path}`, { cache: 'no-store', ...options, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, body: isForm ? body : body === undefined ? undefined : JSON.stringify(body) });
    data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw Error(res.status === 403 ? 'Kindly contact admin to enable access.' : data?.error || 'Something went wrong. Please try again.');
  } catch (error) {
    const message = error instanceof TypeError ? 'Unable to connect. Check your internet connection and try again.' : error.message;
    if (feedback) notify('error', message);
    throw Error(message);
  }
  if (feedback && !['GET', 'HEAD', 'OPTIONS'].includes(method)) notify('success', successMessage || successFor(path, method, data));
  return data;
}
export async function download(path, filename, token) {
  try {
    const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw Error(res.status === 403 ? 'Kindly contact admin to enable access.' : 'Download failed. Please try again.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('success', 'Download started.');
  } catch (error) { notify('error', error.message); throw error; }
}
