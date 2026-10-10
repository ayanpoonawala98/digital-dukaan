import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('worker passes product image and branded icon to visible notification, badge stays local',async()=>{
 const handlers={};const shown=[];const self={addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:async(t,o)=>shown.push({t,o})}};
 vm.runInNewContext(readFileSync(new URL('../../../../client/public/sw.js',import.meta.url),'utf8'),{self,URL});
 for(const data of [{title:'New launch at Demo',image:'https://ik.imagekit.io/a/p.jpg',icon:'https://ik.imagekit.io/a/logo.png',url:'/store/demo/product/1'},{image:'javascript:alert(1)',icon:'http://unsafe.test/a'}]){let promise;handlers.push({data:{json:()=>data},waitUntil:p=>promise=p});await promise;}
 assert.equal(shown[0].o.image,'https://ik.imagekit.io/a/p.jpg');assert.equal(shown[0].o.icon,'https://ik.imagekit.io/a/logo.png');assert.equal(shown[0].o.badge,'/icon-192.png');assert.equal(shown[0].o.data.url,'/store/demo/product/1');assert.equal(shown[1].o.image,undefined);assert.equal(shown[1].o.icon,'/icon-192.png');
});
