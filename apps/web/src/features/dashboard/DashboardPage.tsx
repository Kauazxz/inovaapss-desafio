import { BarChartHorizontal } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCompactCurrency } from '@/lib/format';
import { MOCK_CROSSING_COUNT, MOCK_FORECAST_ROWS, MOCK_RISK_SUMMARY } from '@/lib/mock/dashboard';

import { RiskSummary } from './RiskSummary';

import type { RankedBarDatum } from '@/components/charts/ranked-bar-chart';

// O Recharts é pesado: carrega num chunk separado, só quando o dashboard abre.
const RankedBarChart = lazy(() =>
  import('@/components/charts/ranked-bar-chart').then((module) => ({
    default: module.RankedBarChart,
  })),
);

/** Título dinâmico com o "e daí?" (DATAVIZ.md §5.1): muda com 0, 1 ou N cruzamentos. */
function crossingTitle(count: number): string {
  if (count === 0) return 'Nenhum cliente deve mudar de faixa no próximo período';
  if (count === 1) return '1 cliente deve cruzar para Risco ou Crítico no próximo período';
  return `${count} clientes devem cruzar para Risco ou Crítico no próximo período`;
}

const chartData: RankedBarDatum[] = MOCK_FORECAST_ROWS.map((row, index) => ({
  id: row.clientId,
  label: `#${index + 1} · ${row.clientName} · ${formatCompactCurrency(row.mrr)}`,
  value: row.priorityScore,
  highlighted: row.crossesDown,
  note: row.topEvidence,
}));

/**
 * Dashboard (§39): abas "Em risco" e "Geral".
 * Etapa 0: dados de exemplo (mock) e o gráfico de barras ordenadas como prévia.
 * Etapa 8 troca o mock por GET /dashboard/risk e entrega o dumbbell de forecast (A2).
 */
export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Com quem falar hoje"
        description="Quem está em risco, por quê, em que ordem e o que fazer."
      >
        <Badge variant="outline">Dados de exemplo (mock)</Badge>
      </PageHeader>

      <Tabs defaultValue="risk">
        <TabsList variant="line" aria-label="Visões do dashboard">
          <TabsTrigger value="risk">Em risco</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="risk" className="space-y-8 pt-4">
          <RiskSummary summary={MOCK_RISK_SUMMARY} />
          <Suspense fallback={<Skeleton className="h-64 w-full" aria-label="Carregando gráfico" />}>
            <RankedBarChart
              title={crossingTitle(MOCK_CROSSING_COUNT)}
              subtitle="Ranking por prioridade (0–100) · em azul, quem cruza a faixa · projeção por tendência dos últimos 3 meses — não é modelo preditivo · dados de exemplo (mock)"
              data={chartData}
              valueLabel="Prioridade"
              labelHeading="Cliente"
              noteHeading="Principal evidência"
              maxValue={100}
              onSelect={(id) => navigate(`/clients/${id}`)}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="general" className="pt-4">
          <EmptyState
            icon={BarChartHorizontal}
            title="A visão geral da carteira chega na Etapa 8"
            description="Distribuição Normal / Atenção / Risco / Crítico em barras (nunca pizza), MRR, ativos, cancelados, saúde por dimensão e evolução no tempo — com filtros."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
