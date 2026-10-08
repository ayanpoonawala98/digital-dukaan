import sharp from 'sharp';
// New uploads only. Aim for up to 30% savings, never force a resize or lower quality.
export async function optimizeUpload(buffer,mime){
 const originalExt=({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'})[mime];
 const unchanged=()=>({buffer,ext:originalExt,optimized:false});
 try{
  const image=sharp(buffer,{limitInputPixels:40000000});const meta=await image.metadata();
  if(meta.pages>1)return unchanged();
  const minBytes=Math.ceil(buffer.length*.70);
  const encode=quality=>image.clone().rotate().webp({quality,alphaQuality:100,effort:4}).toBuffer();
  let quality=87,compressed=await encode(quality);
  if(compressed.length<minBytes){
   let low=88,high=100;let candidate=await encode(high);
   // Even maximum quality can be much smaller for PNGs. Keep the original in that case.
   if(candidate.length<minBytes)return unchanged();
   while(low<=high){const mid=Math.floor((low+high)/2),next=await encode(mid);if(next.length>=minBytes){candidate=next;high=mid-1;}else low=mid+1;}
   compressed=candidate;
  }
  if(compressed.length>=buffer.length)return unchanged();
  return{buffer:compressed,ext:'.webp',optimized:true};
 }catch{return unchanged();}
}
