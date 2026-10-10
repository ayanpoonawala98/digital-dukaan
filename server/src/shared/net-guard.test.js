import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, looksInternal, publicAddress } from './net-guard.js';

test('blocks IPv4-mapped and embedded IPv6 forms of internal addresses', () => {
  for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:127.0.0.1', '::ffff:a00:1', '::ffff:c0a8:101', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b::10.0.0.1', '2002:7f00:1::', '2002:a00:1::1', '::', '::1', '0:0:0:0:0:0:0:1', 'fe80::1', 'fec0::1', 'fd12::1', 'ff02::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(looksInternal('[::ffff:7f00:1]'), true);
});
test('allows public IPv4, mapped public IPv4 and public IPv6', () => {
  for (const ip of ['8.8.8.8', '::ffff:8.8.8.8', '::ffff:808:808', '2001:4860:4860::8888', '2606:4700:4700::1111', '64:ff9b::808:808']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
test('a hostname that resolves to a mapped private address is refused', async () => {
  await assert.rejects(publicAddress('evil.example.com', async () => [{ address: '::ffff:7f00:1' }]), /not allowed/);
  assert.equal(await publicAddress('ok.example.com', async () => [{ address: '8.8.8.8' }]), '8.8.8.8');
});
