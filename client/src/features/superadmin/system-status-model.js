// Pure helpers for the System status page. No network, no DOM.
export const STATE_META = {
  ok: { cls: 'ok', word: 'Operational' },
  attention: { cls: 'attention', word: 'Needs attention' },
  failed: { cls: 'failed', word: 'Failed' },
  unknown: { cls: 'unknown', word: 'Not verified' },
  neutral: { cls: 'neutral', word: 'Off' },
  checking: { cls: 'checking', word: 'Checking' }
};
export const CHECK_TYPE_LABEL = { connectivity: 'Connectivity', configuration: 'Configuration only', activity: 'Recent activity' };

export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}
// "2:01:05 PM IST" in the viewer's own time zone, plus the age.
export function formatChecked(iso, nowMs = Date.now(), locale = 'en-IN') {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return { clock: '', age: '' };
  let clock = '';
  try { clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(t)); } catch { clock = new Date(t).toISOString(); }
  return { clock, age: formatAge(nowMs - t) };
}
export const isStale = (row, ttlMs, nowMs = Date.now()) => row.stale === true || (row.checkType === 'connectivity' && row.checkedAt && ttlMs && nowMs - Date.parse(row.checkedAt) > ttlMs && row.code !== 'NOT_CHECKED');

// Rows as shown: stale results never look fresh-green, checking rows never keep their old colour.
export function displayRows(rows, { ttlMs, nowMs = Date.now(), checking = false, stale = false } = {}) {
  return rows.map(r => {
    if (checking && r.checkType === 'connectivity' && r.state !== 'neutral') return { ...r, state: 'checking', label: 'Checking', reason: '', nextStep: '', verified: false, stale: false };
    if (stale || isStale(r, ttlMs, nowMs)) {
      if (r.state === 'ok') return { ...r, state: 'unknown', label: `Stale (was ${r.label.toLowerCase()})`, verified: false, stale: true, reason: 'This result is older than the freshness window.', nextStep: 'Press Check connections.' };
      return { ...r, stale: true };
    }
    return r;
  });
}
export function summarize(rows) {
  const counted = rows.filter(r => !r.excluded && r.state !== 'neutral' && r.state !== 'checking');
  return {
    operational: counted.filter(r => r.checkType === 'connectivity' && r.state === 'ok' && r.verified && !r.stale).length,
    attention: counted.filter(r => r.state === 'attention').length,
    failed: counted.filter(r => r.state === 'failed').length,
    notChecked: rows.filter(r => !r.excluded && (r.state === 'checking' || r.state === 'unknown')).length
  };
}
// "Checked connections operational" only when every enabled connectivity probe passed, fresh, and at least one ran.
export function allConnectivityOperational(rows) {
  const c = rows.filter(r => r.checkType === 'connectivity' && r.state !== 'neutral');
  return c.length > 0 && c.every(r => r.state === 'ok' && r.verified && !r.stale);
}
export function buildFrontendRows(backendRows, fe) {
  const out = [];
  const be = backendRows.find(r => r.id === 'build:be-revision');
  const beRev = be?.detail || '';
  const feRev = (fe?.revision || '').slice(0, 7).toLowerCase();
  const mk = (id, name, value, extra = {}) => ({ id, section: 'Build information', scope: 'platform', storeId: null, name, checkType: 'configuration', state: value ? 'ok' : 'unknown', label: value ? 'Known' : 'Unknown', code: value ? 'BUILD_OK' : 'BUILD_UNKNOWN', reason: value ? '' : 'No deployment metadata is available.', nextStep: '', latencyMs: null, checkedAt: null, detail: value || '', verified: Boolean(value), excluded: false, ...extra });
  out.push(mk('build:fe-version', 'Frontend version', fe?.version || ''));
  out.push(mk('build:fe-revision', 'Frontend revision', feRev));
  if (beRev && feRev && !(beRev.startsWith(feRev) || feRev.startsWith(beRev))) {
    out.push({ ...mk('build:mismatch', 'Frontend and backend revisions', `${feRev} / ${beRev}`), state: 'attention', label: 'Revisions differ', code: 'BUILD_MISMATCH', reason: 'The frontend and backend report different revisions.', nextStep: 'Confirm both were deployed from the same commit.', verified: false });
  }
  return out;
}
export function groupBySection(rows, names) {
  return names.map(name => ({ name, rows: rows.filter(r => r.section === name) }));
}
export const scopeLabel = (row, storeName) => (row.scope === 'store' ? `Store${storeName ? `: ${storeName}` : ''}` : 'Platform');
// Short, stable text for a row's accessible name.
export const rowAriaLabel = (row, storeName) => `${row.name}, ${scopeLabel(row, storeName)}, ${CHECK_TYPE_LABEL[row.checkType] || ''}: ${row.label}`;
export const latencyText = row => (row.checkType === 'connectivity' && Number.isFinite(row.latencyMs) && row.state !== 'checking' ? `${row.latencyMs} ms` : 'Not measured');
// Keep the last good snapshot when a refresh fails.
export function afterRefresh(prev, result) {
  return result.ok ? { snap: result.data, unavailable: false } : { snap: prev, unavailable: true };
}
