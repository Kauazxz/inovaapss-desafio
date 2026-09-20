import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { PrivateLayout } from '@/components/layout/PrivateLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';

import { NotFoundPage } from './NotFoundPage';
import { RequireAuth } from './RequireAuth';
import { RequireOrganization } from './RequireOrganization';

/**
 * As telas de dentro chegam SOB DEMANDA. Antes, as 18 vinham juntas no primeiro arquivo:
 * quem abria o login baixava o painel, os gráficos e o assistente sem precisar de nada disso.
 * Cada `lazy` vira um pedaço separado, buscado só quando alguém entra naquela tela.
 *
 * Login e recuperação de senha ficam de fora de propósito: são a primeira coisa que aparece,
 * e adiar as duas só acrescentaria uma espera onde hoje não existe nenhuma.
 */
const AlertsPage = lazy(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const AssistantPage = lazy(() =>
  import('@/features/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })),
);
const OnboardingPage = lazy(() =>
  import('@/features/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const CalibrationPage = lazy(() =>
  import('@/features/calibration/CalibrationPage').then((m) => ({ default: m.CalibrationPage })),
);
const ClientDetailPage = lazy(() =>
  import('@/features/client-detail/ClientDetailPage').then((m) => ({
    default: m.ClientDetailPage,
  })),
);
const ClientsPage = lazy(() =>
  import('@/features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DocumentDetailPage = lazy(() =>
  import('@/features/documents/DocumentDetailPage').then((m) => ({
    default: m.DocumentDetailPage,
  })),
);
const DocumentsPage = lazy(() =>
  import('@/features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const ImportPage = lazy(() =>
  import('@/features/import/ImportPage').then((m) => ({ default: m.ImportPage })),
);
const MetricModelDetailPage = lazy(() =>
  import('@/features/metric-models/MetricModelDetailPage').then((m) => ({
    default: m.MetricModelDetailPage,
  })),
);
const MetricModelsPage = lazy(() =>
  import('@/features/metric-models/MetricModelsPage').then((m) => ({
    default: m.MetricModelsPage,
  })),
);
const MetricDetailPage = lazy(() =>
  import('@/features/metrics/MetricDetailPage').then((m) => ({ default: m.MetricDetailPage })),
);
const MetricsPage = lazy(() =>
  import('@/features/metrics/MetricsPage').then((m) => ({ default: m.MetricsPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

/**
 * Mapa de rotas (§38). Só o registro fica aqui; cada tela vive na sua feature
 * (apps/web/src/features/<feature>/), como manda o ETAPAS.md.
 *
 * O AuthProvider envolve as rotas (e fica dentro do QueryClientProvider do App) para /login
 * saber se já há sessão e as privadas passarem por RequireAuth → RequireOrganization.
 */
export function AppRoutes() {
  return (
    <AuthProvider>
      {/* Enquanto o pedaço da tela chega, o aviso some no leitor de tela mas existe para ele. */}
      <Suspense fallback={<span className="sr-only">Carregando a tela…</span>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Públicas */}
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            {/* Logado, mas ainda sem organização */}
            <Route element={<PublicLayout />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>

            {/* Privadas: precisam de sessão e organização; layout com navegação superior */}
            <Route element={<RequireOrganization />}>
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
                <Route path="/documents/:id" element={<DocumentDetailPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/calibration" element={<CalibrationPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
