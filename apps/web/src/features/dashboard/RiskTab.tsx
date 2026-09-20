import { useNavigate } from 'react-router';

import { ForecastDumbbellChart } from '@/components/charts/forecast-dumbbell-chart';
import { formatCompactCurrency, formatInteger } from '@/lib/format';

import { useRiskDashboard } from './api';
import { DashboardEmpty, DashboardError, DashboardLoading } from './DashboardStates';
import { criticalBandHint, formatCountDelta, formatCurrencyDelta, riskBandHint } from './format';
import { KpiRow } from './KpiRow';
import { RankingTable } from './RankingTable';
import { ScoreGuide } from './ScoreGuide';

/**
 * Aba "Em risco" (§39): responde com quem falar, por quê, em que ordem e o que fazer.
 * KPIs em texto → explicação dos scores → forecast priorizado → tabela de ranking. Sem filtros:
 * é uma lista fixa para o representante.
 */
export function RiskTab() {
  const navigate = useNavigate();
  const query = useRiskDashboard();

  const openClient = (clientId: string) => navigate(`/clients/${clientId}`);

  if (query.isPending) return <DashboardLoading label="Carregando a aba Em risco" />;
  if (query.isError)
    return <DashboardError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const { kpis } = data;
  // Faixas e pesos vêm do payload (configuração da organização), nunca de números fixos (§65).
  const { thresholds } = data.forecast;

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
            label: 'Saúde crítica',
            value: formatInteger(kpis.criticalClients.value),
            delta: formatCountDelta(kpis.criticalClients.delta),
            hint: criticalBandHint(thresholds),
          },
          {
            label: 'Saúde em risco',
            value: formatInteger(kpis.riskClients.value),
            delta: formatCountDelta(kpis.riskClients.delta),
            hint: riskBandHint(thresholds),
          },
          {
            label: 'Receita em risco',
            value: formatCompactCurrency(kpis.mrrAtRisk.value),
            delta: formatCurrencyDelta(kpis.mrrAtRisk.delta),
            hint: 'clientes com saúde em risco ou crítica',
          },
        ]}
      />

      {data.ranking.length === 0 ? (
        <DashboardEmpty filtered={false} />
      ) : (
        <>
          <ScoreGuide example={data.ranking[0]!} priorityWeights={data.priorityWeights} />

          <ForecastDumbbellChart data={data.forecast} onSelect={openClient} />

          <section aria-labelledby="ranking-title" className="space-y-3">
            <div>
              <h3 id="ranking-title" className="text-base font-semibold">
                Ranking por prioridade
              </h3>
              <p className="text-[13px] text-muted-foreground">
                O primeiro cliente é a ação mais urgente. A ordem considera o sinal de risco atual e
                o impacto comercial do contrato; "Analisar" abre os detalhes.
              </p>
            </div>
            <RankingTable rows={data.ranking} onSelect={openClient} />
          </section>
        </>
      )}
    </div>
  );
}
