import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ImpersonationBanner from './ImpersonationBanner';
import { useAppContext } from '../../context/AppContext';

export default function AppShell() {
  const { authLoading, isAuthenticated } = useAppContext();
  const location = useLocation();
  if (authLoading) return <div className="min-h-screen bg-paper flex items-center justify-center text-muted text-[13px]">Oturum kontrol ediliyor…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <ImpersonationBanner />
        <Topbar />
        <main className="flex-1 min-h-0 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
