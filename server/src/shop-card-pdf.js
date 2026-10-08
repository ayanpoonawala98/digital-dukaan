import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {shopQrSvg} from './shop-qr.js';
import {CardSerif,CardSans,CardSansBold} from './card-fonts.js';
// One layout owns screen, PNG and print. Font buffers lock the approved typography.
export async function shopCardPdf(business,url){
 const svg=await shopQrSvg(business,url);
 const height=Number(svg.match(/height="(\d+)"/)[1]);
 const width=841.89,scale=width/1180;
 const doc=new PDFDocument({size:[width,height*scale],margin:0});
 doc.registerFont('CardSerif',CardSerif);doc.registerFont('CardSans',CardSans);doc.registerFont('CardSansBold',CardSansBold);
 doc.save().scale(scale);
 SVGtoPDF(doc,svg,0,0,{width:1180,height,assumePt:true,fontCallback:(family,bold)=>family==='CardSerif'?'CardSerif':family==='CardSansBold'||bold?'CardSansBold':'CardSans'});
 doc.restore();
 return doc;
}
