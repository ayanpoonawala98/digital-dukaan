import { useFeedbackState } from '../components/Toasts.jsx';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { Logo, Notice } from '../components/chrome.jsx';

export default function ShopRequest() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', shopName: '', message: '' });
  const [error, setError] = useFeedbackState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/public/shop-requests', { method: 'POST', body: form }); setSent(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="auth-layout">
    <div className="auth-side"><Logo light/><div><span className="kicker">YOUR BUSINESS, YOUR WAY</span><h1>Big dreams<br/>start <em>small.</em></h1><p>Your customers are already on WhatsApp. Let's make it easier for them to find what you sell.</p></div><small>THE SHOP IS YOURS. THE STORY IS JUST BEGINNING. ✳</small></div>
    <div className="auth-main"><Link to="/" className="auth-back">← Back to home</Link><div className="auth-box anim-up">
      <span className="kicker">LET'S GET STARTED</span><h2>Start your shop</h2>
      {sent ? <><p>Thanks! We got your request. We'll contact you to set up your shop and share your login.</p><Link to="/">Back to home</Link></> : <><p>Tell us about your shop. We'll get in touch and create your account for you.</p>
      <form onSubmit={submit}><Notice error={error}/>
        <label>Your name<input required maxLength="100" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
        <label>Email address<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label>
        <label>Phone / WhatsApp<input type="tel" required minLength="8" maxLength="25" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label>
        <label>Shop name<input required maxLength="100" value={form.shopName} onChange={e => setForm({ ...form, shopName: e.target.value })}/></label>
        <label>Anything we should know? (optional)<textarea maxLength="1000" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}/></label>
        <button className="btn btn-green full" disabled={busy}>{busy ? 'Sending...' : 'Request my shop'} <ArrowRight size={18}/></button>
      </form><p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p></>}
    </div></div>
  </div>;
}
