import {OfferOptOut} from './components/OfferCampaigns.jsx';
import React, { createContext, useContext, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './theme.jsx';
import Landing from './pages/Landing.jsx';
import Access from './pages/Access.jsx';
import ShopRequest from './pages/ShopRequest.jsx';
import ShopPage from './pages/ShopPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SuperAdmin from './pages/SuperAdmin.jsx';
import { hostedStoreSlug } from './lib/store-domain.js';
import { RestaurantOrderTracking, LeadOrderTracking, MyOrdersPage } from './components/OrderTracking.jsx';
import Nearby from './pages/Nearby.jsx';
import Motion from './components/Motion.jsx';
import Toasts from './components/Toasts.jsx';

const Auth = createContext(null);
export const useAuth = () => useContext(Auth);

function AuthProvider({ children }) {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('dd-session')); } catch { return null; } });
  const save = value => { setSession(value); value ? localStorage.setItem('dd-session', JSON.stringify(value)) : localStorage.removeItem('dd-session'); };
  return <Auth.Provider value={{ session, save }}>{children}</Auth.Provider>;
}

function Guard({ role, children }) {
  const { session } = useAuth();
  const location = useLocation();
  return !session ? <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace/> : session.user.role !== role && !(role === 'owner' && session.user.role === 'staff') ? <Navigate to={session.user.role === 'superadmin' ? '/superadmin' : '/dashboard'} replace/> : children;
}

export default function App() {
  const hostedSlug = hostedStoreSlug();
  return <ThemeProvider><AuthProvider><Toasts/><Motion/><Routes>
      <Route path="/offers/opt-out/:token" element={<OfferOptOut/>}/>
    <Route path="/" element={hostedSlug ? <ShopPage hostedSlug={hostedSlug}/> : <Landing/>}/>
    <Route path="/product/:id" element={hostedSlug ? <ProductPage hostedSlug={hostedSlug}/> : <Navigate to="/" replace/>}/>
    <Route path="/near" element={<Nearby/>}/>
    <Route path="/signup" element={<ShopRequest/>}/>
    <Route path="/login" element={<Access mode="login"/>}/>
    <Route path="/store/:slug" element={<ShopPage/>}/>
    <Route path="/store/:slug/product/:id" element={<ProductPage/>}/>
    <Route path="/store/:slug/order/:id" element={<RestaurantOrderTracking/>}/>
    <Route path="/store/:slug/order/lead/:id" element={<LeadOrderTracking/>}/>
    <Route path="/store/:slug/orders" element={<MyOrdersPage/>}/>
    <Route path="/dashboard" element={<Guard role="owner"><Dashboard/></Guard>}/>
    <Route path="/superadmin" element={<Guard role="superadmin"><SuperAdmin/></Guard>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AuthProvider></ThemeProvider>;
}
