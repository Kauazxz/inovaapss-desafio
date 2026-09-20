import { ClassDistributionChart } from '@/components/charts/class-distribution-chart';
import { DimensionHealthChart } from '@/components/charts/dimension-health-chart';
import { HealthTimelineChart } from '@/components/charts/health-timeline-chart';
import { formatCompactCurrency, formatInteger } from '@/lib/format';

import { useGeneralDashboard } from './api';
import { DashboardEmpty, DashboardError, DashboardLoading } from './DashboardStates';
import { formatCountDelta, formatCurrencyDelta } from './format';
import { KpiRow } from './KpiRow';

/**
 * Aba "Geral" (§39): distribuição por classe (barras, nunca pizza — A1), MRR, ativos,
 * cancelados, saúde por dimensão e evolução temporal para a carteira completa.
 */
export function GeneralTab() {
  const query = useGeneralDashboard();

  if (query.isPending) return <DashboardLoading label="Carregando a aba Geral" />;
  if (query.isError)
    return <DashboardError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const reloading = query.isFetching && query.isPlaceholderData;
  const { kpis } = data;
  const totalClients = kpis.activeClients.value + kpis.cancelledClients.value;

  return (
    <div className="space-y-6">
      <KpiRow
        label="Resumo da carteira"
        items={[
          {
            label: 'MRR',
            value: formatCompactCurrency(kpis.mrr.value),
            delta: formatCurrencyDelta(kpis.mrr.delta),
          },
          {
            label: 'Clientes ativos',
            value: formatInteger(kpis.activeClients.value),
            delta: formatCountDelta(kpis.activeClients.delta),
          },
          {
            label: 'Cancelados',
            value: formatInteger(kpis.cancelledClients.value),
            delta: formatCountDelta(kpis.cancelledClients.delta),
          },
        ]}
      />

      {totalClients === 0 ? (
        <DashboardEmpty filtered={false} />
      ) : (
        <>
          {/* Gráfico não mora em card nem leva borda em volta (DATAVIZ.md §1.3): ele ocupa a
              largura inteira, que no celular é o que falta. */}
          <ClassDistributionChart distribution={data.distribution} reloading={reloading} />
          <DimensionHealthChart
            dimensions={data.dimensions}
            targetBand={data.targetBand}
            thresholds={data.thresholds}
            reloading={reloading}
          />
          <HealthTimelineChart
            timeline={data.timeline}
            thresholds={data.thresholds}
            reloading={reloading}
          />
        </>
      )}
    </div>
  );
}
