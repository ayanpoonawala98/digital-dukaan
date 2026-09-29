import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, MessageCircle, QrCode, Bell, ShoppingBag, Store } from 'lucide-react';
import { Header, Logo } from '../components/chrome.jsx';

export default function Landing() {
  return <><Header/><main className="page-fade">
    <section className="hero"><div className="container hero-grid">
      <div className="hero-copy">
        <div className="eyebrow anim-up"><span className="sparkle">✳</span> THE EASIEST WAY TO SELL ONLINE</div>
        <h1 className="anim-up" style={{ animationDelay: '80ms' }}>Your shop.<br/>Your story.<br/><em>One link away.</em></h1>
        <p className="anim-up" style={{ animationDelay: '160ms' }}>Turn what you sell into a beautiful online catalog. Share one link, let customers explore, and close every sale on WhatsApp.</p>
        <div className="hero-actions anim-up" style={{ animationDelay: '240ms' }}>
          <Link className="btn btn-green" to="/signup">Request your shop <ArrowUpRight size={19}/></Link>
          <Link className="text-link" to="/store/apna-kirana-store">Explore demo shop <ArrowRight size={17}/></Link>
        </div>
        <div className="hero-foot anim-up" style={{ animationDelay: '320ms' }}>
          <div className="avatar-stack"><span>🧑🏽</span><span>👩🏽</span><span>👨🏽</span></div>
          <span>Built for the businesses that make our neighborhoods.</span>
        </div>
      </div>
      <div className="hero-art anim-scale" style={{ animationDelay: '200ms' }}>
        <img className="hero-photo" src="https://ik.imagekit.io/digitaldukaanayan/digital-dukaan/branding/digital-dukaan-hero_Z71uTHmDJ.jpg" alt="A local shopkeeper welcomes customers to his digital storefront"/>
        <div className="art-circle"></div>
        <div className="floating-tag tag-top anim-float">New order enquiry <span>↗</span></div>
        <div className="shop-preview">
          <div className="preview-cover"><div className="preview-dots">● ● ●</div><span>APNA KIRANA STORE <span>✳</span></span><small>Fresh groceries, every morning.</small></div>
          <div className="preview-card"><img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&q=85" alt="Fresh groceries"/><div><small>STAPLES · BESTSELLER</small><strong>Whole Wheat Atta 5 kg</strong><b>₹245</b><span className="preview-buy">Buy on WhatsApp <ArrowUpRight size={13}/></span></div></div>
        </div>
        <div className="floating-tag tag-bottom anim-float" style={{ animationDelay: '1.2s' }}><MessageCircle size={19}/> Straight to your WhatsApp</div>
        <div className="star-deco">✳</div>
      </div>
    </div></section>
    <section className="features" id="how-it-works"><div className="container">
      <div className="section-intro"><span className="kicker">SIMPLE BY DESIGN</span><h2>Everything you need.<br/><em>Nothing you don't.</em></h2><p>Skip the complicated ecommerce setup. You know your customers. We make it easy for them to find you.</p></div>
      <div className="feature-grid">
        <div className="feature-card anim-up"><span className="feature-icon green"><Store/></span><span className="feature-number">01 / SHOWCASE</span><h3>A storefront that's all yours</h3><p>Categories, photos, prices, offers, business hours and a link made to share - with your own QR code for the counter.</p></div>
        <div className="feature-card anim-up" style={{ animationDelay: '120ms' }}><span className="feature-icon yellow"><MessageCircle/></span><span className="feature-number">02 / CONNECT</span><h3>Conversations turn into sales</h3><p>Customers fill a cart and message your number directly. You confirm, pack and update them - all on WhatsApp.</p></div>
        <div className="feature-card anim-up" style={{ animationDelay: '240ms' }}><span className="feature-icon pink"><ChartNoAxesCombined/></span><span className="feature-number">03 / GROW</span><h3>See what's getting attention</h3><p>Track enquiries, top products and low stock at a glance. Export sales to Vyapar in one click.</p></div>
      </div>
    </div></section>
    <section className="perks"><div className="container perks-grid">
      {[[QrCode, 'Store QR codes'], [ShoppingBag, 'Cart + bulk orders'], [Bell, 'Push notifications'], [MessageCircle, 'WhatsApp order updates']].map(([Icon, label]) => <div className="perk" key={label}><Icon size={20}/><span>{label}</span></div>)}
    </div></section>
    <section className="bottom-cta"><div className="container cta-inner">
      <div><span className="kicker">READY WHEN YOU ARE</span><h2>Your next customer<br/>is <em>one link away.</em></h2></div>
      <Link to="/signup" className="btn btn-cream">Open your shop <ArrowUpRight size={19}/></Link>
    </div></section>
  </main>
  <footer><div className="container footer-inner"><Logo light/><span>Made for makers, sellers & dreamers.</span><span>© {new Date().getFullYear()} Digital Dukaan</span></div></footer></>;
}
