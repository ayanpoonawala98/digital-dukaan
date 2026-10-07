import test from 'node:test';
import assert from 'node:assert/strict';
import { businessOrderPanelUrl, whatsappUrl, whatsappCartUrl } from './utils/core.js';
test('cart and product WhatsApp messages carry the correct private order-panel link', () => {
  const store = {name:'QA',slug:'qa-test-store-20261001',whatsapp:'910000000000'};
  const link = businessOrderPanelUrl(store);
  assert.ok(link.endsWith('/dashboard?store=qa-test-store-20261001&tab=leads'));
  for (const url of [whatsappUrl(store,{id:1,name:'Test',price:49},''),whatsappCartUrl(store,[{qty:1,name:'Test',price:49}],49,0,49,'https://digitalshop.website/store/qa-test-store-20261001')]) {
    const text = new URL(url).searchParams.get('text');
    assert.ok(text.includes(`Order panel (shop owner): ${link}`));
    assert.equal(new URL(url).pathname,'/910000000000');
    assert.ok(!text.includes('token='));
  }
});
