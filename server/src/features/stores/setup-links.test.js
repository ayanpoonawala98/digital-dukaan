import test from 'node:test';
import assert from 'node:assert/strict';
import { mintSetupLink, hashToken, SETUP_LINK_TTL_MS } from './setup-links.js';
// Same rule as validInvite in owner-invites.js (not imported: that module needs a database at load).
const validInvite = (u, token, now = Date.now()) => /^[a-f0-9]{64}$/.test(token) && u.passwordSetupHash === hashToken(token) && new Date(u.passwordSetupExpiresAt).getTime() > now;

const fakeUser = () => ({ id: 7, email: 'o@x.co', role: 'owner', active: true, passwordSetupHash: null, passwordSetupExpiresAt: null, async update(v) { Object.assign(this, v); } });

test('minted link stores only the hash, expires in 24h and validates once', async () => {
  const u = fakeUser(), now = Date.now();
  const { url, expiresAt } = await mintSetupLink(u, 1, 'https://shop.example', now);
  const token = new URL(url).hash.match(/token=([a-f0-9]{64})/)[1];
  assert.equal(u.passwordSetupHash, hashToken(token));
  assert.notEqual(u.passwordSetupHash, token);
  assert.equal(expiresAt.getTime() - now, SETUP_LINK_TTL_MS);
  assert.ok(validInvite(u, token, now + 1000));
  assert.ok(!validInvite(u, token, now + SETUP_LINK_TTL_MS + 1000));
});

test('a new link invalidates the previous one', async () => {
  const u = fakeUser();
  const a = new URL((await mintSetupLink(u, 1, 'https://shop.example')).url).hash.match(/token=([a-f0-9]{64})/)[1];
  const b = new URL((await mintSetupLink(u, 1, 'https://shop.example')).url).hash.match(/token=([a-f0-9]{64})/)[1];
  assert.ok(!validInvite(u, a));
  assert.ok(validInvite(u, b));
});
