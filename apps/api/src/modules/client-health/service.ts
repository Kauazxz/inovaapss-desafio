/**
 * Visão individual do cliente (§40): o que está acontecendo, por quê e o que fazer.
 *
 * Monta as quatro respostas da tela a partir dos snapshots já calculados:
 *   overview         cabeçalho, resumo do período e os principais motivos
 *   scores           as 10 métricas com saúde, peso e quanto cada uma tira do total
 *   evidence         os motivos ordenados pelo tamanho do estrago
 *   recommendations  o que fazer, vindo do playbook de cada métrica que está puxando para baixo
 */
import { projectHealth } from '@inovaapss/engine';
import {
  type ClientEvidenceResponse,
  type ClientHealthDimension,
  type ClientHealthOverview,
  type ClientHistoryResponse,
  type TimelineEventDto,
  type ClientRecommendationsResponse,
  type ClientScoresResponse,
  classifyHealth,
  DEFAULT_HEALTH_BANDS,
  type EvidenceDto,
  type HealthClass,
  type HealthTimePoint,
  type HealthTrend,
  type MetricScoreDto,
  type RecommendationDto,
} from '@inovaapss/shared';

import { GLOBALSYS_V1_METRICS } from '../../db/seed/presets/globalsys-v1.js';

import type {
  ClientHealthRepository,
  ClientRecord,
  ClientSnapshot,
  MetricSnapshot,
} from './repository.js';

const TREND_WINDOW = 3;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Erro de cliente inexistente na organização — vira 404 na rota. */
export class ClientNotFoundError extends Error {
  constructor(readonly clientId: string) {
    super('Cliente não encontrado nesta organização.');
    this.name = 'ClientNotFoundError';
  }
}

function label(periodEnd: string): string {
  const [year, month] = periodEnd.split('-');
  return `${MESES[Number(month) - 1] ?? month}/${(year ?? '').slice(2)}`;
}

function minOfClass(healthClass: HealthClass): number {
  return DEFAULT_HEALTH_BANDS.find((b) => b.class === healthClass)?.min ?? 0;
}

const THRESHOLDS = {
  attention: minOfClass('NORMAL'),
  risk: minOfClass('ATTENTION'),
  critical: minOfClass('RISK'),
};

/** Cada métrica do preset cai numa das abas de §40. */
const DIMENSION_BY_SLUG: Record<string, ClientHealthDimension> = {
  critical_tickets: 'support',
  open_tickets: 'support',
  reopened_tickets: 'support',
  formal_complaints: 'support',
  resolution_vs_sla: 'sla',
  sla_compliance: 'sla',
  platform_usage: 'usage',
  nps_dissatisfaction: 'nps',
  payment_delay: 'financial',
  missed_meetings: 'meetings',
};

const PLAYBOOK_BY_SLUG = new Map(GLOBALSYS_V1_METRICS.map((m) => [m.slug as string, m.playbook]));
const WEIGHT_BY_SLUG = new Map(GLOBALSYS_V1_METRICS.map((m) => [m.slug as string, m.weight]));

interface EngineDriver {
  metricId?: string;
  metricName?: string;
  currentValue?: number | null;
  baselineValue?: number | null;
  delta?: number | null;
  trend?: 'up' | 'down' | 'stable' | null;
  healthScore?: number | null;
  weight?: number;
  contribution?: number;
  humanExplanation?: string;
  isNegative?: boolean;
}

function readDrivers(json: unknown): EngineDriver[] {
  if (json === null || typeof json !== 'object') return [];
  const evidence = (json as { evidence?: unknown }).evidence;
  return Array.isArray(evidence) ? (evidence as EngineDriver[]) : [];
}

