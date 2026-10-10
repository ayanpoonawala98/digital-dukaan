import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('customer on-state requires actual enrollment of every displayed order',()=>{
 const s=fs.readFileSync(new URL('../../../../client/src/features/storefront/OrderTracking.jsx',import.meta.url),'utf8');
 assert.match(s,/states.every\(s => s.enrolled\)/);assert.match(s,/token: o.token/);assert.ok(!s.includes("localStorage.getItem(`dd-push-on-${slug}`)"));
 const effect=s.slice(s.indexOf('const orderKey'),s.indexOf('if (!supported) return null',s.indexOf('const orderKey')));
 assert.ok(!effect.includes("method: 'POST'"));
});
test('bill links carry design revision and responses disallow caching',()=>{
 const s=fs.readFileSync(new URL('../billing/invoice.js',import.meta.url),'utf8');assert.match(s,/\?design=2/);assert.match(s,/private, no-store, max-age=0/);assert.match(s,/-v2.pdf/);
});
