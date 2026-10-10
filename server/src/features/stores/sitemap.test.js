import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sitemapXml} from '../../../../client/netlify/edge-functions/sitemap.js';
test('sitemap lists landing pages, valid shops and products only',()=>{
 const x=sitemapXml(['ashiya','bad slug','<x>'],[{slug:'ashiya',id:5},{slug:'ashiya',id:'5;drop'}]);
 assert.match(x,/<loc>https:\/\/digitalshop.website\/<\/loc>/);assert.match(x,/\/store\/ashiya</);assert.match(x,/\/store\/ashiya\/product\/5</);
 assert.doesNotMatch(x,/bad slug|<x>|drop/);
});
