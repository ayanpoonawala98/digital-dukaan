import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const css=fs.readFileSync(new URL('../../../../client/src/styles.css',import.meta.url),'utf8');
test('cards anchor cover images in uniform square frames',()=>{assert.match(css,/\.product-img \{[^}]*aspect-ratio: 1;/);assert.match(css,/\.product-img img \{[^}]*position: absolute;[^}]*object-fit: cover;/);});
test('detail full photo is contained inside definite square frame without intrinsic overflow',()=>{assert.match(css,/\.product-gallery \.detail-image \{[^}]*aspect-ratio:1;/);assert.match(css,/\.product-gallery \.detail-image > img \{[^}]*position:absolute;[^}]*object-fit:contain;/);});
