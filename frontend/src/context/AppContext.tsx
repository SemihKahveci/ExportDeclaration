import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, DeploymentMode, FirmUser, Role } from '../types';
import { ALL_CAPABILITY_KEYS } from '../permissions/registry';

const FULL_ADMIN_USER: FirmUser = {
  id: 'firm-admin',
  name: 'Ahmet Yıldız',
  role: 'Admin',
  capabilities: ALL_CAPABILITY_KEYS,
};

const DEFAULT_STATE: AppState = {
  deploymentMode: 'cloud',
  role: 'admin',
  impersonatingOrgId: null,
  currentUser: FULL_ADMIN_USER,
};

interface AppContextValue extends AppState {
  setRole: (role: Role) => void;
  setDeploymentMode: (mode: DeploymentMode) => void;
  setImpersonatingOrgId: (id: string | null) => void;
  setCurrentUser: (user: FirmUser) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);

  const setRole = (role: Role) => setState((s) => ({ ...s, role }));
  const setDeploymentMode = (deploymentMode: DeploymentMode) =>
    setState((s) => ({ ...s, deploymentMode }));
  const setImpersonatingOrgId = (impersonatingOrgId: string | null) =>
    setState((s) => ({ ...s, impersonatingOrgId }));
  const setCurrentUser = (currentUser: FirmUser) =>
    setState((s) => ({ ...s, currentUser }));

  return (
    <AppContext.Provider value={{ ...state, setRole, setDeploymentMode, setImpersonatingOrgId, setCurrentUser }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContextProvider');
  return ctx;
}
