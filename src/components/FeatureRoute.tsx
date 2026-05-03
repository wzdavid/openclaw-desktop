import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import {
  type EditionFeatureKey,
  getFirstEnabledAppPath,
  isFeatureEnabled,
} from '@/config/edition';

export function FeatureRoute({
  feature,
  children,
}: {
  feature: EditionFeatureKey;
  children: ReactNode;
}) {
  if (!isFeatureEnabled(feature)) {
    return <Navigate to={getFirstEnabledAppPath()} replace />;
  }
  return <>{children}</>;
}
