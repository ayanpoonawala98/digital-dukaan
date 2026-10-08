import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';import {optimizeUpload} from './optimize-upload.js';
test('new uploads shrink high resolution photos without cropping/upscaling or losing alpha',async()=>{
 const input=await sharp({create:{width:3200,height:1600,channels:4,background:{r:150,g:80,b:40,alpha:.5}}}).png().toBuffer();const out=await optimizeUpload(input,'image/png');const meta=await sharp(out.buffer).metadata();assert.ok(out.buffer.length<input.length);assert.equal(meta.width,2000);assert.equal(meta.height,1000);assert.equal(meta.hasAlpha,true);
 const small=await sharp({create:{width:100,height:50,channels:3,background:'red'}}).jpeg().toBuffer();const s=await optimizeUpload(small,'image/jpeg');const sm=await sharp(s.buffer).metadata();assert.equal(sm.width,100);assert.equal(sm.height,50);
});
test('cannot enlarge stored bytes; bad input is retained rather than breaking old upload behavior',async()=>{const b=Buffer.from('not-an-image');const out=await optimizeUpload(b,'image/png');assert.equal(out.buffer,b);assert.equal(out.ext,'.png');});
