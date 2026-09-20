import { lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router';

import {
  CLIENT_HEALTH_DIMENSION_LABELS,
  type ClientHealthDimension,
  type ClientHealthOverview,
} from '@inovaapss/shared';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useClientOverview } from './api';
import { ClientDetailError, ClientDetailLoading, ClientTabLoading } from './ClientDetailStates';
import { ClientHeader } from './ClientHeader';

// Cada aba carrega num chunk separado: os gráficos puxam o Recharts, que é pesado.
const OverviewTab = lazy(() =>
  import('./tabs/OverviewTab').then((m) => ({ default: m.OverviewTab })),
);
const SupportTab = lazy(() => import('./tabs/SupportTab').then((m) => ({ default: m.SupportTab })));
const SlaTab = lazy(() => import('./tabs/SlaTab').then((m) => ({ default: m.SlaTab })));
const UsageTab = lazy(() => import('./tabs/UsageTab').then((m) => ({ default: m.UsageTab })));
const NpsTab = lazy(() => import('./tabs/NpsTab').then((m) => ({ default: m.NpsTab })));
const FinancialTab = lazy(() =>
  import('./tabs/FinancialTab').then((m) => ({ default: m.FinancialTab })),
);
const MeetingsTab = lazy(() =>
  import('./tabs/MeetingsTab').then((m) => ({ default: m.MeetingsTab })),
);
const HistoryTab = lazy(() => import('./tabs/HistoryTab').then((m) => ({ default: m.HistoryTab })));

type TabKey = 'overview' | ClientHealthDimension | 'history';

interface TabSpec {
  key: TabKey;
  label: string;
  Component: React.LazyExoticComponent<
    (props: { overview: ClientHealthOverview }) => React.JSX.Element
  >;
}

/** As 8 abas de §40, na ordem da spec. */
const TABS: readonly TabSpec[] = [
  { key: 'overview', label: 'Visão geral', Component: OverviewTab },
  { key: 'support', label: CLIENT_HEALTH_DIMENSION_LABELS.support, Component: SupportTab },
  { key: 'sla', label: CLIENT_HEALTH_DIMENSION_LABELS.sla, Component: SlaTab },
  { key: 'usage', label: CLIENT_HEALTH_DIMENSION_LABELS.usage, Component: UsageTab },
  { key: 'nps', label: CLIENT_HEALTH_DIMENSION_LABELS.nps, Component: NpsTab },
  { key: 'financial', label: CLIENT_HEALTH_DIMENSION_LABELS.financial, Component: FinancialTab },
  { key: 'meetings', label: CLIENT_HEALTH_DIMENSION_LABELS.meetings, Component: MeetingsTab },
  { key: 'history', label: 'Histórico', Component: HistoryTab },
];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

/**
 * §38 /clients/:id — visão individual (§40). Cabeçalho com Health, Risk, Priority e Confiança
 * sempre com contexto; abas Visão geral, Atendimento, SLA, Uso, NPS, Financeiro, Reuniões e
 * Histórico. A aba fica na URL (`?tab=sla`) para o link ser compartilhável.
 */
export function ClientDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useClientOverview(id);
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : 'overview';

  const selectTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'overview') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  if (query.isPending) return <ClientDetailLoading />;
  if (query.isError) {
    return (
      <ClientDetailError error={query.error} clientId={id} onRetry={() => void query.refetch()} />
    );
  }
  const overview = query.data;

  return (
    <>
      <ClientHeader overview={overview} />

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList variant="line" aria-label="Seções do cliente" className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="pt-6">
            {activeTab === tab.key ? (
              <Suspense fallback={<ClientTabLoading label={`Carregando a aba ${tab.label}`} />}>
                <tab.Component overview={overview} />
              </Suspense>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
