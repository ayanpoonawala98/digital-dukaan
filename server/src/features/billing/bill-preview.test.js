import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBillPath, billPage, previewImage } from '../../../../client/netlify/edge-functions/bill-preview.js';
import { shareImage } from '../../../../client/netlify/edge-functions/store-preview.js';
const sig = 'a'.repeat(32);
test('parses main-domain and bill subdomain paths', () => {
  assert.deepEqual(parseBillPath('digitalshop.website', `/bill/lead/35/${sig}`), { kind: 'lead', id: '35', sig });
  assert.equal(parseBillPath('digitalshop.website', `/lead/35/${sig}`), null);
  assert.deepEqual(parseBillPath('bill.digitalshop.website', `/restaurant/7/${sig}`), { kind: 'restaurant', id: '7', sig });
  assert.equal(parseBillPath('bill.digitalshop.website', '/lead/x/zz'), null);
});
test('bill page carries store name, image, total and escapes', () => {
  const html = billPage({ kind: 'lead', id: '35', sig }, { store: { name: 'Ashiya <b>ANTI TARNISH', logoUrl: 'https://ik.imagekit.io/x/l.png' }, number: 35, total: 1499 }, 'https://bill.digitalshop.website/lead/35/' + sig);
  assert.match(html, /Order bill #35 - Ashiya &lt;b&gt;ANTI TARNISH/);
  assert.match(html, /1,499/);
  assert.match(html, /og:image" content="https:\/\/ik\.imagekit\.io\/x\/l\.png\?tr=/);
  assert.doesNotMatch(html, /<b>/);
});
test('image falls back logo -> cover -> default', () => {
  assert.match(previewImage('', 'https://ik.imagekit.io/c.png'), /c\.png/);
  assert.match(previewImage('', ''), /digital-dukaan-hero/);
  assert.match(shareImage('', 'https://ik.imagekit.io/c.png'), /c\.png/);
  assert.equal(shareImage(''), '');
});
