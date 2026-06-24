import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PlaceholderPage from '../pages/PlaceholderPage';
import ProtectedRoute from './ProtectedRoute';
import DosyaTakipPage from '../pages/DosyaTakip';
import GtipMalzemePage from '../pages/GtipMalzeme';
import MusterilerPage from '../pages/Musteriler';
import AyarlarPage from '../pages/Ayarlar';
import MaillerPage from '../pages/Mailler';
import GtipHazirlikPage from '../pages/GtipHazirlik';
import EvrakHazirlikPage from '../pages/EvrakHazirlik';
import EvraklarPage from '../pages/Evraklar';
import BeyannameYazimPage from '../pages/BeyannameYazim';
import BeyannameOnayPage from '../pages/BeyannameOnay';
import BeyannameTescilPage from '../pages/BeyannameTescil';
import KapanicEvraklarPage from '../pages/KapanisMutabakat/EvraklarPage';
import KapanicOperasyonEvrakYuklemePage from '../pages/KapanisMutabakat/OperasyonEvrakYuklemePage';
import KapanicOnayPage from '../pages/KapanisMutabakat/OnayPage';
import MusteriGtipSorgulamaPage from '../pages/MusteriGtipSorgulama';
import ArsivPage from '../pages/Arsiv';

const UIShowcasePage = import.meta.env.DEV
  ? lazy(() => import('../pages/UIShowcase'))
  : null;

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Default redirect */}
        <Route index element={<Navigate to="/dosya-takip" replace />} />

        {/* Operasyon */}
        <Route path="/dosya-takip" element={
          <ProtectedRoute requiredCaps={['dosya_takip.view', 'dosya_takip.edit']}>
            <DosyaTakipPage />
          </ProtectedRoute>
        } />
        <Route path="/gtip-hazirlik" element={
          <ProtectedRoute requiredCaps={['gtip_hazirlik.view', 'gtip_hazirlik.edit']}>
            <GtipHazirlikPage />
          </ProtectedRoute>
        } />
        <Route path="/evrak-hazirlik" element={<EvrakHazirlikPage />} />
        <Route path="/beyanname" element={
          <ProtectedRoute requiredCaps={['beyanname.view', 'beyanname.write', 'beyanname.approve', 'beyanname.send']}>
            <BeyannameYazimPage />
          </ProtectedRoute>
        } />
        <Route path="/beyanname/onay" element={<BeyannameOnayPage />} />
        <Route path="/tescil" element={
          <ProtectedRoute requiredCaps={['tescil.view', 'tescil.notify']}>
            <BeyannameTescilPage />
          </ProtectedRoute>
        } />
        <Route path="/kapanis" element={<Navigate to="/kapanis/evraklar" replace />} />
        <Route path="/kapanis/evraklar" element={<KapanicEvraklarPage />} />
        <Route path="/kapanis/operasyon-evrak-yukleme" element={<KapanicOperasyonEvrakYuklemePage />} />
        <Route path="/kapanis/onay" element={<KapanicOnayPage />} />

        {/* GTİP / Malzeme */}
        <Route path="/musteri-gtip-sorgulama" element={
          <ProtectedRoute requiredCaps={['musteri_gtip.view', 'musteri_gtip.edit']}>
            <MusteriGtipSorgulamaPage />
          </ProtectedRoute>
        } />
        <Route path="/gtip-malzeme" element={
          <ProtectedRoute requiredCaps={['gtip_malzeme.view', 'gtip_malzeme.edit']}>
            <GtipMalzemePage />
          </ProtectedRoute>
        } />
        <Route path="/gtip/onay" element={<PlaceholderPage />} />

        {/* Arşiv */}
        <Route path="/arsiv/:operationType" element={
          <ProtectedRoute requiredCaps={['arsiv.view']}>
            <ArsivPage />
          </ProtectedRoute>
        } />

        {/* Sistem */}
        <Route path="/musteriler" element={
          <ProtectedRoute requiredCaps={['musteriler.view', 'musteriler.edit']}>
            <MusterilerPage />
          </ProtectedRoute>
        } />
        <Route path="/evraklar" element={
          <ProtectedRoute requiredCaps={['evraklar.view', 'evraklar.manage']}>
            <EvraklarPage />
          </ProtectedRoute>
        } />
        <Route path="/mailler" element={
          <ProtectedRoute requiredCaps={['mailler.view', 'mailler.manage']}>
            <MaillerPage />
          </ProtectedRoute>
        } />
        <Route
          path="/ayarlar"
          element={
            <ProtectedRoute requiredCaps={['ayarlar.users', 'ayarlar.document_processes', 'ayarlar.mails']}>
              <AyarlarPage />
            </ProtectedRoute>
          }
        />

        {/* Control plane — super_admin only */}
        <Route
          path="/admin/organizations"
          element={
            <ProtectedRoute requiredRoles={['super_admin']} requiredMode="cloud">
              <PlaceholderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/organizations/new"
          element={
            <ProtectedRoute requiredRoles={['super_admin']} requiredMode="cloud">
              <PlaceholderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/organizations/:id"
          element={
            <ProtectedRoute requiredRoles={['super_admin']} requiredMode="cloud">
              <PlaceholderPage />
            </ProtectedRoute>
          }
        />

        {/* Dev-only UI showcase */}
        {import.meta.env.DEV && UIShowcasePage && (
          <Route
            path="/__ui"
            element={
              <Suspense fallback={null}>
                <UIShowcasePage />
              </Suspense>
            }
          />
        )}

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dosya-takip" replace />} />
      </Route>
    </Routes>
  );
}
