import BrandLoader from '../shared/components/BrandLoader.jsx';
import React, { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
export { useAuth } from './auth.jsx';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './theme.jsx';
import { OfferOptOut } from '../features/dashboard/OfferCampaigns.jsx';
import ShopPage from '../features/storefront/ShopPage.jsx';
import { hostedStoreSlug } from '../features/storefront/store-domain.js';
import { RestaurantOrderTracking, LeadOrderTracking, MyOrdersPage } from '../features/storefront/OrderTracking.jsx';
import Motion from '../shared/components/Motion.jsx';
import HashScroll from '../shared/components/HashScroll.jsx';
import Toasts from '../shared/components/Toasts.jsx';

const SetPassword = lazy(() => import('../features/auth/SetPassword.jsx'));
const Landing = lazy(() => import('../features/landing/Landing.jsx'));
const Access = lazy(() => import('../features/auth/Access.jsx'));
const ShopRequest = lazy(() => import('../features/storefront/ShopRequest.jsx'));
const ProductPage = lazy(() => import('../features/storefront/ProductPage.jsx'));
const Dashboard = lazy(() => import('../features/dashboard/Dashboard.jsx'));
const SuperAdmin = lazy(() => import('../features/superadmin/SuperAdmin.jsx'));
const Nearby = lazy(() => import('../features/storefront/Nearby.jsx'));

function Guard({ role, children }) {
  const { session } = useAuth();
  const location = useLocation();
  return !session ? <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace/> : session.user.role !== role && !(role === 'owner' && session.user.role === 'staff') ? <Navigate to={session.user.role === 'superadmin' ? '/superadmin' : '/dashboard'} replace/> : children;
}

export default function App() {
  const hostedSlug = hostedStoreSlug();
  return <ThemeProvider><AuthProvider><Toasts/><Motion/><HashScroll/><Suspense fallback={<BrandLoader full label="Loading"/>}><Routes>
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
