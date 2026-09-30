import { storeLink } from './store-domain.js';
// A self-contained 9:16 PNG; no remote assets, so downloads work on mobile
// even when third-party image hosts do not allow canvas reads.
const truncate = (ctx, value, maxWidth) => {
  let text = String(value || '');
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -2) + '…';
  return text;
};

export function downloadStatusCreative(business, products = []) {
  const width = 1080, height = 1920;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image creation is not available on this device');
  const shade = ctx.createLinearGradient(0, 0, width, height); shade.addColorStop(0, '#102a20'); shade.addColorStop(.6, '#15513c'); shade.addColorStop(1, '#0e9f6e');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(980, 290, 420, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(70, 1510, 390, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b1f5d2'; ctx.font = '700 32px sans-serif'; ctx.fillText('DIGITAL DUKAAN  ✳', 78, 122);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 94px sans-serif';
  const words = String(business.name || 'Your shop').split(/\s+/); let lines = [], line = '';
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (ctx.measureText(candidate).width > 910 && line) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((part, index) => ctx.fillText(truncate(ctx, part, 920), 78, 310 + index * 115));
  const start = Math.max(540, 310 + Math.min(3, lines.length) * 115 + 40);
  ctx.fillStyle = '#c8f8df'; ctx.font = '500 38px sans-serif'; ctx.fillText('Good things are closer than you think.', 80, start);
  const items = products.filter(p => p.active && p.stock !== 0).slice(0, 3);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.roundRect(70, start + 115, 940, items.length ? 580 : 300, 36); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 38px sans-serif'; ctx.fillText(items.length ? 'A FEW FAVORITES' : 'SHOP LOCAL, SHOP EASY', 105, start + 183);
  if (items.length) items.forEach((item, i) => { const y = start + 265 + i * 150; ctx.font = '600 42px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(truncate(ctx, item.name, 650), 105, y); ctx.fillStyle = '#b6f5d2'; ctx.font = '700 40px sans-serif'; ctx.fillText(`₹${Number(item.price).toLocaleString('en-IN')}`, 105, y + 54); if (i < items.length - 1) { ctx.strokeStyle = 'rgba(255,255,255,.16)';ctx.beginPath();ctx.moveTo(105,y+80);ctx.lineTo(970,y+80);ctx.stroke(); } });
  else { ctx.font = '500 38px sans-serif'; ctx.fillStyle = '#e1f4e9'; ctx.fillText('Browse the collection and say hello.', 105, start + 255); }
  ctx.fillStyle = '#ffffff'; ctx.font = '800 54px sans-serif'; ctx.fillText('Explore the shop', 80, 1620);
  ctx.font = '500 36px sans-serif'; ctx.fillStyle = '#d4f6e4';
  const link = storeLink(business.slug);
  ctx.fillText(truncate(ctx, link, 920), 80, 1690);
  ctx.fillStyle = '#b1f5d2'; ctx.font = '600 30px sans-serif'; ctx.fillText('Tap the link or message the owner on WhatsApp.', 80, 1780);
  const anchor = document.createElement('a'); anchor.href = canvas.toDataURL('image/png'); anchor.download = `${business.slug}-whatsapp-status.png`; anchor.click();
}
