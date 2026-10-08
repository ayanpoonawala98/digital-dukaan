const SetPassword = lazy(() => import('./pages/SetPassword.jsx'));
import {OfferOptOut} from './components/OfferCampaigns.jsx';
import React, { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
export { useAuth } from './auth.jsx';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './theme.jsx';
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Access = lazy(() => import('./pages/Access.jsx'));
const ShopRequest = lazy(() => import('./pages/ShopRequest.jsx'));
import ShopPage from './pages/ShopPage.jsx';
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin.jsx'));
import { hostedStoreSlug } from './lib/store-domain.js';
import { RestaurantOrderTracking, LeadOrderTracking, MyOrdersPage } from './components/OrderTracking.jsx';
const Nearby = lazy(() => import('./pages/Nearby.jsx'));
import Motion from './components/Motion.jsx';
import HashScroll from './components/HashScroll.jsx';
import Toasts from './components/Toasts.jsx';

function Guard({ role, children }) {
  const { session } = useAuth();
  const location = useLocation();
  return !session ? <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace/> : session.user.role !== role && !(role === 'owner' && session.user.role === 'staff') ? <Navigate to={session.user.role === 'superadmin' ? '/superadmin' : '/dashboard'} replace/> : children;
}

export default function App() {
  const hostedSlug = hostedStoreSlug();
  return <ThemeProvider><AuthProvider><Toasts/><Motion/><HashScroll/><Suspense fallback={<main className="container" role="status" aria-live="polite"><p>Loading...</p></main>}><Routes>
      <Route path="/offers/opt-out/:token" element={<OfferOptOut/>}/>
    <Route path="/" element={hostedSlug ? <ShopPage hostedSlug={hostedSlug}/> : <Landing/>}/>
    <Route path="/product/:id" element={hostedSlug ? <ProductPage hostedSlug={hostedSlug}/> : <Navigate to="/" replace/>}/>
    <Route path="/near" element={<Nearby/>}/>
    <Route path="/signup" element={<ShopRequest/>}/>
    <Route path="/set-password" element={<SetPassword/>}/>
    <Route path="/login" element={<Access mode="login"/>}/>
    <Route path="/store/:slug" element={<ShopPage/>}/>
    <Route path="/store/:slug/product/:id" element={<ProductPage/>}/>
    <Route path="/store/:slug/order/:id" element={<RestaurantOrderTracking/>}/>
    <Route path="/store/:slug/order/lead/:id" element={<LeadOrderTracking/>}/>
    <Route path="/store/:slug/orders" element={<MyOrdersPage/>}/>
    <Route path="/dashboard" element={<Guard role="owner"><Dashboard/></Guard>}/>
    <Route path="/superadmin" element={<Guard role="superadmin"><SuperAdmin/></Guard>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense></AuthProvider></ThemeProvider>;
}
