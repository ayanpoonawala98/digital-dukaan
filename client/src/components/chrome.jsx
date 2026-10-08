import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Store } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { ThemeToggle } from '../theme.jsx';
import { imageSrc } from '../lib/api.js';
import { storePath } from '../lib/store-domain.js';

export function Logo({ light = false }) {
  return <Link className={`brand ${light ? 'brand-light' : ''}`} to="/"><span className="brand-mark"><Store size={22} strokeWidth={2.5}/></span><span>digital<span className="brand-accent">shop.</span></span></Link>;
}

export function Header({ shop, business }) {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="header"><div className="container header-inner">
    {business ? <Link className="brand store-header-brand" to={storePath(shop || business.slug)}>{business.logoUrl ? <img className="header-store-logo" src={imageSrc(business.logoUrl)} alt=""/> : <span className="brand-mark"><Store size={22}/></span>}<span className="header-store-name">{business.name}</span></Link> : <Logo/>}
    <div className="header-controls"><ThemeToggle/><button type="button" className="header-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button></div>
    <nav id="site-menu" className={menuOpen ? 'menu-open' : ''} aria-label="Main navigation" onClick={() => setMenuOpen(false)}>
      <Link to={shop ? storePath(shop) : '/#how-it-works'}>{shop ? 'Storefront' : 'How it works'}</Link>
      {shop && <Link to={`${storePath(shop)}/orders`}>My orders</Link>}
      {session
        ? <Link to={session.user.role === 'superadmin' ? '/superadmin' : '/dashboard'} className="btn btn-dark btn-small">Dashboard <ArrowUpRight size={16}/></Link>
        : <><Link to="/login">Log in</Link><Link to="/signup" className="btn btn-dark btn-small">Start your shop <ArrowUpRight size={16}/></Link></>}
    </nav>
  </div></header>;
}

export function Notice({ error, success }) {
  return <>{error && <p className="notice error">{error}</p>}{success && <p className="notice success">{success}</p>}</>;
}

export function Footer({ children }) {
  return <footer><div className="container footer-inner"><Logo light/>{children}<span>© {new Date().getFullYear()} Digital Shop</span><span className="creator-credit">Created by <a href="https://www.linkedin.com/in/mohammad-ayan-poonawala-a09590166" target="_blank" rel="noopener noreferrer">Ayan Poonawala</a></span></div></footer>;
}
