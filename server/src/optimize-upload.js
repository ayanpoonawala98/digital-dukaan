import sharp from 'sharp';
// New uploads only: preserve aspect ratio/transparency, don't enlarge, and keep animations intact.
export async function optimizeUpload(buffer,mime){
 const originalExt=({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'})[mime];
 try{
  const image=sharp(buffer,{limitInputPixels:40000000});const meta=await image.metadata();
  if(meta.pages>1)return{buffer,ext:originalExt,optimized:false};
  const compressed=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85,alphaQuality:100,effort:4}).toBuffer();
  if(compressed.length>=buffer.length)return{buffer,ext:originalExt,optimized:false};
  return{buffer:compressed,ext:'.webp',optimized:true};
 }catch{return{buffer,ext:originalExt,optimized:false};}
}
