import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../../shared/lib/api.js';
import BrandLoader from '../../shared/components/BrandLoader.jsx';
import ShopPage from './ShopPage.jsx';
import ProductPage from './ProductPage.jsx';
import { OfferOptOut } from '../dashboard/OfferCampaigns.jsx';
import { RestaurantOrderTracking, LeadOrderTracking, MyOrdersPage } from './OrderTracking.jsx';

// A client's own domain. The host is resolved to a store through the public API (the hostname is always an explicit
// parameter), the storefront renders at "/", and nothing else is reachable: no login, admin, signup or password pages.
const Own = ({ slug, children }) => { const p = useParams(); return p.slug === slug ? children : <Navigate to="/" replace/>; };
export default function CustomHostRoutes({ host }) {
  const [state, setState] = useState({ status: 'loading', slug: '' });
  useEffect(() => {
    let on = true;
    api(`/public/domain-resolve?host=${encodeURIComponent(host)}`, { feedback: false }).then(r => on && setState(r?.slug ? { status: 'ok', slug: r.slug } : { status: 'none', slug: '' })).catch(() => on && setState({ status: 'none', slug: '' }));
    return () => { on = false; };
  }, [host]);
  if (state.status === 'loading') return <BrandLoader full label="Loading"/>;
  if (state.status === 'none') return <main className="dm-unconnected" style={{ padding: '15vh 24px', textAlign: 'center' }}><h1>This website is not available</h1><p>This address is not connected to a shop right now.</p></main>;
  const { slug } = state;
  return <Routes>
    <Route path="/" element={<ShopPage hostedSlug={slug}/>}/>
    <Route path="/product/:id" element={<ProductPage hostedSlug={slug}/>}/>
    <Route path="/offers/opt-out/:token" element={<OfferOptOut/>}/>
    <Route path="/store/:slug" element={<Own slug={slug}><ShopPage/></Own>}/>
    <Route path="/store/:slug/product/:id" element={<Own slug={slug}><ProductPage/></Own>}/>
    <Route path="/store/:slug/order/:id" element={<Own slug={slug}><RestaurantOrderTracking/></Own>}/>
    <Route path="/store/:slug/order/lead/:id" element={<Own slug={slug}><LeadOrderTracking/></Own>}/>
    <Route path="/store/:slug/orders" element={<Own slug={slug}><MyOrdersPage/></Own>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
