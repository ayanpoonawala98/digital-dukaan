import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../shared/lib/api.js';
export function useOwnerPages(storeId,tab,filters,token,refresh,enabled,prefix){
 const [state,setState]=useState({rows:[],total:0,hasMore:false,loading:false,error:''});
 const [node,setNode]=useState(null);const version=useRef(0),busy=useRef(false),cursor=useRef(null);
 const query=useRef();query.current={storeId,tab,filters,token,enabled,prefix};
 const fetch=useCallback(async(first=false)=>{
  const q=query.current;if(!q.enabled||busy.current)return;busy.current=true;const v=version.current;
  setState(s=>({...s,loading:true,error:''}));
  try{const params=new URLSearchParams({q:q.filters.q,status:q.filters.status,limit:first?'15':'10',from:q.filters.from||'',to:q.filters.to||''});if(!first&&cursor.current)params.set('cursor',cursor.current);
   const result=await api(`${q.prefix||`/owner/${q.storeId}`}/${q.tab==='requests'?'shop-requests':q.tab}?${params}`,{token:q.token,feedback:false});if(v!==version.current)return;
   cursor.current=result.nextCursor;setState(s=>{const ids=new Set(s.rows.map(r=>r.id));return{rows:first?result[q.tab==='restaurant-orders'?'orders':q.tab]:[...s.rows,...result[q.tab==='restaurant-orders'?'orders':q.tab].filter(r=>!ids.has(r.id))],total:result.total,hasMore:result.hasMore,loading:false,error:''};});
  }catch(e){if(v===version.current)setState(s=>({...s,loading:false,error:e.message}));}finally{if(v===version.current)busy.current=false;}
 },[]);
 useEffect(()=>{version.current++;busy.current=false;cursor.current=null;setState({rows:[],total:0,hasMore:false,loading:enabled,error:''});const timer=enabled?setTimeout(()=>fetch(true),filters.q?250:0):null;return()=>{clearTimeout(timer);version.current++;};},[storeId,tab,filters.q,filters.status,filters.from,filters.to,token,refresh,enabled,prefix,fetch]);
 // Silent top-of-list refresh: merges new/changed rows without resetting scroll or loaded pages.
 const poll=useCallback(async()=>{
  const q=query.current;if(!q.enabled||busy.current)return;const v=version.current;
  try{const params=new URLSearchParams({q:q.filters.q,status:q.filters.status,limit:'15',from:q.filters.from||'',to:q.filters.to||''});
   const result=await api(`${q.prefix||`/owner/${q.storeId}`}/${q.tab==='requests'?'shop-requests':q.tab}?${params}`,{token:q.token,feedback:false});if(v!==version.current||busy.current)return;
   const key=q.tab==='restaurant-orders'?'orders':q.tab,fresh=result[key]||[];
   setState(s=>{const byId=new Map(fresh.map(r=>[r.id,r])),have=new Set(s.rows.map(r=>r.id));return{...s,rows:[...fresh.filter(r=>!have.has(r.id)),...s.rows.map(r=>byId.has(r.id)?{...r,...byId.get(r.id)}:r)],total:result.total??s.total};});
  }catch{/* background refresh stays quiet */}
 },[]);
 const more=useCallback(()=>fetch(!cursor.current),[fetch]);
 useEffect(()=>{if(!node||!state.hasMore||state.loading||state.error||!window.IntersectionObserver)return;const observer=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))more();},{rootMargin:'250px'});observer.observe(node);return()=>observer.disconnect();},[node,state.hasMore,state.loading,state.error,more]);
 const patchRow=useCallback((id,fresh)=>setState(s=>({...s,rows:s.rows.map(r=>r.id===id?{...r,...fresh}:r)})),[]);
 return {...state,sentinel:setNode,more,patchRow,poll};
}
