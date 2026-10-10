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

test('explicit source keys used by owner UI all have translations', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '../..');
  const files = [];
  const scan = dir => { for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.jsx?$/.test(file)&&!file.endsWith('.test.js'))files.push(file);} };
  scan(root);
  for(const file of files){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/\bot\(("(?:[^"\\]|\\.)*")/g)){const key=JSON.parse(match[1]);assert.ok(ownerMessages[key], `${path.relative(root,file)}: ${key}`);}}
});

test('known action IDs and enum comparisons stay untranslated', async () => {
  const fs = await import('node:fs');
  const files = ['../../features/dashboard/Dashboard.jsx','../../features/restaurant/TablesView.jsx','../../features/dashboard/OfferCampaigns.jsx','../../features/dashboard/CustomerReach.jsx'];
  for(const relative of files){const text=fs.readFileSync(new URL(relative,import.meta.url),'utf8');assert.doesNotMatch(text,/===\s*ot\(/,relative);assert.doesNotMatch(text,/(?:value|channel)=\{ot\(/,relative);assert.doesNotMatch(text,/className=\{`[^`]*statusLabel\(/,relative);}
});

test('render translations use cached locale; storage events and user changes refresh it', async () => {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  const handlers = new Map(); let reads = 0;
  const values = new Map([['dd-session', JSON.stringify({user:{id:1}})], ['dd-owner-language:1','hi'], ['dd-owner-language:2','mr']]);
  globalThis.window = {location:{pathname:'/dashboard'}, addEventListener:(name,fn)=>handlers.set(name,fn)};
  globalThis.localStorage = {getItem:key=>{reads++;return values.get(key)||null;},setItem:(key,value)=>values.set(key,value)};
  try {
    const runtime = await import(`./owner-i18n.js?cache-test`);
    runtime.registerOwnerMessages(ownerMessages);
    const count = reads;
    for(let i=0;i<1000;i++) assert.equal(runtime.ot('Close'), ownerMessages.Close.hi);
    assert.equal(reads,count,'ot must not read storage per label');
    values.set('dd-owner-language:1','mr'); handlers.get('storage')({key:'dd-owner-language:1'});
    assert.equal(runtime.ot('Close'),ownerMessages.Close.mr);
    runtime.setOwnerLanguage('hi',{id:1}); assert.equal(runtime.ot('Close'),ownerMessages.Close.hi);
    values.set('dd-session', JSON.stringify({user:{id:2}})); handlers.get('storage')({key:'dd-session'});
    assert.equal(runtime.ot('Close'),ownerMessages.Close.mr);
    runtime.deactivateOwnerLanguage(); assert.equal(runtime.ot('Close'),'Close');
  } finally { globalThis.window=previousWindow;globalThis.localStorage=previousStorage; }
});

test('rebased shared copy has both locales; main sales label and single reviews hash are preserved', async () => {
  const { SALES_BASIS } = await import('./owner-ui.js');
  const { SETUP_COPY } = await import('../../features/whatsapp/setup-choice.js');
  const check = value => {if(typeof value==='string'){assert.ok(ownerMessages[value]?.hi,value);assert.ok(ownerMessages[value]?.mr,value);}else Object.values(value).forEach(check);};
  check(SALES_BASIS);check(SETUP_COPY);
  const fs = await import('node:fs');
  const dashboard=fs.readFileSync(new URL('../../features/dashboard/Dashboard.jsx',import.meta.url),'utf8');
  const initial=dashboard.match(/const initialTab = useRef\(([^;]+)/)[1];
  assert.equal((initial.match(/'reviews'/g)||[]).length,1);
  const restaurant=fs.readFileSync(new URL('../../features/restaurant/RestaurantOrders.jsx',import.meta.url),'utf8');
  assert.ok(restaurant.includes("Today's sales (served)"));
  check("Today's sales (served)");
});
