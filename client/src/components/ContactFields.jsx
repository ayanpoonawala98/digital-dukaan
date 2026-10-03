import React, { useState } from 'react';

const KEY = 'dd-contact';
export const loadContact = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return { name: String(v?.name || ''), phone: String(v?.phone || '') }; } catch { return { name: '', phone: '' }; } };
export const saveContact = contact => { try { localStorage.setItem(KEY, JSON.stringify(contact)); } catch { /* storage can be blocked */ } };
export const contactBody = contact => ({ customerName: contact.name.trim(), customerPhone: contact.phone.trim() });

export function useContact() {
  const [contact, setContact] = useState(loadContact);
  const change = next => { setContact(next); saveContact(next); };
  return [contact, change];
}

export default function ContactFields({ contact, onChange }) {
  return <div className="contact-fields">
    <label className="coupon-field">Your name <small>(optional, helps the shop reply)</small><input value={contact.name} onChange={e => onChange({ ...contact, name: e.target.value })} maxLength={100} autoComplete="name" placeholder="Your name"/></label>
    <label className="coupon-field">Your phone <small>(optional)</small><input type="tel" inputMode="tel" value={contact.phone} onChange={e => onChange({ ...contact, phone: e.target.value })} maxLength={25} autoComplete="tel" placeholder="+91 98765 43210"/></label>
  </div>;
}
