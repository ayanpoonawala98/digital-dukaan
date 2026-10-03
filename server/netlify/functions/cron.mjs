// Netlify scheduled function: runs the two daily jobs by calling this site's own guarded internal routes.
export const config = { schedule: '30 3 * * *' };
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const headers = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  for (const path of ['/api/internal/purge-expired-stores', '/api/internal/daily-alerts']) {
    try { const r = await fetch(base + path, { headers }); console.log(path, r.status); } catch (e) { console.error(path, e.message); }
  }
};
