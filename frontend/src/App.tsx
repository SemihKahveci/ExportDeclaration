import { AppContextProvider } from './context/AppContext';
import { ToastProvider } from './components/ui/Toast';
import { PanelNotificationProvider } from './notifications/PanelNotifications';
import AppRoutes from './routes/AppRoutes';
import DevSwitcher from './components/dev/DevSwitcher';

export default function App() {
  return (
    <AppContextProvider>
      <ToastProvider>
        <PanelNotificationProvider>
          <AppRoutes />
          {import.meta.env.DEV && <DevSwitcher />}
        </PanelNotificationProvider>
      </ToastProvider>
    </AppContextProvider>
  );
}
