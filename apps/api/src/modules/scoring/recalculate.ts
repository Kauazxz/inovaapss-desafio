/**
 * Recálculo da carteira (§34 de docs/DEFINICOES_METRICAS.md; SPEC §24–§29, §62).
 *
 * Fluxo: valores brutos (metric_values) + versão ativa do modelo → @inovaapss/engine →
 * snapshots por métrica e por cliente. O dashboard e a tela do cliente leem os snapshots;
 * ninguém recalcula a carteira inteira a cada requisição.
 *
 * Detalhes que vêm do documento de métricas:
 *   §8  — a meta da métrica "tempo de resolução × SLA" é o SLA contratado de CADA cliente,
 *         não um número global; por isso o alvo é substituído por contrato.
 *   §19 — a confiança é calculada e guardada separada da saúde.
 *   §20 — o impacto comercial usa o valor mensal do contrato, comparado ao maior da carteira.
 *   §32 — todo snapshot guarda a versão do modelo que o gerou.
 */
import { and, asc, eq } from 'drizzle-orm';

import { scoreClient } from '@inovaapss/engine';
import type { ClientScoreResult, MetricConfig, MetricInput, PeriodValue } from '@inovaapss/engine';

import {
  clientScoreSnapshots,
  contracts,
  metricDefinitions,
  metricModelItems,
  metricModelVersions,
  metricModels,
  metricScoreSnapshots,
  metricValues,
  portfolioClients,
} from '../../db/schema/index.js';

type Db = {
  select: (...args: never[]) => never;
} & Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

export interface RecalculateOptions {
  organizationId: string;
  /** Quantos períodos finais de cada cliente recalcular (padrão 6, para a linha do tempo). */
  periods?: number;
}

export interface RecalculateResult {
  organizationId: string;
  modelVersionId: string;
  clients: number;
  clientSnapshots: number;
  metricSnapshots: number;
  withoutData: number;
  distribution: Record<string, number>;
}

const DEFAULT_PERIODS = 6;
const CHUNK = 500;

/** Converte a linha do item do modelo na configuração que o motor espera. */
function toMetricConfig(row: {
  definitionId: string;
  slug: string;
  name: string;
  unit: string | null;
  direction: string;
  weight: number;
  currentWeight: number;
  trendWeight: number;
  persistenceWeight: number;
  normalizationConfig: unknown;
  triggers: unknown;
}): MetricConfig {
  return {
    id: row.definitionId,
    key: row.slug,
    name: row.name,
    ...(row.unit === null ? {} : { unit: row.unit }),
    direction: row.direction as MetricConfig['direction'],
    weight: row.weight,
    componentWeights: {
      current: row.currentWeight,
      trend: row.trendWeight,
      persistence: row.persistenceWeight,
    },
    normalization: row.normalizationConfig as MetricConfig['normalization'],
    triggers: Array.isArray(row.triggers)
      ? (row.triggers as NonNullable<MetricConfig['triggers']>)
      : [],
  };
}

/**
 * §8 — substitui a meta da métrica de tempo de resolução pelo SLA contratado do cliente.
 * Sem contrato com SLA, mantém a meta padrão do preset.
 */
function withClientSlaTarget(config: MetricConfig, slaHours: number | null): MetricConfig {
  if (config.key !== 'resolution_vs_sla' || slaHours === null || slaHours <= 0) return config;
  const normalization = config.normalization as { strategy?: string } & Record<string, unknown>;
  if (normalization.strategy !== 'RATIO_TO_TARGET') return config;
  return {
    ...config,
    normalization: { ...normalization, target: slaHours } as MetricConfig['normalization'],
  };
}

