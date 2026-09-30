import { ImageResponse } from '@vercel/og';
import { readFile } from 'node:fs/promises';
const regular = readFile(new URL('../fonts/DejaVuSans.ttf', import.meta.url));
const bold = readFile(new URL('../fonts/DejaVuSans-Bold.ttf', import.meta.url));

const api = process.env.VITE_API_URL || 'https://api.digitaldukaan.space';
const safeSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || '');
const defaultPhoto = 'https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg';
const goodImage = value => { try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'ik.imagekit.io' || u.hostname.endsWith('.imagekit.io')) ? u.href : defaultPhoto; } catch { return defaultPhoto; } };

export async function GET(req) {
  const url = new URL(req.url, 'https://digitaldukaan.space');
  const slug = url.searchParams.get('slug'); const id = url.searchParams.get('product');
  if (!safeSlug(slug) || (id && !/^[1-9]\d{0,8}$/.test(id))) return new Response('Bad request', { status:400 });
  try {
    const path = `/api/public/stores/${slug}${id ? `/products/${id}` : ''}`;
    const r = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return new Response('Not found', { status:404 });
    const { business, product, paused } = await r.json();
    if (paused || !business?.name || (id && !product?.name)) return new Response('Not found', { status:404 });
    const photo = goodImage(product?.imageUrl || business.coverUrl);
    const accent = /^#[\da-f]{6}$/i.test(business.accentColor || '') ? business.accentColor : '#0e9f6e';
    const title = product?.name || business.name;
    const price = product ? `₹${Number(product.price).toLocaleString('en-IN', { maximumFractionDigits:2 })}` : 'One link. Your shop.';
    const card = {
      type:'div', props:{ style:{ display:'flex', width:'100%', height:'100%', background:'#f7f4ec', color:'#14251a', padding:48, fontFamily:'Dukaan' }, children:[
        { type:'div', props:{ style:{ display:'flex', width:485, height:'100%', borderRadius:22, overflow:'hidden', background:'#e2e9dc' }, children:{ type:'img', props:{ src:photo, width:485, height:534, style:{objectFit:'cover'} } } } },
        { type:'div', props:{ style:{ display:'flex', flexDirection:'column', flex:1, padding:'26px 0 10px 52px', minWidth:0 }, children:[
          { type:'div', props:{ style:{ display:'flex', fontSize:25, fontWeight:700, color:accent, letterSpacing:1 }, children:'DIGITAL DUKAAN' } },
          { type:'div', props:{ style:{ display:'flex', marginTop:58, fontSize:27, color:'#526257' }, children:business.name.slice(0,55) } },
          { type:'div', props:{ style:{ display:'flex', marginTop:18, fontSize:title.length>40?49:62, fontWeight:700, lineHeight:1.08, overflow:'hidden', maxHeight:213 }, children:title.slice(0,93) } },
          { type:'div', props:{ style:{ display:'flex', marginTop:'auto', paddingTop:20, fontSize:product?58:35, fontWeight:700, color:accent }, children:price } },
          { type:'div', props:{ style:{ display:'flex', marginTop:8, fontSize:23, color:'#526257' }, children:product ? 'Explore this product online' : 'Browse the collection online' } }
        ] } }
      ] }
    };
    return new ImageResponse(card, { width:1200, height:630, fonts:[{ name:'Dukaan', data:await regular, weight:400 }, { name:'Dukaan', data:await bold, weight:700 }], headers:{ 'cache-control':'public, s-maxage=60, stale-while-revalidate=120', 'content-type':'image/png' } });
  } catch (err) { return new Response('Image unavailable', { status:503 }); }
}
