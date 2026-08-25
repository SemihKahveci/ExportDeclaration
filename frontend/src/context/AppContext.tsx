import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, DeploymentMode, FirmUser, Role } from '../types';
import { ALL_CAPABILITY_KEYS } from '../permissions/registry';
import * as authApi from '../api/authApi';

const EMPTY_USER: FirmUser = { id: '', name: '', role: '', capabilities: [] };
const DEFAULT_STATE: AppState = {
  deploymentMode: 'cloud',
  role: 'yetkili',
  impersonatingOrgId: null,
  currentUser: EMPTY_USER,
};

interface AppContextValue extends AppState {
  isAuthenticated: boolean;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setRole: (role: Role) => void;
  setDeploymentMode: (mode: DeploymentMode) => void;
  setImpersonatingOrgId: (id: string | null) => void;
  setCurrentUser: (user: FirmUser) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function roleFromAuth(user: authApi.AuthUser): Role {
  if (user.systemRole === 'SUPERADMIN') return 'super_admin';
  if (user.role === 'Admin') return 'admin';
  if (user.role === 'Yönetici' || user.role === 'MT Yönetici') return 'manager';
  return 'yetkili';
}

function firmUserFromAuth(user: authApi.AuthUser): FirmUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    systemRole: user.systemRole,
    capabilities: user.systemRole === 'SUPERADMIN' ? ALL_CAPABILITY_KEYS : user.capabilities,
  };
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(false);

  const applyUser = useCallback((user: authApi.AuthUser) => {
    setState((s) => ({ ...s, role: roleFromAuth(user), currentUser: firmUserFromAuth(user) }));
    setAuthenticated(true);
  }, []);

  const refreshAuth = useCallback(async () => {
    try { applyUser(await authApi.me()); }
    catch { setAuthenticated(false); setState((s) => ({ ...s, role: 'yetkili', currentUser: EMPTY_USER })); }
    finally { setAuthLoading(false); }
  }, [applyUser]);

  useEffect(() => { void refreshAuth(); }, [refreshAuth]);

  const login = async (email: string, password: string) => {
    applyUser(await authApi.login(email, password));
  };
  const logout = async () => {
    try { await authApi.logout(); } finally {
      setAuthenticated(false);
      setState((s) => ({ ...s, role: 'yetkili', currentUser: EMPTY_USER }));
    }
  };

  const setRole = (role: Role) => setState((s) => ({ ...s, role }));
  const setDeploymentMode = (deploymentMode: DeploymentMode) => setState((s) => ({ ...s, deploymentMode }));
  const setImpersonatingOrgId = (impersonatingOrgId: string | null) => setState((s) => ({ ...s, impersonatingOrgId }));
  const setCurrentUser = (currentUser: FirmUser) => setState((s) => ({ ...s, currentUser }));

  return (
    <AppContext.Provider value={{ ...state, isAuthenticated, authLoading, login, logout, refreshAuth, setRole, setDeploymentMode, setImpersonatingOrgId, setCurrentUser }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContextProvider');
  return ctx;
}
