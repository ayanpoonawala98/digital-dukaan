import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
export default function WhatsAppIntegration({ token, storeId }) {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [text, setText] = useState('Digital Dukaan sandbox test. This is a test message, not a customer offer.');
  useEffect(() => { let active = true; setStatus(null); setResult(null); setError(''); api(`/owner/${storeId}/whatsapp-cloud/status`, { token }).then(data => { if (active) setStatus(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [token, storeId]);
  const test = async e => { e.preventDefault(); setBusy(true); setError(''); setResult(null); try { setResult(await api(`/owner/${storeId}/whatsapp-cloud/sandbox-check`, { token, method: 'POST', body: { text } })); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="dashboard-panel"><h3>WhatsApp Cloud integration</h3><p>Sandbox setup only. Nothing on this page sends a message or changes your live WhatsApp number.</p>{error && <p role="alert" className="notice error">{error}</p>}{!status && !error && <p role="status">Loading integration status...</p>}{status && <>
    <div className="notice wa-integration-notice"><strong>{status.cloudEnabled ? 'Cloud webhook enabled' : 'Cloud messaging OFF'}</strong><p>Live connection and message delivery have not been verified. This is not an inbox or an automatic order-alert system.</p></div>
    <dl><dt>Mode</dt><dd>Meta test number only</dd><dt>Test number</dt><dd>{status.testNumber}</dd><dt>Phone Number ID</dt><dd>{status.phoneNumberId}</dd><dt>WABA ID</dt><dd>{status.wabaId}</dd><dt>Access token configured</dt><dd>{status.tokenConfigured ? 'Yes (server only, validity not checked)' : 'No'}</dd><dt>Webhook secrets configured</dt><dd>{status.webhookConfigured ? 'Yes (verification not checked)' : 'No'}</dd><dt>Real test sends</dt><dd>{status.testSendEnabled ? 'Gate enabled, approval still required' : 'OFF'}</dd><dt>Approved recipient configured</dt><dd>{status.recipientConfigured ? 'Yes, server allowlist only' : 'No'}</dd></dl>
    <h4>Local sandbox check</h4><p>This validates the text and runs a simulated request with a fake transport. It does not call Meta. A successful check does not mean the token or WhatsApp account is connected.</p>
    <form onSubmit={test}><label>Test message<textarea required rows={3} maxLength={4096} value={text} onChange={e => setText(e.target.value)} /></label><button className="btn btn-green" disabled={busy}>{busy ? 'Checking...' : 'Run sandbox check (no send)'}</button></form>
    {result && <div className="notice wa-integration-notice" role="status"><strong>Sandbox check passed. No message sent.</strong><p>{result.checks.join(' · ')}</p></div>}
    <h4>Before a real test</h4><p>Configure the temporary token and webhook secrets securely on the server, verify the Meta test recipient, then review the exact recipient and message before enabling a test send. This page does not collect tokens or passwords.</p>
  </>}</div>;
}
