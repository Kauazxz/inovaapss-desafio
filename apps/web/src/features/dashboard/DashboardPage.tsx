import { lazy, Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportDataButton } from '@/features/import/ImportDataButton';

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
        <ImportDataButton />
      </PageHeader>

      <Tabs defaultValue="risk">
        <TabsList variant="line" aria-label="Visões do dashboard">
          <TabsTrigger value="risk">Em risco</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>

        {/* min-w-0: tabela larga rola dentro dela mesma, nunca empurra a página para o lado. */}
        <TabsContent value="risk" className="min-w-0 pt-5">
          <Suspense fallback={<DashboardLoading label="Carregando a aba Em risco" />}>
            <RiskTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="general" className="min-w-0 pt-5">
          <Suspense fallback={<DashboardLoading label="Carregando a aba Geral" />}>
            <GeneralTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}
