// Pure rules for the Custom domains page: state labels and tones, step labels, record cards, and what actions are enabled.
export const STATE_LABELS = { pending_dns: 'Pending DNS', verifying: 'Verifying', provisioning: 'Provisioning HTTPS', server_setup_required: 'Server setup required', ready_to_activate: 'Ready to activate', live: 'Live', failed: 'Needs attention', disconnected: 'Disconnected' };
export const TONES = { live: 'green', pending_dns: 'amber', verifying: 'amber', provisioning: 'amber', server_setup_required: 'amber', ready_to_activate: 'amber', failed: 'red', disconnected: 'neutral' };
export const STEP_LABELS = { ok: 'Verified', pending: 'Pending', failed: 'Failed', unknown: 'Not checked', setup_required: 'Server setup required' };
export const CODE_TEXT = {
  OWNERSHIP_MISSING: 'The ownership record was not found yet.', OWNERSHIP_EXPIRED: 'The ownership record expired.', DNS_MISMATCH: 'DNS points somewhere other than the Digital Shop server.', DNS_NOT_FOUND: 'No DNS records found for this hostname yet.',
  DOMAIN_ALREADY_ASSIGNED: 'This domain is already connected to another store.', HOSTING_CONFLICT: 'The server reported a conflict for this domain.', SERVER_SETUP_REQUIRED: 'The Digital Shop server is not set up for custom domains yet.',
  TLS_PENDING: 'HTTPS is not ready yet.', TLS_FAILED: 'The HTTPS certificate is not valid for this hostname.', ROUTING_MISMATCH: 'The domain does not show the intended store.', CHECK_TIMEOUT: 'The check timed out. Result unknown.', CHECK_UNAVAILABLE: 'The check could not run. Result unknown.', RATE_LIMITED: 'Too many checks or requests. Wait a moment.', HOSTING_AUTH_REJECTED: 'The hosting credentials saved on the server were rejected.', HOSTING_UNAVAILABLE: 'The hosting service could not be reached. Result unknown.'
};
export const codeText = c => CODE_TEXT[c] || '';
export const toneOf = state => TONES[state] || 'neutral';
export const stateLabel = state => STATE_LABELS[state] || 'Unknown';
// The first step with a problem code, for the list row's reason line.
export function problemOf(d) {
  for (const [k, label] of [['ownership', 'Ownership'], ['dns', 'DNS'], ['hosting', 'Hosting'], ['https', 'HTTPS']]) {
    const s = d?.steps?.[k]; if (s?.code && s.status !== 'ok') return { step: label, code: s.code, text: codeText(s.code) };
  }
  return d?.routing?.code ? { step: 'Storefront', code: d.routing.code, text: codeText(d.routing.code) } : null;
}
export const stepsOf = d => [['Ownership', d.steps.ownership], ['DNS', d.steps.dns], ['Hosting', d.steps.hosting], ['HTTPS', d.steps.https]].map(([label, s]) => ({ label, status: s.status, text: STEP_LABELS[s.status] || 'Not checked', tone: s.status === 'ok' ? 'green' : s.status === 'failed' ? 'red' : s.status === 'setup_required' || s.status === 'pending' ? 'amber' : 'neutral', checkedAt: s.checkedAt }));
// Record cards: Type / Host / Value / TTL, each with a copy value. Routing cards appear only when the server sent them.
export const recordCards = d => [...(d.records?.ownership ? [{ kind: 'Ownership', ...d.records.ownership }] : []), ...(d.records?.routing || []).map(r => ({ kind: 'Routing', ...r }))].map(r => ({ ...r, ttlText: `${r.ttl} seconds` }));
export const actions = d => ({
  check: d.state !== 'disconnected', activate: !!d.canActivate && !d.serverSetupRequired && d.state === 'ready_to_activate',
  provision: !d.serverSetupRequired && d.steps.ownership.status === 'ok' && d.steps.dns.status === 'ok' && !['live', 'disconnected'].includes(d.state) && d.state !== 'ready_to_activate' && d.steps.hosting.status !== 'ok',
  rotate: d.steps.ownership.status !== 'ok' && d.state !== 'disconnected', guide: d.serverSetupRequired ? 'generic' : 'personal', disconnect: d.state !== 'disconnected'
});
// 1-based index into FLOW of the CURRENT step. A saved domain has finished select, enter, review and save, so the current step is
// verification (5) or later. Live means every step is done (8, past the last).
export const flowStep = d => {
  if (d.state === 'disconnected') return 0;
  if (d.state === 'live') return FLOW.length + 1;
  if (d.state === 'ready_to_activate') return 7;
  if (d.state === 'provisioning') return 6;
  if (d.state === 'failed') return ['hosting', 'https'].some(k => d.steps?.[k]?.status === 'failed') || d.routing?.status === 'failed' ? 6 : 5;
  return 5;
};
export const FLOW = ['Select store', 'Enter hostname', 'Review', 'Save pending', 'Verify ownership and DNS', 'Provision HTTPS', 'Activate'];
export const age = (iso, now = Date.now()) => { if (!iso) return 'Never'; const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
export const confirmDisconnectText = d => `Disconnect ${d.hostname} from ${d.storeName || 'this store'}? The store, products and orders are not changed. Remove the DNS records at the client's DNS provider afterwards.`;
// What the list area shows. A failure never shows alongside a loading line, and never alongside stale rows as if they were fresh.
export const listState = ({ list, err }) => err ? 'error' : !list ? 'loading' : list.domains?.length ? 'ready' : 'empty';
export const LOAD_FAILED = { title: 'Could not load domains', body: 'The domain list could not be loaded. Nothing was changed. Check your connection and try again.' };
// Designed client guides (v1.0), shipped as static client assets. The per-domain guide stays a text file.
export const CLIENT_GUIDES = [
  { lang: 'en', label: 'Client guide (English, PDF)', href: '/guides/digital-shop-custom-domain-client-guide-en.pdf', file: 'digital-shop-custom-domain-client-guide-en.pdf' },
  { lang: 'hi', label: 'Client guide (Hindi, PDF)', href: '/guides/digital-shop-custom-domain-client-guide-hi.pdf', file: 'digital-shop-custom-domain-client-guide-hi.pdf' }
];
