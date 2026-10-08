import {useEffect,useRef} from 'react';
export function startShowcaseScroll(win,doc){
 if(win.matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 let stopped=false,frame=0,last=0,position=win.scrollY,atBottom=0;
 const events=['touchstart','pointerdown','wheel','keydown'];
 const stop=()=>{stopped=true;win.cancelAnimationFrame(frame);events.forEach(e=>win.removeEventListener(e,stop,true));doc.removeEventListener('visibilitychange',visibility);};
 const visibility=()=>{if(doc.hidden)stop();};
 events.forEach(e=>win.addEventListener(e,stop,{capture:true,passive:true}));doc.addEventListener('visibilitychange',visibility);
 function tick(now){
  if(stopped)return;
  if(last){const dt=Math.min(now-last,50);position+=dt*0.016;win.scrollTo(0,position);if(win.scrollY>=doc.documentElement.scrollHeight-win.innerHeight-1){atBottom+=dt;if(atBottom>2500)return stop();}else atBottom=0;}
  last=now;frame=win.requestAnimationFrame(tick);
 }
 frame=win.requestAnimationFrame(tick);return stop;
}
export function useShowcaseScroll(slug,ready){
 const touched=useRef(false);
 useEffect(()=>{touched.current=false;const remember=()=>{touched.current=true;};const events=['touchstart','pointerdown','wheel','keydown'];events.forEach(e=>window.addEventListener(e,remember,{capture:true,passive:true}));return()=>events.forEach(e=>window.removeEventListener(e,remember,true));},[slug]);
 useEffect(()=>{if(!ready||touched.current)return;return startShowcaseScroll(window,document);},[slug,ready]);
}
