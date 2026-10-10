import test from 'node:test';import assert from 'node:assert/strict';
import {qrBrand,shopQrSvg} from './shop-qr.js';
test('QR brand uses store accent safely, keeps light brand text readable, escapes names',async()=>{
 assert.equal(qrBrand({accentColor:''}).color,'#0e9f6e');assert.equal(qrBrand({accentColor:'url(evil)'}).color,'#0e9f6e');
 assert.equal(qrBrand({accentColor:'#ffffff'}).foreground,'#101611');assert.equal(qrBrand({accentColor:'#111111'}).foreground,'#ffffff');
 const s=await shopQrSvg({name:'Shop <script>&',accentColor:'#ffffff'},'https://site.invalid/store/shop');
 assert.match(s,/Shop &lt;script&gt;&amp;/);assert.ok(!s.includes('<script>'));assert.ok(!s.includes('<animate'));assert.match(s,/fill="white"/);assert.match(s,/data:image\/png;base64,/);
});
test('each store and restaurant table has distinct QR content, static export and theme',async()=>{
 const a=await shopQrSvg({name:'One',accentColor:'#9b4b68'},'https://site.invalid/store/one');
 const b=await shopQrSvg({name:'Two',accentColor:'#225caa'},'https://site.invalid/store/two');
 const t=await shopQrSvg({name:'One',accentColor:'#9b4b68'},'https://site.invalid/store/one?table=2',2);
 assert.notEqual(a,b);assert.notEqual(a,t);assert.match(a,/#9b4b68/);assert.match(b,/#225caa/);assert.match(t,/TABLE 2/);
});
