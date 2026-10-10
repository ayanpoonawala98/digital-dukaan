import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerMessages } from './owner-messages.js';
import { translateOwner, translateOwnerPlan, registerOwnerMessages, ownerLanguageKey, readOwnerLanguage, validationMessage } from './owner-i18n.js';
registerOwnerMessages(ownerMessages);
const placeholders = text => [...text.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map(m=>m[1]).sort();
test('every dictionary entry has Hindi and Marathi and identical interpolation fields', () => {
  for (const [english, values] of Object.entries(ownerMessages)) {
    for (const language of ['hi','mr']) {
      assert.ok(values[language]?.trim(), `${language}: ${english}`);
      assert.deepEqual(placeholders(values[language]), placeholders(english), `${language}: ${english}`);
    }
  }
});
test('English source and unknown server messages are not rewritten', () => {
  assert.equal(translateOwner('en','Price (₹)'), 'Price (₹)');
  assert.equal(translateOwner('mr','New provider error 123'), 'New provider error 123');
  assert.equal(translateOwner('en','Photo {v0}',{v0:3}), 'Photo 3');
});
test('interpolation preserves customer data and provider double-brace placeholders', () => {
  assert.equal(translateOwner('hi','Delete {v0}?',{v0:'Rice <script> $10'}), 'Rice <script> $10 मिटाएँ?');
  assert.equal(translateOwner('en','{{to}} {v0}',{to:'DO NOT REPLACE',v0:7}), '{{to}} 7');
});
test('language preference is isolated by user, validates locale and tolerates blocked storage', () => {
  assert.notEqual(ownerLanguageKey({id:1}),ownerLanguageKey({id:2}));
  assert.equal(readOwnerLanguage({id:1},{getItem:key=>key.endsWith(':1')?'mr':'hi'}),'mr');
  assert.equal(readOwnerLanguage({id:1},{getItem:()=> 'fr'}),'en');
  assert.equal(readOwnerLanguage({id:1},{getItem:()=>{throw Error('blocked')}}),'en');
});
test('plan translation preserves all trial dates, due dates and months', () => {
  for(const lang of ['en','hi','mr']){
    const trial = translateOwnerPlan(lang,'Free trial: 20 days left (ends 2026-10-31).');
    assert.match(trial,/20/);assert.match(trial,/2026-10-31/);
    const due = translateOwnerPlan(lang,'Payment overdue for 2026-11. Due 2026-11-10. Pay Digital Shop and they will mark it paid.');
    assert.match(due,/2026-11/);assert.match(due,/2026-11-10/);assert.match(due,/Digital Shop/);
    assert.equal(translateOwnerPlan(lang,'Free trial altered by server'), 'Free trial altered by server');
  }
});
test('localized validation keeps HTML constraints unchanged', () => {
  assert.equal(validationMessage({valueMissing:true},{},'hi'),'यह फ़ील्ड भरें।');
  assert.match(validationMessage({rangeUnderflow:true},{min:12},'mr'), /12/);
  assert.match(validationMessage({typeMismatch:true},{type:'email'},'mr'), /ईमेल/);
});
