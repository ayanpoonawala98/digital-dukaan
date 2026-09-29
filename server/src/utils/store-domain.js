import { bad } from './core.js';

const root = 'digitaldukaan.space';
const project = 'prj_HthHROqjsyYN3hwpf90ksDXNDhBc';
const team = 'team_JZknP7y30o5ZLxIvDZrsxhRV';
const reserved = new Set(['api', 'www']);
export const storeDomain = slug => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || reserved.has(slug)) throw bad(400, 'This store link is reserved');
  return `${slug}.${root}`;
};
export const storeUrl = slug => `https://${storeDomain(slug)}`;
// A project-scoped Vercel token is required. No store is reported as created if
// its public domain cannot be registered. Existing domains make retries safe.
export async function registerStoreDomain(slug) {
  const token = process.env.VERCEL_STORE_DOMAIN_TOKEN;
  if (!token) throw new Error('Store domain registration is not configured');
  const name = storeDomain(slug);
  const response = await fetch(`https://api.vercel.com/v10/projects/${project}/domains?teamId=${team}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }), signal: AbortSignal.timeout(12000)
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.name === name) return name;
  // The same domain on this project is idempotent; an occupied foreign domain is not.
  if (response.status === 409) {
    const check = await fetch(`https://api.vercel.com/v10/projects/${project}/domains/${name}?teamId=${team}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000)
    });
    if (check.ok && (await check.json()).name === name) return name;
  }
  throw new Error(`Store domain registration failed (${response.status})`);
}

export async function unregisterStoreDomain(slug) {
  const token = process.env.VERCEL_STORE_DOMAIN_TOKEN;
  if (!token) throw new Error('Store domain removal is not configured');
  const name = storeDomain(slug);
  const response = await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${name}?teamId=${team}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000)
  });
  if (response.ok || response.status === 404) return;
  throw new Error(`Store domain removal failed (${response.status})`);
}
