import { Upload } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DASHBOARD_DATA_SOURCE } from './api';
import { DashboardLoading } from './DashboardStates';

// Cada aba carrega num chunk separado (os gráficos puxam o Recharts, que é pesado).
const RiskTab = lazy(() => import('./RiskTab').then((module) => ({ default: module.RiskTab })));
const GeneralTab = lazy(() =>
  import('./GeneralTab').then((module) => ({ default: module.GeneralTab })),
);

/**
 * Dashboard (§39): abas "Em risco" (P0) e "Geral" (P1). Etapa 8: as duas abas completas, com
 * dados de exemplo (mock) até o motor de scoring e o preset GlobalSys entrarem (Etapas 4 + 6).
 */
export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Com quem falar hoje"
        description={
          'Quem apresenta maior risco de cancelamento, por quê, em que ordem agir e o que fazer.'
        }
      >
        {DASHBOARD_DATA_SOURCE === 'mock' ? (
          <Badge variant="outline">Dados de exemplo (mock)</Badge>
        ) : null}
        {/* O dashboard é a primeira tela de quem chega: sem dados, a ação é importar (§34). */}
        <Button asChild variant="outline">
          <Link to="/import">
            <Upload data-icon="inline-start" aria-hidden="true" />
            Importar dados
          </Link>
        </Button>
      </PageHeader>

      <Tabs defaultValue="risk">
        <TabsList variant="line" aria-label="Visões do dashboard">
          <TabsTrigger value="risk">Em risco</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="risk" className="pt-4">
          <Suspense fallback={<DashboardLoading label="Carregando a aba Em risco" />}>
            <RiskTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="general" className="pt-4">
          <Suspense fallback={<DashboardLoading label="Carregando a aba Geral" />}>
            <GeneralTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}
