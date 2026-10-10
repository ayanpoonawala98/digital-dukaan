import { StorefrontLanguage } from './StorefrontLanguage.jsx';
import { storefrontActive } from '../lib/storefront-i18n.js';
import { pt } from '../lib/presentation-i18n.js';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Store } from 'lucide-react';
import { useAuth } from '../../app/auth.jsx';
import { ThemeToggle } from '../../app/theme.jsx';
import { imageSrc } from '../lib/api.js';
import { storePath } from '../../features/storefront/store-domain.js';

export function Logo({ light = false }) {
  return <Link className={`brand ${light ? 'brand-light' : ''}`} to="/"><span className="brand-mark"><Store size={22} strokeWidth={2.5}/></span><span>{'digital'}<span className="brand-accent">{'shop.'}</span></span></Link>;
}

export function Header({ shop, business }) {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="header"><div className="container header-inner">
    {business ? <Link className="brand store-header-brand" to={storePath(shop || business.slug)}>{business.logoUrl ? <img className="header-store-logo" src={imageSrc(business.logoUrl)} alt=""/> : <span className="brand-mark"><Store size={22}/></span>}<span className="header-store-name">{business.name}</span></Link> : <Logo/>}
    <div className="header-controls">{storefrontActive() && <StorefrontLanguage/>}<ThemeToggle/><button type="button" className="header-menu-toggle" aria-label={menuOpen ? pt("Close menu") : pt("Open menu")} aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button></div>
    <nav id="site-menu" className={menuOpen ? 'menu-open' : ''} aria-label={pt("Main navigation")} onClick={() => setMenuOpen(false)}>
      {shop ? <Link to={storePath(shop)}>{pt("Storefront")}</Link> : <a href="/#how-it-works">{pt("How it works")}</a>}
      {shop && <Link to={`${storePath(shop)}/orders`}>{pt("My orders")}</Link>}
      {session
        ? <Link to={session.user.role === 'superadmin' ? '/superadmin' : '/dashboard'} className="btn btn-dark btn-small">{pt("Dashboard")} <ArrowUpRight size={16}/></Link>
        : <><Link to="/login">{pt("Log in")}</Link><Link to="/signup" className="btn btn-dark btn-small">{pt("Start your shop")} <ArrowUpRight size={16}/></Link></>}
    </nav>
  </div></header>;
}

export function Notice({ error, success }) {
  return <>{error && <p className="notice error">{pt(error)}</p>}{success && <p className="notice success">{pt(success)}</p>}</>;
}

export function Footer({ children }) {
  return <footer><div className="container footer-inner"><Logo light/>{children}<span>© {new Date().getFullYear()} {'Digital Shop'}</span><span className="creator-credit">{pt("Created by")} <a href="https://www.linkedin.com/in/mohammad-ayan-poonawala-a09590166" target="_blank" rel="noopener noreferrer">{'Ayan Poonawala'}</a></span></div></footer>;
}
