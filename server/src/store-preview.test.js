import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{storeHtml,logoUrl} from '../../client/netlify/edge-functions/store-preview.js';
const base=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');
const business={name:'Ashiya "Jewellery" <shop>',description:'A & B\nJewellery',logoUrl:'https://ik.imagekit.io/demo/logo.png'};
test('store preview replaces all generic branding, escapes owner text and preserves SPA',()=>{
 const html=storeHtml(base,business,'ashiya');
 assert.match(html,/og:title" content="Ashiya &quot;Jewellery&quot; &lt;shop&gt;/);
 assert.match(html,/og:image" content="https:\/\/ik.imagekit.io\/demo\/logo.png/);
 assert.equal((html.match(/property="og:image"/g)||[]).length,1);
 assert.match(html,/og:url" content="https:\/\/digitalshop.website\/store\/ashiya/);
 assert.doesNotMatch(html,/digital-dukaan-hero|application\/ld\+json|og:image:width/);
 assert.match(html,/<div id="root"><\/div>/);assert.match(html,/src="\/src\/main.jsx"/);assert.match(html,/fonts.googleapis/);
});
test('no-logo and paused stores do not inherit platform image',()=>{
 assert.equal(logoUrl('javascript:alert(1)'), '');assert.equal(logoUrl('https://user:pass@foo.test/x'),'');
 assert.doesNotMatch(storeHtml(base,{name:'No logo'},'no-logo'),/og:image|twitter:image|digital-dukaan-hero/);
 const html=storeHtml(base,business,'paused',true);assert.match(html,/name="robots" content="noindex"/);assert.doesNotMatch(html,/og:image/);
});
test('handler fetches only exact public storefront routes and handles errors without breaking SPA',async()=>{
 const original=global.fetch;let calls=0;
 try {
 global.fetch=async()=>{calls++;return Response.json({business});};
 const context={next:async()=>new Response(base,{headers:{'content-type':'text/html','etag':'old','content-length':'99'}})};
 const result=await handler(new Request('https://digitalshop.website/store/ashiya?ref=123'),context);
 assert.equal(calls,1);assert.equal(result.headers.get('etag'),null);assert.match(await result.text(),/og:title/);
 for(const path of ['/dashboard','/store/ashiya/order/1','/store/ashiya/product/2','/store/x/unknown']) assert.equal(await handler(new Request('https://digitalshop.website'+path),context),undefined);
 assert.equal(calls,1);
 global.fetch=async()=>new Response('',{status:404});assert.equal((await handler(new Request('https://digitalshop.website/store/missing'),context)).status,404);
 global.fetch=async()=>{throw Error('offline')};assert.equal(await handler(new Request('https://digitalshop.website/store/ashiya'),context),undefined);
 }finally{global.fetch=original;}
});
