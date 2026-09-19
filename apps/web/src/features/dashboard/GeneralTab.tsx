import { useId, useState } from 'react';

import { isEmptyDashboardFilters, type DashboardFilters } from '@inovaapss/shared';

import { ClassDistributionChart } from '@/components/charts/class-distribution-chart';
import { DimensionHealthChart } from '@/components/charts/dimension-health-chart';
import { HealthTimelineChart } from '@/components/charts/health-timeline-chart';
import { formatCompactCurrency, formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useDashboardFilterOptions, useGeneralDashboard } from './api';
import { DashboardFilterBar } from './DashboardFilterBar';
import { DashboardEmpty, DashboardError, DashboardLoading } from './DashboardStates';
import { formatCountDelta, formatCurrencyDelta } from './format';
import { KpiRow } from './KpiRow';

/**
 * Aba "Geral" (§39): distribuição por classe (barras, nunca pizza — A1), MRR, ativos,
 * cancelados, saúde por dimensão e evolução temporal, todos sob a mesma linha de filtros.
 */
export function GeneralTab() {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientSelectId = useId();
  const query = useGeneralDashboard({ filters, selectedClientId });
  const options = useDashboardFilterOptions();

  if (query.isPending) return <DashboardLoading label="Carregando a aba Geral" />;
  if (query.isError)
    return <DashboardError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const reloading = query.isFetching && query.isPlaceholderData;
  const { kpis } = data;
  const totalClients = kpis.activeClients.value + kpis.cancelledClients.value;

  return (
    <div className="space-y-8">
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

      <DashboardFilterBar filters={filters} onFiltersChange={setFilters} options={options.data}>
        <div className="flex flex-col gap-1">
          <label htmlFor={clientSelectId} className="sr-only">
            Destacar cliente na evolução temporal
          </label>
          <select
            id={clientSelectId}
            value={selectedClientId ?? ''}
            onChange={(event) => setSelectedClientId(event.target.value || null)}
            className={cn(
              'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
              selectedClientId ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <option value="">Destacar um cliente…</option>
            {data.timeline.clientOptions.map((option) => (
              <option key={option.clientId} value={option.clientId}>
                {option.clientName}
              </option>
            ))}
          </select>
        </div>
      </DashboardFilterBar>

      {totalClients === 0 ? (
        <DashboardEmpty
          filtered={!isEmptyDashboardFilters(filters)}
          onClearFilters={() => setFilters({})}
        />
      ) : (
        <>
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
