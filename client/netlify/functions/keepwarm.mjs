// Pings the API every 10 minutes so the free Render instance does not go to sleep.
export default async () => {
  const started = Date.now();
  try {
    const res = await fetch('https://digital-dukaan-api.onrender.com/api/health', { headers: { 'user-agent': 'digitalshop-keepwarm' } });
    console.log('keepwarm', res.status, Date.now() - started, 'ms');
  } catch (e) { console.log('keepwarm failed', e.message); }
};
export const config = { schedule: '*/10 * * * *' };
