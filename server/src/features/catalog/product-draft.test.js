import test from 'node:test';
import assert from 'node:assert/strict';
import { productDraft } from '../../../../client/src/features/dashboard/product-draft.js';
test('new product store wrapper uses create defaults including checked visibility and first category', () => {
  const draft = productDraft({ __storeId: 1 }, [{ id: 12 }]);
  assert.equal(draft.active, true);
  assert.equal(draft.category, 12);
  assert.equal(draft.name, '');
  assert.equal(draft.featured, false);
  assert.equal(draft.stock, '');
  assert.equal({ ...draft, active: !draft.active }.active, false);
});
test('editing preserves hidden products, zero stock, images and service fields', () => {
  const p={id:3, name:'Hidden service', price:12, active:false,stock:0,categoryId:9,kind:'service',duration:'20 min',imageUrl:'https://example.test/p.png'};
  const draft=productDraft(p,[{id:12}]);
  assert.equal(draft.active,false); assert.equal(draft.stock,0);assert.equal(draft.category,9);assert.equal(draft.duration,'20 min');assert.deepEqual(draft.imageUrls,[p.imageUrl]);
});
