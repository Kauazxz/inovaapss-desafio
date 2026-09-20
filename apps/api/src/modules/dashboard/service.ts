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
  type ForecastRow,
  type HealthClass,
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

export interface DashboardService {
  risk(organizationId: string): Promise<RiskDashboardData>;
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

      rows.sort((a, b) => b.priorityScore - a.priorityScore);
      rows.forEach((row, index) => {
        row.position = index + 1;
      });

      const crossingCount = rows.filter((row) => row.crossesDown).length;

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
          rows,
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
        ranking: rows,
        classCounts,
        generatedAt: generatedAt || new Date(0).toISOString(),
      };
    },
  };
}
