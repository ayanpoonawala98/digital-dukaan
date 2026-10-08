import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';
export function uniqueProducts(previous,next){const ids=new Set(previous.map(p=>p.id));return [...previous,...next.filter(p=>!ids.has(p.id))];}
export function useProductPages(slug,search,category,paused){
 const [products,setProducts]=useState([]),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false),[pageError,setPageError]=useState('');
 const [sentinelNode,setSentinelNode]=useState(null);const sentinel=useCallback(node=>setSentinelNode(node),[]);
 const generation=useRef(0),cursor=useRef(null),busy=useRef(false),query=useRef({slug,search,category,paused});query.current={slug,search,category,paused};
 const fetchPage=useCallback(async(first=false)=>{
  if(busy.current || query.current.paused)return;
  const seq=generation.current, q={...query.current};busy.current=true;setPageError('');first?setLoading(true):setLoadingMore(true);
  try{
   const params=new URLSearchParams({search:q.search,category:q.category,limit:first?'15':'10'});if(!first&&cursor.current)params.set('cursor',cursor.current);
   const result=await api(`/public/stores/${q.slug}/products?${params}`,{feedback:false});
   if(seq!==generation.current)return;
   setProducts(p=>first?result.products:uniqueProducts(p,result.products));setTotal(result.total??result.products.length);setHasMore(Boolean(result.hasMore));cursor.current=result.nextCursor;
  }catch(e){if(seq===generation.current)setPageError(e.message);}
  finally{if(seq===generation.current){busy.current=false;setLoading(false);setLoadingMore(false);}}
 },[]);
 useEffect(()=>{generation.current++;busy.current=false;cursor.current=null;setProducts([]);setTotal(0);setHasMore(false);setPageError('');setLoadingMore(false);setLoading(!paused);if(paused)return;
 const timer=setTimeout(()=>fetchPage(true),search?200:0);return()=>{clearTimeout(timer);generation.current++;};},[slug,search,category,paused,fetchPage]);
 const loadMore=useCallback(()=>fetchPage(!cursor.current),[fetchPage]);
 useEffect(()=>{if(!hasMore||loading||loadingMore||pageError||!sentinelNode||!window.IntersectionObserver)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadMore();},{rootMargin:'300px'});observer.observe(sentinelNode);return()=>observer.disconnect();},[hasMore,loading,loadingMore,pageError,loadMore,sentinelNode]);
 return{products,loading,loadingMore,total,hasMore,pageError,loadMore,sentinel};
}
