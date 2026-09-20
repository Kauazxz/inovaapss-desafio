/**
 * Monta os dados da aba "Em risco" (§39) a partir dos snapshots.
 *
 * O gráfico de forecast é construído pelo motor (buildForecastRow), então a projeção da tela é
 * exatamente a mesma regra testada no engine — nada de heurística duplicada aqui.
 */
import { buildForecastRow } from '@inovaapss/engine';
import {
  DEFAULT_HEALTH_BANDS,
  DEFAULT_PRIORITY_WEIGHTS,
  type ClassDistributionItem,
  type DimensionHealth,
  type ForecastRow,
  type GeneralDashboardData,
  type HealthClass,
  type HealthTimePoint,
  type RankingRow,
  type RiskDashboardData,
} from '@inovaapss/shared';

import type { DashboardRepository, SnapshotRow } from './repository.js';

const TREND_WINDOW = 3;
const PERIOD_LABEL = 'mês';

/** Limite inferior de uma classe nas faixas vigentes (§7). */
function minOfClass(healthClass: HealthClass): number {
  return DEFAULT_HEALTH_BANDS.find((band) => band.class === healthClass)?.min ?? 0;
}

interface EvidenceDriver {
  humanExplanation?: string;
  metricName?: string;
  suggestedAction?: string;
}

function readEvidence(json: unknown): EvidenceDriver[] {
  if (json === null || typeof json !== 'object') return [];
  const evidence = (json as { evidence?: unknown }).evidence;
  return Array.isArray(evidence) ? (evidence as EvidenceDriver[]) : [];
}

