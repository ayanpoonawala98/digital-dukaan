import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, MessageCircle, QrCode, Bell, ShoppingBag, Store } from 'lucide-react';
import { Header, Logo } from '../components/chrome.jsx';

export default function Landing() {
  return <><Header/><main className="page-fade">
    <section className="hero"><div className="container hero-grid">
      <div className="hero-copy">
        <div className="eyebrow anim-up"><span className="sparkle">✳</span> MADE FOR THE SHOPS THAT MAKE A PLACE</div>
        <h1 className="anim-up" style={{ animationDelay: '80ms' }}>The shop around<br/>the corner.<br/><em>Now one link away.</em></h1>
        <p className="anim-up" style={{ animationDelay: '160ms' }}>Your products, your story, your own storefront. Share one link and let customers come straight to you on WhatsApp.</p>
        <div className="hero-actions anim-up" style={{ animationDelay: '240ms' }}>
          <Link className="btn btn-green" to="/signup">Request your shop <ArrowUpRight size={19}/></Link>
          <Link className="text-link" to="/store/apna-kirana-store">Explore a live shop <ArrowRight size={17}/></Link>
        </div>
        <div className="hero-foot anim-up" style={{ animationDelay: '320ms' }}><span className="hero-rule" aria-hidden="true"/><span>For the stores we know by name.<br/>And the people behind their counters.</span></div>
      </div>
      <div className="hero-art anim-scale" style={{ animationDelay: '180ms' }}>
        <img className="hero-photo" src="https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg" alt="A local shopkeeper at his counter"/>
        <div className="hero-image-caption"><span>THE PEOPLE BEHIND THE SHOP</span><strong>Every storefront starts with someone.</strong></div>
        <span className="hero-photo-index" aria-hidden="true">01 / LOCAL</span>
      </div>
    </div></section>
    <section className="features" id="how-it-works"><div className="container">
      <div className="section-intro"><span className="kicker">BUILT AROUND YOUR DAY</span><h2>Your shop has a story.<br/><em>Give it a place to live.</em></h2><p>A simple link is all it takes. Show what you sell, keep the conversation personal and stay in control of every order.</p></div>
      <div className="feature-grid">
        <div className="feature-card anim-up"><span className="feature-icon green"><Store/></span><span className="feature-number">01 / SHOWCASE</span><h3>A storefront that's all yours</h3><p>Categories, photos, prices, offers, business hours and a link made to share - with your own QR code for the counter.</p></div>
        <div className="feature-card anim-up" style={{ animationDelay: '120ms' }}><span className="feature-icon yellow"><MessageCircle/></span><span className="feature-number">02 / CONNECT</span><h3>Conversations turn into sales</h3><p>Customers fill a cart and message your number directly. You confirm, pack and update them - all on WhatsApp.</p></div>
        <div className="feature-card anim-up" style={{ animationDelay: '240ms' }}><span className="feature-icon pink"><ChartNoAxesCombined/></span><span className="feature-number">03 / GROW</span><h3>See what's getting attention</h3><p>Track enquiries, top products and low stock at a glance. Export sales to Vyapar in one click.</p></div>
      </div>
    </div></section>
    <section className="demo-section" id="demo"><div className="container demo-grid">
      <div className="demo-copy"><span className="kicker">SEE IT IN ACTION / TWO TOURS</span><h2>A closer look at<br/><em>your digital dukaan.</em></h2><p>See both sides of Digital Dukaan. Start with the storefront and customer journey, then go behind the counter with an in-depth tour of the owner dashboard.</p><div className="demo-meta"><span>01:37 store tour</span><span>01:55 admin tour</span><span>Sound starts only when you press play</span></div><Link to="/store/apna-kirana-store" className="text-link">Explore a live shop <ArrowRight size={17}/></Link></div>
      <div className="demo-videos"><div className="demo-stage"><div className="demo-frame"><video controls playsInline preload="none" aria-label="Digital Dukaan storefront tour" poster="/digital-dukaan-tour-poster.jpg" width="720" height="1280"><source src="/digital-dukaan-tour.mp4" type="video/mp4"/>Your browser does not support video. <a href="/digital-dukaan-tour.mp4">Download the tour</a>.</video></div><span className="demo-caption">01 / STOREFRONT TOUR · 01:37</span></div><div className="demo-stage"><div className="demo-frame"><video controls playsInline preload="none" aria-label="Digital Dukaan admin panel tour" poster="/digital-dukaan-admin-poster.jpg" width="720" height="1280"><source src="/digital-dukaan-admin-tour.mp4" type="video/mp4"/>Your browser does not support video. <a href="/digital-dukaan-admin-tour.mp4">Download the admin tour</a>.</video></div><span className="demo-caption">02 / ADMIN PANEL TOUR · 01:55</span></div></div>
    </div></section>
    <section className="perks"><div className="container perks-grid">
      {[[QrCode, 'Store QR codes'], [ShoppingBag, 'Cart + bulk orders'], [Bell, 'Push notifications'], [MessageCircle, 'WhatsApp order updates']].map(([Icon, label]) => <div className="perk" key={label}><Icon size={20}/><span>{label}</span></div>)}
    </div></section>
    <section className="bottom-cta"><div className="container cta-inner">
      <div><span className="kicker">READY WHEN YOU ARE</span><h2>Your next customer<br/>is <em>one link away.</em></h2></div>
      <Link to="/signup" className="btn btn-cream">Open your shop <ArrowUpRight size={19}/></Link>
    </div></section>
  </main>
  <footer><div className="container footer-inner"><Logo light/><span>Made for the shops that make a place.</span><span>© {new Date().getFullYear()} Digital Dukaan</span></div></footer></>;
}
