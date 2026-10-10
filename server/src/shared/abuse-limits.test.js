import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPushEndpoint } from './abuse-limits.js';

test('push endpoints are limited to real push services', () => {
  assert.ok(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
  assert.ok(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=1'));
  assert.ok(isAllowedPushEndpoint('https://web.push.apple.com/abc'));
  for (const bad of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'not a url']) assert.ok(!isAllowedPushEndpoint(bad), bad);
});

test('owner push endpoints use the same push-host allow-list', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../routes/owner.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("'/:storeId/order-push-subscription'"));
  assert.match(block.slice(0, 1200), /isAllowedPushEndpoint\(push\.endpoint\)/);
  assert.match(block.slice(0, 600), /isAllowedPushEndpoint\(endpoint\)/);
});