function readExplanation(json: unknown): {
  summary: string;
  components: string[];
  notes: string[];
} {
  const fallback = { summary: '', components: [] as string[], notes: [] as string[] };
  if (json === null || typeof json !== 'object') return fallback;
  const exp = (json as { explanation?: unknown }).explanation;
  if (exp === null || typeof exp !== 'object') return fallback;
  const e = exp as { summary?: unknown; components?: unknown; notes?: unknown };
  return {
    summary: typeof e.summary === 'string' ? e.summary : '',
    components: Array.isArray(e.components) ? (e.components as string[]) : [],
    notes: Array.isArray(e.notes) ? (e.notes as string[]) : [],
  };
}

function readCurrentValue(json: unknown): { current: number | null; previous: number | null } {
  if (json === null || typeof json !== 'object') return { current: null, previous: null };
  const o = json as { currentValue?: unknown; previousValue?: unknown };
  return {
    current: typeof o.currentValue === 'number' ? o.currentValue : null,
    previous: typeof o.previousValue === 'number' ? o.previousValue : null,
  };
}

function trendOf(history: (number | null)[]): HealthTrend {
  const finite = history.filter((v): v is number => typeof v === 'number');
  if (finite.length < 2) return 'unknown';
  const delta = (finite[finite.length - 1] as number) - (finite[finite.length - 2] as number);
  if (Math.abs(delta) < 1) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

export interface ClientHealthService {
  overview(organizationId: string, clientId: string): Promise<ClientHealthOverview>;
  scores(organizationId: string, clientId: string): Promise<ClientScoresResponse>;
  evidence(organizationId: string, clientId: string): Promise<ClientEvidenceResponse>;
  recommendations(organizationId: string, clientId: string): Promise<ClientRecommendationsResponse>;
  history(organizationId: string, clientId: string): Promise<ClientHistoryResponse>;
}

export function createClientHealthService(repository: ClientHealthRepository): ClientHealthService {
  async function load(
    organizationId: string,
    clientId: string,
  ): Promise<{ client: ClientRecord; snapshots: ClientSnapshot[] }> {
    const client = await repository.findClient(organizationId, clientId);
    if (!client) throw new ClientNotFoundError(clientId);
    const snapshots = await repository.listClientSnapshots(organizationId, clientId);
    return { client, snapshots };
  }

  /** Último snapshot de cada métrica, já com o valor bruto e a série. */
  async function metricsOf(
    organizationId: string,
    clientId: string,
  ): Promise<{ items: MetricScoreDto[]; periodEnd: string }> {
    const [snapshots, values] = await Promise.all([
      repository.listMetricSnapshots(organizationId, clientId),
      repository.listMetricValues(organizationId, clientId),
    ]);

    const valuesByMetric = new Map<
      string,
      { periodEnd: string; value: number | null; answered: string | null }[]
    >();
    for (const row of values) {
      const list = valuesByMetric.get(row.metricDefinitionId) ?? [];
      list.push({ periodEnd: row.periodEnd, value: row.value, answered: row.answered });
      valuesByMetric.set(row.metricDefinitionId, list);
    }

    const byMetric = new Map<string, MetricSnapshot[]>();
    for (const snapshot of snapshots) {
      const list = byMetric.get(snapshot.metricDefinitionId) ?? [];
      list.push(snapshot);
      byMetric.set(snapshot.metricDefinitionId, list);
    }

    let periodEnd = '';
    const items: MetricScoreDto[] = [];
    const disponiveis: { id: string; weight: number }[] = [];

    for (const [metricId, history] of byMetric) {
      const latest = history[history.length - 1];
      if (!latest) continue;
      if (latest.periodEnd > periodEnd) periodEnd = latest.periodEnd;
      const weight = WEIGHT_BY_SLUG.get(latest.slug) ?? 0;
      if (latest.metricHealth !== null) disponiveis.push({ id: metricId, weight });
    }
    const somaPesos = disponiveis.reduce((t, m) => t + m.weight, 0) || 1;

    for (const [metricId, history] of byMetric) {
      const latest = history[history.length - 1];
      if (!latest) continue;
      const weight = WEIGHT_BY_SLUG.get(latest.slug) ?? 0;
      const normalizedWeight =
        latest.metricHealth === null ? 0 : Number((weight / somaPesos).toFixed(4));
      const { current, previous } = readCurrentValue(latest.explanationJson);
      const serie = valuesByMetric.get(metricId) ?? [];
      const healthByPeriod = new Map(history.map((h) => [h.periodEnd, h.currentHealth]));

      items.push({
        metricId,
        metricKey: latest.slug,
        metricName: latest.name,
        dimension: DIMENSION_BY_SLUG[latest.slug] ?? 'support',
        type: latest.metricType as MetricScoreDto['type'],
        unit: latest.unit,
        direction: latest.direction as MetricScoreDto['direction'],
        weight,
        normalizedWeight,
        metricHealth: latest.metricHealth,
        currentHealth: latest.currentHealth,
        trendHealth: latest.trendHealth,
        persistenceHealth: latest.persistenceHealth,
        confidence: latest.confidence === null ? 0 : Math.round(latest.confidence * 100),
        healthClass: latest.metricHealth === null ? null : classifyHealth(latest.metricHealth),
        contribution:
          latest.metricHealth === null
            ? 0
            : Number((normalizedWeight * (100 - latest.metricHealth)).toFixed(2)),
        currentValue: current,
        previousValue: previous,
        baselineValue: null,
        delta:
          current !== null && previous !== null ? Number((current - previous).toFixed(2)) : null,
        trend:
          current === null || previous === null
            ? null
            : Math.abs(current - previous) < 0.01
              ? 'stable'
              : current > previous
                ? 'up'
                : 'down',
        periodEnd: latest.periodEnd,
        naReason:
          latest.metricHealth === null
            ? latest.slug === 'nps_dissatisfaction'
              ? 'o cliente não respondeu a pesquisa'
              : latest.slug === 'missed_meetings'
                ? 'não havia reunião prevista no período'
                : 'sem dado no período'
            : null,
        explanation: readExplanation(latest.explanationJson),
        series: serie.slice(-12).map((p) => ({
          periodEnd: p.periodEnd,
          label: label(p.periodEnd),
          value: p.value,
          health: healthByPeriod.get(p.periodEnd) ?? null,
          baseline: null,
          portfolioValue: null,
          naReason: p.answered === 'false' ? 'não respondeu' : null,
          ...(p.answered === null ? {} : { extra: { answered: p.answered === 'true' } }),
        })),
      });
    }

    items.sort((a, b) => b.contribution - a.contribution);
    return { items, periodEnd };
  }

  return {
    async overview(organizationId, clientId) {
      const { client, snapshots } = await load(organizationId, clientId);
      const latest = snapshots[snapshots.length - 1] ?? null;
      const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
      const healthHistoryValues = snapshots.map((s) => s.overallHealth);

      const projection = latest
        ? projectHealth(healthHistoryValues, latest.analysisConfidence ?? 0, {
            trendWindow: TREND_WINDOW,
          })
        : null;

      const { items } = await metricsOf(organizationId, clientId);
      const drivers = readDrivers(latest?.evidenceJson);

      const mediaCarteira = await repository.portfolioAverages(organizationId);
      const porPeriodo = new Map<string, number[]>();
      for (const row of mediaCarteira) {
        if (row.health === null) continue;
        const lista = porPeriodo.get(row.periodEnd) ?? [];
        lista.push(row.health);
        porPeriodo.set(row.periodEnd, lista);
      }

      const healthHistory: HealthTimePoint[] = snapshots.map((s) => ({
        periodEnd: s.periodEnd,
        label: label(s.periodEnd),
        health: s.overallHealth,
      }));
      const portfolioHistory: HealthTimePoint[] = snapshots.map((s) => {
        const lista = porPeriodo.get(s.periodEnd) ?? [];
        return {
          periodEnd: s.periodEnd,
          label: label(s.periodEnd),
          health:
            lista.length === 0
              ? null
              : Number((lista.reduce((t, v) => t + v, 0) / lista.length).toFixed(2)),
        };
      });

      const mrr = Number(client.monthlyValue ?? 0);

      return {
        client: {
          id: client.id,
          name: client.name,
          externalCode: client.externalCode,
          segment: client.segment,
          size: client.size,
          status:
            client.status === 'active'
              ? 'Ativo'
              : client.status === 'cancelled'
                ? 'Cancelado'
                : client.status,
          cancelledAt: client.status === 'cancelled' ? client.endDate : null,
          strategicImportance: Math.round(((client.strategicImportance - 1) / 4) * 100),
        },
        plan:
          client.planId && client.planName ? { id: client.planId, name: client.planName } : null,
        contract: client.contractId
          ? {
              id: client.contractId,
              code: client.externalCode
                ? `CT-${client.externalCode}`
                : client.contractId.slice(0, 8),
              startDate: client.startDate ?? '',
              endDate: client.endDate,
              status: client.contractStatus === 'active' ? 'Vigente' : 'Encerrado',
              monthlyValue: mrr,
              currency: client.currency ?? 'BRL',
              contractedSlaHours: client.contractedSlaHours,
            }
          : null,
        mrr,
        currency: client.currency ?? 'BRL',
        score: latest
          ? {
              periodEnd: latest.periodEnd,
              modelVersion: 'GlobalSys v1',
              overallHealth: latest.overallHealth,
              healthClass: latest.healthClass as HealthClass | null,
              previousHealth: previous?.overallHealth ?? null,
              trend: trendOf(healthHistoryValues),
              riskScore: latest.riskScore,
              analysisConfidence: latest.analysisConfidence ?? 0,
              commercialImpactScore: latest.commercialImpactScore,
              priorityScore: latest.priorityScore,
              priorityClass: latest.priorityClass as ClientHealthOverview['score'] extends null
                ? never
                : NonNullable<ClientHealthOverview['score']>['priorityClass'],
              priorityFloor: latest.priorityFloor,
              healthProjected: projection?.projected ?? null,
              projectedClass:
                projection?.projected === null || projection?.projected === undefined
                  ? null
                  : classifyHealth(projection.projected),
              projectionConfidence: projection?.confidence ?? 'low',
              metricsAvailable: items.filter((i) => i.metricHealth !== null).length,
              metricsTotal: items.length,
            }
          : null,
        thresholds: THRESHOLDS,
        periodLabel: 'mês',
        topDrivers: drivers.slice(0, 4).map((d, index) => toEvidence(d, index, items)),
        healthHistory,
        portfolioHistory,
        generatedAt: latest?.periodEnd ?? '',
      };
    },

    async scores(organizationId, clientId) {
      await load(organizationId, clientId);
      const { items, periodEnd } = await metricsOf(organizationId, clientId);
      return { clientId, periodEnd, modelVersion: 'GlobalSys v1', items };
    },

    async evidence(organizationId, clientId) {
      const { snapshots } = await load(organizationId, clientId);
      const latest = snapshots[snapshots.length - 1];
      const { items } = await metricsOf(organizationId, clientId);
      const drivers = readDrivers(latest?.evidenceJson);
      return {
        clientId,
        periodEnd: latest?.periodEnd ?? '',
        items: drivers.map((d, index) => toEvidence(d, index, items)),
      };
    },

    async recommendations(organizationId, clientId) {
      const { snapshots } = await load(organizationId, clientId);
      const latest = snapshots[snapshots.length - 1];
      const { items } = await metricsOf(organizationId, clientId);
      const drivers = readDrivers(latest?.evidenceJson);

      // O que fazer vem do playbook da métrica (§30), na ordem do estrago que ela está causando.
      const recomendacoes: RecommendationDto[] = [];
      for (const [index, driver] of drivers.entries()) {
        const metric = items.find((i) => i.metricId === driver.metricId);
        if (!metric || driver.isNegative === false) continue;
        const playbook = metric.metricKey ? PLAYBOOK_BY_SLUG.get(metric.metricKey) : undefined;
        if (!playbook) continue;
        recomendacoes.push({
          id: `${clientId}:${metric.metricId}`,
          recommendationId: metric.metricId,
          metricId: metric.metricId,
          metricName: metric.metricName,
          dimension: metric.dimension,
          triggerType: 'METRIC_HEALTH',
          title: playbook,
          description: playbook,
          priority: index + 1,
          status: 'PENDING',
          evidence: driver.humanExplanation ?? null,
          alertId: null,
          createdAt: latest?.periodEnd ?? '',
          completedAt: null,
        });
      }
      return { clientId, items: recomendacoes.slice(0, 6) };
    },

    async history(organizationId, clientId) {
      const { snapshots } = await load(organizationId, clientId);
      const mediaCarteira = await repository.portfolioAverages(organizationId);
      const porPeriodo = new Map<string, number[]>();
      for (const row of mediaCarteira) {
        if (row.health === null) continue;
        const lista = porPeriodo.get(row.periodEnd) ?? [];
        lista.push(row.health);
        porPeriodo.set(row.periodEnd, lista);
      }

      const events: TimelineEventDto[] = [];
      let anterior: HealthClass | null = null;
      for (const snapshot of snapshots) {
        const classe = snapshot.healthClass as HealthClass | null;
        if (classe && classe !== anterior) {
          const piorou =
            anterior !== null &&
            DEFAULT_HEALTH_BANDS.findIndex((b) => b.class === classe) <
              DEFAULT_HEALTH_BANDS.findIndex((b) => b.class === anterior);
          events.push({
            id: `${clientId}:${snapshot.periodEnd}`,
            type: 'CLASS_CHANGE',
            severity: classe === 'CRITICAL' ? 'CRITICAL' : piorou ? 'WARNING' : 'INFO',
            occurredAt: snapshot.periodEnd,
            periodEnd: snapshot.periodEnd,
            title:
              anterior === null
                ? `Primeira classificação: ${classe}`
                : `${piorou ? 'Piorou' : 'Melhorou'} de ${anterior} para ${classe}`,
            description: `Saúde ${snapshot.overallHealth ?? '—'} em ${label(snapshot.periodEnd)}.`,
            healthAt: snapshot.overallHealth,
            fromClass: anterior,
            toClass: classe,
            metricId: null,
            metricName: null,
          });
          anterior = classe;
        }
      }

      return {
        clientId,
        health: snapshots.map((s) => ({
          periodEnd: s.periodEnd,
          label: label(s.periodEnd),
          health: s.overallHealth,
        })),
        portfolio: snapshots.map((s) => {
          const lista = porPeriodo.get(s.periodEnd) ?? [];
          return {
            periodEnd: s.periodEnd,
            label: label(s.periodEnd),
            health:
              lista.length === 0
                ? null
                : Number((lista.reduce((t, v) => t + v, 0) / lista.length).toFixed(2)),
          };
        }),
        thresholds: THRESHOLDS,
        events: events.reverse(),
      };
    },
  };
}

function toEvidence(driver: EngineDriver, index: number, items: MetricScoreDto[]): EvidenceDto {
  const metric = items.find((i) => i.metricId === driver.metricId);
  return {
    metricId: driver.metricId ?? '',
    metricName: driver.metricName ?? metric?.metricName ?? '',
    currentValue: driver.currentValue ?? null,
    baselineValue: driver.baselineValue ?? null,
    delta: driver.delta ?? null,
    trend: driver.trend ?? null,
    healthScore: driver.healthScore ?? null,
    weight: driver.weight ?? 0,
    contribution: driver.contribution ?? 0,
    humanExplanation: driver.humanExplanation ?? '',
    isNegative: driver.isNegative ?? true,
    metricKey: metric?.metricKey ?? null,
    dimension: metric?.dimension ?? 'support',
    unit: metric?.unit ?? null,
    rank: index + 1,
  };
}
