import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {storeImage} from '../../../../client/src/lib/store-image.js';
test('responsive store images reduce bytes without cropping or altering originals',()=>{
 const original='https://ik.imagekit.io/our-account/store/photo.jpg';const result=storeImage(original,720);
 assert.equal(original,'https://ik.imagekit.io/our-account/store/photo.jpg');assert.match(result,/tr=w-720%2Cq-80/);assert.doesNotMatch(result,/h-|fo-|cm-/);
 for(const value of ['/uploads/photo.jpg','https://other.test/photo.jpg','https://ik.imagekit.io/x.jpg?tr=w-200'])assert.equal(storeImage(value),value);
});
test('store route no longer imports admin or demo library eagerly; auth is shared outside route',()=>{
 const app=readFileSync(new URL('../../../../client/src/App.jsx',import.meta.url),'utf8');assert.match(app,/lazy\(\(\) => import\('\.\/pages\/Dashboard.jsx'\)\)/);assert.match(app,/lazy\(\(\) => import\('\.\/pages\/Landing.jsx'\)\)/);assert.match(app,/<Suspense/);assert.match(app,/auth.jsx/);
 const api=readFileSync(new URL('../../../../client/src/lib/api.js',import.meta.url),'utf8');assert.match(api,/body === undefined \? \{\}/);
});