export async function recalculateOrganization(
  db: Database,
  options: RecalculateOptions,
): Promise<RecalculateResult> {
  const { organizationId } = options;
  const periodsToScore = options.periods ?? DEFAULT_PERIODS;

  // ------------------------------------------------------------ versão ativa
  const [version] = await db
    .select({ id: metricModelVersions.id })
    .from(metricModelVersions)
    .innerJoin(metricModels, eq(metricModels.id, metricModelVersions.metricModelId))
    .where(
      and(
        eq(metricModelVersions.organizationId, organizationId),
        eq(metricModelVersions.status, 'active'),
      ),
    )
    .limit(1);
  if (!version) {
    throw new Error(
      'Nenhuma versão de modelo ativa nesta organização. Rode seed:globalsys ou ative uma versão.',
    );
  }

  const itemRows = await db
    .select({
      definitionId: metricDefinitions.id,
      slug: metricDefinitions.slug,
      name: metricDefinitions.name,
      unit: metricDefinitions.unit,
      direction: metricDefinitions.direction,
      isActive: metricDefinitions.isActive,
      weight: metricModelItems.weight,
      currentWeight: metricModelItems.currentWeight,
      trendWeight: metricModelItems.trendWeight,
      persistenceWeight: metricModelItems.persistenceWeight,
      normalizationConfig: metricModelItems.normalizationConfigJson,
      triggers: metricModelItems.criticalTriggerConfigJson,
    })
    .from(metricModelItems)
    .innerJoin(metricDefinitions, eq(metricDefinitions.id, metricModelItems.metricDefinitionId))
    .where(eq(metricModelItems.metricModelVersionId, version.id));

  const configs = itemRows
    .filter((row: { isActive: boolean }) => row.isActive)
    .map((row: Parameters<typeof toMetricConfig>[0]) => toMetricConfig(row));
  if (configs.length === 0) throw new Error('A versão ativa não tem métricas.');

  // ------------------------------------------------------------ clientes
  const clientRows = await db
    .select({
      id: portfolioClients.id,
      name: portfolioClients.name,
      externalCode: portfolioClients.externalCode,
      strategicImportance: portfolioClients.strategicImportance,
      monthlyValue: contracts.monthlyValue,
      contractedSlaHours: contracts.contractedSlaHours,
    })
    .from(portfolioClients)
    .leftJoin(contracts, eq(contracts.portfolioClientId, portfolioClients.id))
    .where(eq(portfolioClients.organizationId, organizationId));

  const mrrOf = (row: { monthlyValue: string | null }): number => Number(row.monthlyValue ?? 0);
  const referenceMonthlyValue = clientRows.reduce(
    (max: number, row: { monthlyValue: string | null }) => Math.max(max, mrrOf(row)),
    0,
  );

  // ------------------------------------------------------------ valores
  const valueRows = await db
    .select({
      portfolioClientId: metricValues.portfolioClientId,
      metricDefinitionId: metricValues.metricDefinitionId,
      periodEnd: metricValues.periodEnd,
      value: metricValues.rawValueNumeric,
      text: metricValues.rawValueText,
      answered: metricValues.answered,
    })
    .from(metricValues)
    .where(eq(metricValues.organizationId, organizationId))
    .orderBy(asc(metricValues.periodEnd));

  const seriesByClient = new Map<string, Map<string, PeriodValue[]>>();
  for (const row of valueRows) {
    let byMetric = seriesByClient.get(row.portfolioClientId);
    if (!byMetric) {
      byMetric = new Map();
      seriesByClient.set(row.portfolioClientId, byMetric);
    }
    const list = byMetric.get(row.metricDefinitionId) ?? [];
    const point: PeriodValue = { periodEnd: row.periodEnd, value: row.value ?? null };
    if (row.text !== null) point.text = row.text;
    // A coluna guarda 'true'/'false' só nas métricas que dependem de resposta (§16).
    if (row.answered !== null) point.answered = row.answered === 'true';
    list.push(point);
    byMetric.set(row.metricDefinitionId, list);
  }

  // ------------------------------------------------------------ cálculo
  type ClientSnapshot = typeof clientScoreSnapshots.$inferInsert;
  type MetricSnapshot = typeof metricScoreSnapshots.$inferInsert;
  const clientSnapshots: ClientSnapshot[] = [];
  const metricSnapshots: MetricSnapshot[] = [];
  const distribution: Record<string, number> = {};
  let withoutData = 0;

  for (const client of clientRows) {
    const byMetric = seriesByClient.get(client.id);
    if (!byMetric || byMetric.size === 0) {
      withoutData += 1;
      continue;
    }

    // Períodos do cliente, do mais antigo ao mais recente.
    const allPeriods = [
      ...new Set([...byMetric.values()].flatMap((list) => list.map((p) => p.periodEnd))),
    ].sort();
    const targets = allPeriods.slice(-periodsToScore);

    for (const periodEnd of targets) {
      // §27 (sem vazamento): cada período enxerga só o que existia até ele.
      const metrics: MetricInput[] = configs.map((config: MetricConfig) => {
        const withTarget = withClientSlaTarget(config, client.contractedSlaHours ?? null);
        const full = byMetric.get(config.id) ?? [];
        return { metric: withTarget, series: full.filter((p) => p.periodEnd <= periodEnd) };
      });

      const result: ClientScoreResult = scoreClient({
        clientId: client.id,
        metrics,
        commercialImpact: {
          monthlyValue: mrrOf(client),
          referenceMonthlyValue: referenceMonthlyValue || null,
          // 1–5 na base → 0–100 para o motor.
          strategicImportance: ((client.strategicImportance - 1) / 4) * 100,
        },
      });

      const isLatest = periodEnd === targets[targets.length - 1];
      if (isLatest && result.healthClass) {
        distribution[result.healthClass] = (distribution[result.healthClass] ?? 0) + 1;
      }

      clientSnapshots.push({
        organizationId,
        portfolioClientId: client.id,
        metricModelVersionId: version.id,
        periodEnd,
        overallHealth: result.overallHealth,
        riskScore: result.riskScore,
        analysisConfidence: result.analysisConfidence,
        commercialImpactScore: result.commercialImpactScore,
        priorityScore: result.priorityScore,
        priorityFloor: result.priorityFloor,
        healthClass: result.healthClass,
        priorityClass: result.priorityClass,
        evidenceJson: {
          evidence: result.evidence,
          triggers: result.triggers,
        } as unknown as Record<string, unknown>,
      });

      for (const metric of result.metrics) {
        metricSnapshots.push({
          organizationId,
          portfolioClientId: client.id,
          metricDefinitionId: metric.metricId,
          metricModelVersionId: version.id,
          periodEnd,
          currentHealth: metric.currentHealth,
          trendHealth: metric.trendHealth,
          persistenceHealth: metric.persistenceHealth,
          metricHealth: metric.metricHealth,
          confidence: Number((metric.confidence / 100).toFixed(3)),
          explanationJson: {
            explanation: metric.explanation,
            currentValue: metric.currentValue,
            previousValue: metric.previousValue,
            weight: metric.weight,
            response: metric.response,
          } as unknown as Record<string, unknown>,
        });
      }
    }
  }

  // ------------------------------------------------------------ persistência
  await db
    .delete(clientScoreSnapshots)
    .where(eq(clientScoreSnapshots.organizationId, organizationId));
  await db
    .delete(metricScoreSnapshots)
    .where(eq(metricScoreSnapshots.organizationId, organizationId));

  for (let i = 0; i < clientSnapshots.length; i += CHUNK) {
    await db.insert(clientScoreSnapshots).values(clientSnapshots.slice(i, i + CHUNK));
  }
  for (let i = 0; i < metricSnapshots.length; i += CHUNK) {
    await db.insert(metricScoreSnapshots).values(metricSnapshots.slice(i, i + CHUNK));
  }

  return {
    organizationId,
    modelVersionId: version.id,
    clients: clientRows.length,
    clientSnapshots: clientSnapshots.length,
    metricSnapshots: metricSnapshots.length,
    withoutData,
    distribution,
  };
}

export type { Db };
