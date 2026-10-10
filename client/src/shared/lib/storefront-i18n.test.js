import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {storefrontMessages} from './storefront-messages.js';import {dictionaries} from './i18n.js';import {FLOWS} from '../../features/restaurant/order-flows.js';
import {registerStorefrontMessages,translateStorefront,refreshStorefrontLanguage,setStorefrontLanguage,storefrontLanguageKey,readStorefrontLanguage,st,storefrontValidationMessage} from './storefront-i18n.js';
registerStorefrontMessages(storefrontMessages);
const fields=s=>[...s.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map(x=>x[1]).sort();
test('all source and legacy dictionaries have both languages and matching placeholders',()=>{
 for(const [key,value] of Object.entries(storefrontMessages))for(const lang of ['hi','mr']){assert.ok(value?.[lang]?.trim(),key);assert.deepEqual(fields(value[lang]),fields(key),key);}
 for(const key of Object.keys(dictionaries.en))for(const lang of ['hi','mr'])assert.ok(dictionaries[lang][key],key);
});
test('English and unknown messages stay original; interpolation preserves user text and provider tokens',()=>{
 assert.equal(translateStorefront('en','Add to cart'),'Add to cart');assert.equal(translateStorefront('hi','Unknown provider error'),'Unknown provider error');
 assert.equal(translateStorefront('en','{{to}} {name}',{name:'Customer <script> $10',to:'NO'}),'{{to}} Customer <script> $10');
 assert.equal(translateStorefront('hi','Remove {v0}',{v0:'Customer Rice'}),'Customer Rice हटाएँ');
});
test('guest legacy preference migrates without leaking to accounts; cache has no render reads',()=>{
 const previous=globalThis.localStorage;let reads=0;const values=new Map([['dd-language','hi'],['dd-storefront-language:2','mr']]);globalThis.localStorage={getItem:k=>{reads++;return values.get(k)||null},setItem:(k,v)=>values.set(k,v)};
 try{assert.equal(readStorefrontLanguage(null,localStorage),'hi');assert.equal(readStorefrontLanguage({id:1},localStorage),'en');assert.notEqual(storefrontLanguageKey({id:1}),storefrontLanguageKey(null));
 refreshStorefrontLanguage(true,null);assert.equal(st('Add to cart'),storefrontMessages['Add to cart'].hi);const n=reads;for(let i=0;i<1000;i++)st('Add to cart');assert.equal(reads,n);
 setStorefrontLanguage('mr');assert.equal(values.get('dd-storefront-language:guest'),'mr');refreshStorefrontLanguage(true,{id:1});assert.equal(st('Add to cart'),'Add to cart');setStorefrontLanguage('hi');refreshStorefrontLanguage(true,{id:2});assert.equal(st('Add to cart'),storefrontMessages['Add to cart'].mr);refreshStorefrontLanguage(false,null);assert.equal(st('Add to cart'),'Add to cart');
 }finally{globalThis.localStorage=previous;refreshStorefrontLanguage(false,null);}
});
test('blocked storage and invalid locales are safe',()=>{
 assert.equal(readStorefrontLanguage(null,{getItem:()=>{throw Error('blocked')}}),'en');assert.equal(readStorefrontLanguage(null,{getItem:()=> 'fr'}),'en');
});
test('all storefront source keys and tracking flow presentation have translations',()=>{
 const root=path.resolve(import.meta.dirname,'../..');const files=[];const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else if(/\.jsx?$/.test(p)&&!p.endsWith('.test.js'))files.push(p)}};scan(root);
 for(const f of files)for(const m of fs.readFileSync(f,'utf8').matchAll(/\bst\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)){const k=m[1][0]==='"'?JSON.parse(m[1]):m[1].slice(1,-1);assert.ok(storefrontMessages[k]||dictionaries.en[k],`${f}: ${k}`);}
 for(const flow of Object.values(FLOWS)){for(const [,label] of flow.steps)assert.ok(storefrontMessages[label],label);for(const note of Object.values(flow.note))assert.ok(storefrontMessages[note],note);}
});
test('operational enums, storage names and customer values are not translated',()=>{
 for(const f of ['../../features/storefront/ShopPage.jsx','../../features/storefront/ProductPage.jsx','../../features/storefront/OrderTracking.jsx','../../features/restaurant/RestaurantCheckout.jsx','../../features/restaurant/MenuItemSheet.jsx']){const s=fs.readFileSync(new URL(f,import.meta.url),'utf8');assert.doesNotMatch(s,/===\s*st\(/);assert.doesNotMatch(s,/(?:value|className)=\{st\(/);assert.doesNotMatch(s,/notify\(st\(/);assert.doesNotMatch(s,/st\((?:product|business|item|r)\.(?:name|description|text)/);}
});
test('localized HTML validation preserves constraint values',()=>{const prior=globalThis.localStorage;globalThis.localStorage={getItem:()=> 'hi'};try{refreshStorefrontLanguage(true,{id:9});assert.equal(storefrontValidationMessage({valueMissing:true},{}),'यह फ़ील्ड भरें।');assert.match(storefrontValidationMessage({rangeUnderflow:true},{min:12}),/12/);}finally{globalThis.localStorage=prior;refreshStorefrontLanguage(false,null)}});

test('known dynamic server errors preserve amounts and customer names, unknown errors remain unchanged', async()=>{
 const {storefrontError}=await import('./storefront-i18n.js');const prior=globalThis.localStorage;globalThis.localStorage={getItem:()=> 'mr'};
 try{refreshStorefrontLanguage(true,{id:7});assert.match(storefrontError('Only 4 left in stock for Customer Rice'),/Customer Rice/);assert.match(storefrontError('Minimum order is Rs.350'),/350/);assert.match(storefrontError('Add items worth Rs.500 or more to use this coupon'),/500/);assert.equal(storefrontError('Unknown error 123'),'Unknown error 123');}finally{globalThis.localStorage=prior;refreshStorefrontLanguage(false,null)}
});
