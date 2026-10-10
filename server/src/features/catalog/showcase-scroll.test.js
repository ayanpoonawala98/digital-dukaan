import test from 'node:test';import assert from 'node:assert/strict';import {startShowcaseScroll} from '../../../../client/src/features/storefront/showcase-scroll.js';
test('gentle scroll stops permanently on every manual input, hidden tab and reduced motion',()=>{
 for(const event of ['touchstart','pointerdown','wheel','keydown','visibilitychange']){
 const events={},docEvents={};let cb,scrolls=0;const win={scrollY:0,innerHeight:800,matchMedia:()=>({matches:false}),requestAnimationFrame:f=>(cb=f,1),cancelAnimationFrame:()=>{},addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k],scrollTo:options=>(assert.equal(options.behavior,'instant'),win.scrollY=options.top,scrolls++)};const doc={hidden:false,documentElement:{scrollHeight:5000},addEventListener:(k,f)=>docEvents[k]=f,removeEventListener:k=>delete docEvents[k]};
 const stop=startShowcaseScroll(win,doc);cb(100);cb(150);assert.equal(win.scrollY,1.9);assert.equal(scrolls,1);
 if(event==='visibilitychange'){doc.hidden=true;docEvents[event]();}else events[event]();cb(200);assert.equal(scrolls,1);stop();
 }
 let started=false;startShowcaseScroll({matchMedia:()=>({matches:true}),requestAnimationFrame:()=>started=true},{});assert.equal(started,false);
});
test('intro drift stops with share row just below the sticky header',()=>{
 let cb;const listeners={};const win={scrollY:0,innerHeight:800,matchMedia:()=>({matches:false}),requestAnimationFrame:f=>(cb=f,1),cancelAnimationFrame:()=>{},addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k],scrollTo:options=>win.scrollY=options.top};const row={getBoundingClientRect:()=>({top:80-win.scrollY})},header={getBoundingClientRect:()=>({bottom:64})};const doc={hidden:false,querySelector:s=>s==='.header'?header:row,documentElement:{scrollHeight:5000},addEventListener:()=>{},removeEventListener:()=>{}};
 startShowcaseScroll(win,doc);for(let t=100;t<1500;t+=50)cb(t);assert.equal(win.scrollY,16);assert.equal(Object.keys(listeners).length,0);
});
