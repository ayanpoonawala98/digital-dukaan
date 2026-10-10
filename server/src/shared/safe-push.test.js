import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPush } from './safe-push.js';

test('send-time check refuses legacy endpoints outside the push services and marks them gone', async () => {
  let called = 0;
  const send = async () => { called++; return 'ok'; };
  for (const endpoint of ['https://evil.example.com/x', 'https://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://u:p@fcm.googleapis.com/x', '']) {
    await assert.rejects(sendPush({ endpoint, keys: {} }, 'p', undefined, send), e => e.statusCode === 410);
  }
  assert.equal(called, 0);
  assert.equal(await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: {} }, 'p', undefined, send), 'ok');
  assert.equal(called, 1);
});
