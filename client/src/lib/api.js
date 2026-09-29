const BASE = import.meta.env.VITE_API_URL || '';
export const imageSrc = url => url?.startsWith('/uploads/') ? `${BASE}${url}` : url;
export const inr = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export async function api(path, { token, body, ...options } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}/api${path}`, { cache: 'no-store', ...options, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, body: isForm ? body : body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(data.error || `Request failed (${res.status})`);
  return data;
}
export async function download(path, filename, token) {
  const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
