import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAppContext } from '../context/AppContext';
import { PERMISSIONS } from '../permissions/registry';
import type { Role, DeploymentMode } from '../types';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: Role[];
  requiredMode?: DeploymentMode;
  requiredCaps?: string[];
  fallback?: string;
}

function firstPermittedRoute(capabilities: string[]): string {
  const capSet = new Set(capabilities);
  for (const screen of PERMISSIONS) {
    if (screen.capabilities.some((c) => capSet.has(c.key))) {
      return screen.route;
    }
  }
  return '/dosya-takip';
}

export default function ProtectedRoute({
  children,
  requiredRoles,
  requiredMode,
  requiredCaps,
  fallback,
}: ProtectedRouteProps) {
  const { role, deploymentMode, currentUser } = useAppContext();

  if (requiredRoles && !requiredRoles.includes(role)) {
    return <Navigate to={fallback ?? firstPermittedRoute(currentUser.capabilities)} replace />;
  }

  if (requiredMode && deploymentMode !== requiredMode) {
    return <Navigate to={fallback ?? firstPermittedRoute(currentUser.capabilities)} replace />;
  }

  if (requiredCaps) {
    const capSet = new Set(currentUser.capabilities);
    const hasAccess = requiredCaps.some((c) => capSet.has(c));
    if (!hasAccess) {
      return <Navigate to={fallback ?? firstPermittedRoute(currentUser.capabilities)} replace />;
    }
  }

  return <>{children}</>;
}
