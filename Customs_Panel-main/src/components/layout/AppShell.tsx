import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ImpersonationBanner from './ImpersonationBanner';

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <ImpersonationBanner />
        <Topbar />
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