/** §57: nunca mostrar score sem tendência. Compara os dois últimos períodos. */
function trendOf(history: (number | null)[]): RankingRow['trend'] {
  const finite = history.filter((v): v is number => typeof v === 'number');
  if (finite.length < 2) return 'unknown';
  const last = finite[finite.length - 1] as number;
  const previous = finite[finite.length - 2] as number;
  const delta = last - previous;
  if (Math.abs(delta) < 1) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

/** Categoria da métrica → dimensão exibida na aba Geral. Vem do preset; o "outras" pega o resto. */
const DIMENSION_LABELS: Record<string, string> = {
  Atendimento: 'Atendimento',
  SLA: 'SLA',
  Adoção: 'Uso',
  Relacionamento: 'Relacionamento',
  Financeiro: 'Financeiro',
  Satisfação: 'NPS',
};

/** "2026-06-30" → "jun/26". */
function shortLabel(periodEnd: string): string {
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  const [year, month] = periodEnd.split('-');
  const index = Number(month) - 1;
  return `${meses[index] ?? month}/${(year ?? '').slice(2)}`;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Number((valores.reduce((total, v) => total + v, 0) / valores.length).toFixed(2));
}

export interface DashboardService {
  risk(organizationId: string): Promise<RiskDashboardData>;
  general(organizationId: string): Promise<GeneralDashboardData>;
}

export function createDashboardService(repository: DashboardRepository): DashboardService {
  return {
    async risk(organizationId) {
      const clients = await repository.listClients(organizationId);
      const snapshots = await repository.listSnapshots(
        organizationId,
        clients.map((c) => c.id),
      );

      const byClient = new Map<string, SnapshotRow[]>();
      for (const snapshot of snapshots) {
        const list = byClient.get(snapshot.portfolioClientId) ?? [];
        list.push(snapshot);
        byClient.set(snapshot.portfolioClientId, list);
      }

      const currency = clients.find((c) => c.currency)?.currency ?? 'BRL';
      const rows: RankingRow[] = [];
      const classCounts: Record<HealthClass, number> = {
        NORMAL: 0,
        ATTENTION: 0,
        RISK: 0,
        CRITICAL: 0,
      };
      let mrrAtRisk = 0;
      let mrrAtRiskPrevious = 0;
      let criticalNow = 0;
      let riskNow = 0;
      let criticalPrevious = 0;
      let riskPrevious = 0;
      let activeNow = 0;
      let generatedAt = '';

      for (const client of clients) {
        // "Com quem falar hoje" é lista de ação: quem já cancelou não entra (fica no histórico,
        // na aba Geral e na calibração). Arquivado e inativo também não são acionáveis.
        if (client.status !== 'active') continue;
        const history = byClient.get(client.id) ?? [];
        if (history.length === 0) continue;
        const latest = history[history.length - 1] as SnapshotRow;
        const previous = history.length > 1 ? (history[history.length - 2] as SnapshotRow) : null;
        if (latest.overallHealth === null || latest.priorityScore === null) continue;

        const mrr = Number(client.monthlyValue ?? 0);
        const healthHistory = history.map((s) => s.overallHealth);
        const drivers = readEvidence(latest.evidenceJson);
        const topEvidence = drivers[0]?.humanExplanation ?? 'Sem desvio relevante no período.';

        const forecast: ForecastRow = buildForecastRow(
          {
            clientId: client.id,
            clientName: client.name,
            mrr,
            currency: client.currency ?? currency,
            priorityScore: latest.priorityScore,
            ...(latest.priorityClass
              ? { priorityClass: latest.priorityClass as ForecastRow['priorityClass'] }
              : {}),
            healthHistory,
            analysisConfidence: latest.analysisConfidence ?? 0,
            topEvidence,
            periodEnd: latest.periodEnd,
          },
          { trendWindow: TREND_WINDOW, healthBands: DEFAULT_HEALTH_BANDS },
        );

        const isActive = client.status === 'active';
        if (isActive) activeNow += 1;
        classCounts[forecast.currentClass] += 1;
        if (forecast.currentClass === 'CRITICAL') criticalNow += 1;
        if (forecast.currentClass === 'RISK') riskNow += 1;
        if (forecast.currentClass === 'CRITICAL' || forecast.currentClass === 'RISK') {
          mrrAtRisk += mrr;
        }
        if (previous?.healthClass === 'CRITICAL') {
          criticalPrevious += 1;
          mrrAtRiskPrevious += mrr;
        }
        if (previous?.healthClass === 'RISK') {
          riskPrevious += 1;
          mrrAtRiskPrevious += mrr;
        }

        rows.push({
          ...forecast,
          position: 0,
          riskScore: latest.riskScore ?? Math.round(100 - forecast.healthCurrent),
          trend: trendOf(healthHistory),
          suggestedAction: drivers[0]?.suggestedAction ?? 'Acompanhar na rotina.',
          evidences: drivers
            .map((d) => d.humanExplanation)
            .filter((text): text is string => typeof text === 'string')
            .slice(0, 4),
          plan: client.planName ?? '—',
          segment: client.segment ?? '—',
          size: client.size ?? '—',
          status: client.status,
        });

        if (latest.periodEnd > generatedAt) generatedAt = latest.periodEnd;
      }

      /**
       * A aba lista quem precisa de atenção, não a carteira inteira (§39):
       *   - quem já está em Risco ou Crítico hoje; e
       *   - quem está saudável mas a tendência leva para Risco/Crítico no próximo período
       *     (é o alerta antecipado, o motivo de existir o gráfico de projeção).
       * Quem está Normal ou em Atenção estável fica de fora — aparece na aba Geral.
       */
      const precisaAtencao = (row: RankingRow): boolean =>
        row.currentClass === 'RISK' || row.currentClass === 'CRITICAL' || row.crossesDown;

      const emRisco = rows.filter(precisaAtencao);
      emRisco.sort((a, b) => b.priorityScore - a.priorityScore);
      emRisco.forEach((row, index) => {
        row.position = index + 1;
      });

      const crossingCount = emRisco.filter((row) => row.crossesDown).length;

      return {
        kpis: {
          activeClients: { value: activeNow, delta: null },
          criticalClients: { value: criticalNow, delta: criticalNow - criticalPrevious },
          riskClients: { value: riskNow, delta: riskNow - riskPrevious },
          mrrAtRisk: {
            value: Math.round(mrrAtRisk),
            delta: Math.round(mrrAtRisk - mrrAtRiskPrevious),
          },
          currency,
        },
        forecast: {
          rows: emRisco,
          thresholds: {
            // As faixas vêm da lista oficial (§7): Normal ≥ 80, Atenção ≥ 60, Risco ≥ 40.
            attention: minOfClass('NORMAL'),
            risk: minOfClass('ATTENTION'),
            critical: minOfClass('RISK'),
          },
          trendWindow: TREND_WINDOW,
          periodLabel: PERIOD_LABEL,
          crossingCount,
        },
        priorityWeights: DEFAULT_PRIORITY_WEIGHTS,
        ranking: emRisco,
        // Distribuição de TODOS os clientes ativos, para a tela dizer "N de M".
        classCounts,
        generatedAt: generatedAt || new Date(0).toISOString(),
      };
    },

    async general(organizationId) {
      const clients = await repository.listClients(organizationId);
      const snapshots = await repository.listSnapshots(
        organizationId,
        clients.map((c) => c.id),
      );
      const metricHealth = await repository.listMetricHealth(organizationId);

      const currency = clients.find((c) => c.currency)?.currency ?? 'BRL';

      // Último snapshot de cada cliente → distribuição e KPIs.
      const latestByClient = new Map<string, SnapshotRow>();
      const periodsSet = new Set<string>();
      for (const snapshot of snapshots) {
        periodsSet.add(snapshot.periodEnd);
        latestByClient.set(snapshot.portfolioClientId, snapshot);
      }
      const periods = [...periodsSet].sort();
      const lastPeriod = periods[periods.length - 1] ?? '';

      const counts: Record<HealthClass, { count: number; mrr: number }> = {
        CRITICAL: { count: 0, mrr: 0 },
        RISK: { count: 0, mrr: 0 },
        ATTENTION: { count: 0, mrr: 0 },
        NORMAL: { count: 0, mrr: 0 },
      };
      let mrrTotal = 0;
      let ativos = 0;
      let cancelados = 0;

      for (const client of clients) {
        const mrr = Number(client.monthlyValue ?? 0);
        mrrTotal += mrr;
        if (client.status === 'active') ativos += 1;
        if (client.status === 'cancelled') cancelados += 1;
        const latest = latestByClient.get(client.id);
        const classe = latest?.healthClass as HealthClass | undefined;
        if (classe && counts[classe]) {
          counts[classe].count += 1;
          counts[classe].mrr += mrr;
        }
      }

      const totalClassificados = Object.values(counts).reduce((t, c) => t + c.count, 0) || 1;
      const distribution: ClassDistributionItem[] = (
        ['CRITICAL', 'RISK', 'ATTENTION', 'NORMAL'] as HealthClass[]
      ).map((healthClass) => ({
        healthClass,
        count: counts[healthClass].count,
        share: Number((counts[healthClass].count / totalClassificados).toFixed(4)),
        mrr: Math.round(counts[healthClass].mrr),
      }));

      // Saúde por dimensão no último período de cada cliente.
      const porDimensao = new Map<string, { valores: number[]; clientes: Set<string> }>();
      const ultimoPorCliente = new Map<string, string>();
      for (const row of metricHealth) {
        const atual = ultimoPorCliente.get(row.portfolioClientId);
        if (atual === undefined || row.periodEnd > atual) {
          ultimoPorCliente.set(row.portfolioClientId, row.periodEnd);
        }
      }
      for (const row of metricHealth) {
        if (row.metricHealth === null) continue;
        if (ultimoPorCliente.get(row.portfolioClientId) !== row.periodEnd) continue;
        const key = row.category ?? 'Outras';
        const bucket = porDimensao.get(key) ?? { valores: [], clientes: new Set<string>() };
        bucket.valores.push(row.metricHealth);
        bucket.clientes.add(row.portfolioClientId);
        porDimensao.set(key, bucket);
      }
      const dimensions: DimensionHealth[] = [...porDimensao.entries()]
        .map(([key, bucket]) => ({
          key,
          label: DIMENSION_LABELS[key] ?? key,
          health: media(bucket.valores),
          clientCount: bucket.clientes.size,
        }))
        .sort((a, b) => (a.health ?? 101) - (b.health ?? 101));

      // Evolução: média da carteira por período.
      const porPeriodo = new Map<string, number[]>();
      for (const snapshot of snapshots) {
        if (snapshot.overallHealth === null) continue;
        const lista = porPeriodo.get(snapshot.periodEnd) ?? [];
        lista.push(snapshot.overallHealth);
        porPeriodo.set(snapshot.periodEnd, lista);
      }
      const portfolio: HealthTimePoint[] = periods.map((periodEnd) => ({
        periodEnd,
        label: shortLabel(periodEnd),
        health: media(porPeriodo.get(periodEnd) ?? []),
      }));

      return {
        kpis: {
          mrr: { value: Math.round(mrrTotal), delta: null },
          activeClients: { value: ativos, delta: null },
          cancelledClients: { value: cancelados, delta: null },
          currency,
        },
        distribution,
        targetBand: { min: minOfClass('NORMAL'), max: 100 },
        dimensions,
        timeline: {
          portfolio,
          client: null,
          clientOptions: clients.map((c) => ({ clientId: c.id, clientName: c.name })),
        },
        thresholds: {
          attention: minOfClass('NORMAL'),
          risk: minOfClass('ATTENTION'),
          critical: minOfClass('RISK'),
        },
        generatedAt: lastPeriod || new Date(0).toISOString(),
      };
    },
  };
}
