import test from 'node:test';import assert from 'node:assert/strict';
import {uploadedLogoUrl,loadShopLogo} from './shop-logo.js';
const store={id:10,logoUrl:'https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/10/logo.png'};
test('only store-owned ImageKit folder accepted, no external fetch or cross-store',async()=>{
 for(const url of ['https://evil.invalid/logo.png','https://ik.imagekit.io.evil.invalid/digitaldukaanayan/digital-dukaan/10/logo.png','https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/11/logo.png','https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/10/../../11/logo.png','https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/10/logo.svg']){
  assert.equal(uploadedLogoUrl({...store,logoUrl:url}),null);assert.equal(await loadShopLogo({...store,logoUrl:url},()=>{throw Error('must never fetch');}),null);
 }
 assert.match(uploadedLogoUrl(store),/tr=w-120/);
});
test('logo fetch bounded, redirects disabled, bad image and failed fetch fall back',async()=>{
 let options;const data=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(data);data.writeUInt32BE(120,16);data.writeUInt32BE(120,20);
 const result=await loadShopLogo(store,async(url,o)=>{options=o;return new Response(data,{headers:{'content-type':'image/png'}});});assert.deepEqual(result,data);assert.equal(options.redirect,'error');
 assert.equal(await loadShopLogo(store,async()=>new Response('evil',{headers:{'content-type':'image/svg+xml'}})),null);
 assert.equal(await loadShopLogo(store,async()=>{throw Error('timeout')}),null);
 data.writeUInt32BE(10000,16);assert.equal(await loadShopLogo(store,async()=>new Response(data,{headers:{'content-type':'image/png'}})),null);
});
