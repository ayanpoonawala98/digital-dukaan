import test from 'node:test';import assert from 'node:assert/strict';import {startShowcaseScroll} from '../../client/src/lib/showcase-scroll.js';
test('gentle scroll stops permanently on every manual input, hidden tab and reduced motion',()=>{
 for(const event of ['touchstart','pointerdown','wheel','keydown','visibilitychange']){
 const events={},docEvents={};let cb,scrolls=0;const win={scrollY:0,innerHeight:800,matchMedia:()=>({matches:false}),requestAnimationFrame:f=>(cb=f,1),cancelAnimationFrame:()=>{},addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k],scrollTo:(_x,y)=>(win.scrollY=y,scrolls++)};const doc={hidden:false,documentElement:{scrollHeight:5000},addEventListener:(k,f)=>docEvents[k]=f,removeEventListener:k=>delete docEvents[k]};
 const stop=startShowcaseScroll(win,doc);cb(100);cb(150);assert.equal(win.scrollY,.8);assert.equal(scrolls,1);
 if(event==='visibilitychange'){doc.hidden=true;docEvents[event]();}else events[event]();cb(200);assert.equal(scrolls,1);stop();
 }
 let started=false;startShowcaseScroll({matchMedia:()=>({matches:true}),requestAnimationFrame:()=>started=true},{});assert.equal(started,false);
});
