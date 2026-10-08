import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {qrBrand} from './shop-qr.js';
import {loadShopLogo} from './shop-logo.js';
const printText=value=>String(value||'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').trim();
export async function shopCardPdf(business,url){
 const logo=await loadShopLogo(business);
  const png=await QRCode.toBuffer(url,{type:'png',width:1024,margin:4,errorCorrectionLevel:'H'});
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:30});
  doc.registerFont('ShopText',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../fonts/DejaVuSans.ttf'));doc.font('ShopText');
  const brand=qrBrand(business),left=40,right=510;
  doc.lineWidth(2).strokeColor(brand.color).roundedRect(25,30,792,535,16).stroke();
  doc.save().roundedRect(495,31,321,533,15).fill(brand.color).restore();
  doc.fontSize(10).fillColor(brand.color).text(business.storeType==='restaurant'?'YOUR LOCAL RESTAURANT':business.storeType==='services'?'YOUR LOCAL SERVICE BUSINESS':'YOUR LOCAL STORE',left,65,{width:410});
  doc.fontSize(28).fillColor('#162b1d').text(printText(business.name),left,98,{width:410,height:105});
  doc.fontSize(12).fillColor('#526156').text(printText(business.description),left,217,{width:410,height:92,ellipsis:true});
  let y=340;
  if(business.whatsapp){doc.fontSize(9).fillColor(brand.color).text('WHATSAPP',left,y);doc.fontSize(15).fillColor('#162b1d').text('+'+business.whatsapp,left,y+19,{width:410});y+=65;}
  if(business.location){doc.fontSize(9).fillColor(brand.color).text('VISIT US',left,y);doc.fontSize(12).fillColor('#162b1d').text(printText(business.location),left,y+19,{width:410,height:68,ellipsis:true});}
  doc.fontSize(8).fillColor('#526156').text('ONE SCAN. YOUR SHOP, ALWAYS WITH YOU.',left,532,{width:420});
  doc.fontSize(11).fillColor(brand.foreground).text('SCAN & EXPLORE',right,106,{width:280,align:'center'});
  doc.roundedRect(right,139,280,280,14).fill('white');doc.image(png,right+7,146,{width:266});
  doc.roundedRect(right+122,261,36,36,7).fill('white');if(logo){doc.image(logo,right+127,266,{fit:[26,26],align:'center',valign:'center'});}else{doc.roundedRect(right+127,266,26,26,5).fill(brand.color);doc.fontSize(9).fillColor(brand.foreground).text(brand.initials,right+127,274,{width:26,align:'center'});}
  doc.fontSize(11).fillColor(brand.foreground).text('Our full collection. Right on your phone.',right,443,{width:280,align:'center'});
  doc.fontSize(7).text(url,right,475,{width:280,align:'center'});return doc;
}
