import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { RankingRow } from '@inovaapss/shared';

import { ForecastDumbbellChart } from '@/components/charts/forecast-dumbbell-chart';
import { formatCompactCurrency, formatInteger } from '@/lib/format';

import { useRiskDashboard } from './api';
import { ClientPreviewDialog } from './ClientPreviewDialog';
import { DashboardEmpty, DashboardError, DashboardLoading } from './DashboardStates';
import { criticalBandHint, formatCountDelta, formatCurrencyDelta, riskBandHint } from './format';
import { KpiRow } from './KpiRow';
import { RankingTable } from './RankingTable';

/**
 * Aba "Em risco" (§39): responde com quem falar, por quê, em que ordem e o que fazer.
 * KPIs em texto → explicação dos scores → forecast priorizado → tabela de ranking. Sem filtros:
 * é uma lista fixa para o representante.
 */
export function RiskTab() {
  const navigate = useNavigate();
  const query = useRiskDashboard();

  const openClient = (clientId: string) => navigate(`/clients/${clientId}`);

  // "Analisar" abre a prévia do caso aqui mesmo; a ida para a tela do cliente é uma escolha
  // dentro dela, não um efeito colateral do clique na fila.
  const [preview, setPreview] = useState<RankingRow | null>(null);

  if (query.isPending) return <DashboardLoading label="Carregando a aba Em risco" />;
  if (query.isError)
    return <DashboardError error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const { kpis } = data;
  // O gráfico entrega só o id: a prévia precisa da linha inteira do ranking.
  const previewByClientId = (clientId: string) => {
    const row = data.ranking.find((item) => item.clientId === clientId);
    if (row) setPreview(row);
    else openClient(clientId);
  };
  // Faixas e pesos vêm do payload (configuração da organização), nunca de números fixos (§65).
  const { thresholds } = data.forecast;

  return (
    <div className="space-y-6">
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
          {/* Gráfico não mora em card nem leva borda em volta (DATAVIZ.md §1.3): no celular
              cada pixel de largura é escala do dumbbell. */}
          <ForecastDumbbellChart data={data.forecast} onSelect={previewByClientId} />

          <section aria-labelledby="ranking-title" className="space-y-3">
            <div>
              <h3 id="ranking-title" className="text-base font-semibold">
                Ranking por prioridade
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O primeiro cliente é a ação mais urgente. A ordem considera o sinal de risco atual e
                o impacto comercial do contrato; "Analisar" abre os detalhes.
              </p>
            </div>
            {/* A tabela mora numa superfície elevada, como as outras tabelas do sistema. */}
            <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/5">
              <RankingTable rows={data.ranking} onSelect={setPreview} />
            </div>
          </section>
        </>
      )}

      <ClientPreviewDialog
        row={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        onOpenFullCase={openClient}
      />
    </div>
  );
}
