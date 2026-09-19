import { useState } from 'react';
import { useNavigate } from 'react-router';

import { isEmptyDashboardFilters, type DashboardFilters } from '@inovaapss/shared';

import { ForecastDumbbellChart } from '@/components/charts/forecast-dumbbell-chart';
import { formatCompactCurrency, formatInteger } from '@/lib/format';

import { useDashboardFilterOptions, useRiskDashboard } from './api';
import { DashboardFilterBar } from './DashboardFilterBar';
import { DashboardEmpty, DashboardError, DashboardLoading } from './DashboardStates';
import { formatCountDelta, formatCurrencyDelta } from './format';
import { KpiRow } from './KpiRow';
import { RankingTable } from './RankingTable';

/**
 * Aba "Em risco" (§39): responde com quem falar, por quê, em que ordem e o que fazer.
 * KPIs em texto → gráfico de forecast priorizado (A2) → tabela de ranking, tudo sob o mesmo filtro.
 */
export function RiskTab() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [search, setSearch] = useState('');
  const query = useRiskDashboard({ filters, search });
  const options = useDashboardFilterOptions();

  const clearFilters = () => {
    setFilters({});
    setSearch('');
  };
  const openClient = (clientId: string) => navigate(`/clients/${clientId}`);
  const isFiltered = !isEmptyDashboardFilters(filters) || search !== '';

  if (query.isPending) return <DashboardLoading label="Carregando a aba Em risco" />;
  if (query.isError)
    return <DashboardError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const reloading = query.isFetching && query.isPlaceholderData;
  const { kpis } = data;

  return (
    <div className="space-y-8">
      <KpiRow
        label="Resumo da carteira"
        items={[
          {
            label: 'Clientes ativos',
            value: formatInteger(kpis.activeClients.value),
            delta: formatCountDelta(kpis.activeClients.delta),
          },
          {
            label: 'Em Crítico',
            value: formatInteger(kpis.criticalClients.value),
            delta: formatCountDelta(kpis.criticalClients.delta),
            hint: 'health abaixo de 40',
          },
          {
            label: 'Em Risco',
            value: formatInteger(kpis.riskClients.value),
            delta: formatCountDelta(kpis.riskClients.delta),
            hint: 'health de 40 a 59',
          },
          {
            label: 'MRR em risco',
            value: formatCompactCurrency(kpis.mrrAtRisk.value),
            delta: formatCurrencyDelta(kpis.mrrAtRisk.delta),
            hint: 'Risco + Crítico',
          },
        ]}
      />

      <DashboardFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        options={options.data}
        search={search}
        onSearchChange={setSearch}
      />

      {data.ranking.length === 0 ? (
        <DashboardEmpty filtered={isFiltered} onClearFilters={clearFilters} />
      ) : (
        <>
          <ForecastDumbbellChart data={data.forecast} onSelect={openClient} reloading={reloading} />

          <section aria-labelledby="ranking-title" className="space-y-3">
            <div>
              <h3 id="ranking-title" className="text-base font-semibold">
                Ranking por prioridade
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Prioridade = risco × 0,7 + impacto comercial × 0,3 (§28). Clique num cabeçalho para
                reordenar; "Analisar" abre o cliente.
              </p>
            </div>
            <div
              style={reloading ? { opacity: 0.6 } : undefined}
              aria-busy={reloading || undefined}
            >
              <RankingTable rows={data.ranking} onSelect={openClient} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
