import { AppContextProvider } from './context/AppContext';
import { ToastProvider } from './components/ui/Toast';
import AppRoutes from './routes/AppRoutes';
import DevSwitcher from './components/dev/DevSwitcher';

export default function App() {
  return (
    <AppContextProvider>
      <ToastProvider>
        <AppRoutes />
        {import.meta.env.DEV && <DevSwitcher />}
      </ToastProvider>
    </AppContextProvider>
  );
}
