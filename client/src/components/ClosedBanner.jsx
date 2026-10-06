import React from 'react';
import { Clock } from 'lucide-react';

const fmt = t => { if (!/^\d\d:\d\d$/.test(t || '')) return ''; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? 'AM' : 'PM'}`; };
export const hoursLabel = b => b?.autoHours && b.openTime && b.closeTime ? `${fmt(b.openTime)} - ${fmt(b.closeTime)}` : (b?.openingHours || '');

export default function ClosedBanner({ business }) {
  if (!business || business.isOpen !== false) return null;
  const hours = hoursLabel(business);
  return <div className="closed-banner" role="status"><Clock size={28} aria-hidden="true"/><div><strong>{business.name} is closed right now</strong><span>{hours ? `Open hours: ${hours}. ` : ''}{business.blocksOrders ? 'Orders are paused. Please come back when we are open.' : 'You can still send an order request. The shop will confirm it when it opens.'}</span></div></div>;
}
