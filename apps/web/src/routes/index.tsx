import { Navigate, Route, Routes } from 'react-router';

import { PrivateLayout } from '@/components/layout/PrivateLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { CalibrationPage } from '@/features/calibration/CalibrationPage';
import { ClientDetailPage } from '@/features/client-detail/ClientDetailPage';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { ImportPage } from '@/features/import/ImportPage';
import { MetricModelDetailPage } from '@/features/metric-models/MetricModelDetailPage';
import { MetricModelsPage } from '@/features/metric-models/MetricModelsPage';
import { MetricDetailPage } from '@/features/metrics/MetricDetailPage';
import { MetricsPage } from '@/features/metrics/MetricsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

import { NotFoundPage } from './NotFoundPage';
import { RequireAuth } from './RequireAuth';

/**
 * Mapa de rotas (§38). Só o registro fica aqui; cada tela vive na sua feature
 * (apps/web/src/features/<feature>/), como manda o ETAPAS.md.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Públicas */}
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Privadas: passam pelo guard e pelo layout com sidebar */}
      <Route element={<RequireAuth />}>
        <Route element={<PrivateLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/metrics/:id" element={<MetricDetailPage />} />
          <Route path="/metric-models" element={<MetricModelsPage />} />
          <Route path="/metric-models/:id" element={<MetricModelDetailPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
