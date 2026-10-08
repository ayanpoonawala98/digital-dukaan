import { useFeedbackState } from '../components/Toasts.jsx';
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { safeDashboardReturn } from '../lib/order-panel.js';
import { api } from '../lib/api.js';
import { Logo, Notice } from '../components/chrome.jsx';

export default function Access({ mode }) {
  const nav = useNavigate(), { save } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useFeedbackState(''), [busy, setBusy] = useState(false);
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', body: form });
      save(result);
      nav(result.user.role === 'superadmin' ? '/superadmin' : safeDashboardReturn(new URLSearchParams(location.search).get('next')));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="auth-layout">
    <div className="auth-side"><Logo light/><div><span className="kicker">YOUR BUSINESS, YOUR WAY</span><h1>Big dreams<br/>start <em>small.</em></h1><p>Your customers are already on WhatsApp. Let's make it easier for them to find what you sell.</p></div><small>THE SHOP IS YOURS. THE STORY IS JUST BEGINNING. ✳</small></div>
    <div className="auth-main"><Link to="/" className="auth-back">← Back to home</Link>
      <div className="auth-box anim-up">
        <span className="kicker">{mode === 'signup' ? 'LET’S GET STARTED' : 'WELCOME BACK'}</span>
        <h2>{mode === 'signup' ? 'Open your shop' : 'Good to see you again.'}</h2>
        <p>{mode === 'signup' ? 'Create your account, then add as many stores as you like.' : 'Sign in to manage your shop.'}</p>
        <form onSubmit={submit}><Notice error={error}/>
          {mode === 'signup' && <label>Your name<input name="name" value={form.name} onChange={change} placeholder="Ayan Poonawala" required/></label>}
          <label>Email address<input type="email" name="email" value={form.email} onChange={change} placeholder="you@yourshop.com" required/></label>
          <label>Password<input type="password" name="password" minLength={mode === 'signup' ? 10 : undefined} value={form.password} onChange={change} placeholder={mode === 'signup' ? 'At least 10 characters' : 'Your password'} required/></label>
          <button className="btn btn-green full" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create my shop' : 'Log in'} <ArrowRight size={18}/></button>
        </form>
        <p className="auth-switch">Want to open a shop? <Link to="/signup">Request a shop</Link></p>
      </div>
    </div>
  </div>;
}
