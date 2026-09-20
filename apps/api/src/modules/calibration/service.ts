/**
 * Calibração (§26, §27, §33, §59): roda o backtest sobre o histórico, guarda o resultado e
 * transforma os pesos aceitos num RASCUNHO de versão.
 *
 * Três regras que este arquivo existe para cumprir:
 * 1. a versão ativa nunca é tocada — aceitar sugestão cria rascunho, e rascunho não vale nada até
 *    alguém ativar (§32);
 * 2. o cancelamento é alvo de validação, jamais entrada do score (§27) — quem garante isso é o
 *    motor, e aqui só entregamos a ele fotos já carimbadas com a versão que as gerou;
 * 3. toda execução guarda os parâmetros usados, para o número poder ser refeito depois.
 */
import {
  normalizeWeights,
  runCalibration,
  type CalibrationResult,
  type CalibrationWeight,
} from '@inovaapss/engine';
import {
  CALIBRATION_WINDOW_DAYS,
  type ApplyCalibrationSuggestionsResponse,
  type CalibrationRunDto,
  type CalibrationRunStatus,
  type CalibrationRunSummaryDto,
  type CalibrationResultsDto,
  type CreateCalibrationRunBody,
} from '@inovaapss/shared';

import type { CalibrationRepository, CalibrationRunRecord } from './repository.js';
import type { MetricsRepository } from '../metrics/repository.js';
import type { MetricModelItemWrite } from '../metrics/types.js';

export interface TenantContext {
  organizationId: string;
  userId?: string | null;
}

/** Erro de regra de negócio com código e status HTTP — as rotas só repassam. */
export class CalibrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'CalibrationError';
  }
}

export interface CalibrationService {
  listVersions(tenant: TenantContext): Promise<
    {
      metricModelVersionId: string;
      metricModelName: string;
      version: number;
      status: string;
      snapshotCount: number;
    }[]
  >;
  createRun(tenant: TenantContext, body: CreateCalibrationRunBody): Promise<CalibrationRunDto>;
  listRuns(tenant: TenantContext): Promise<CalibrationRunSummaryDto[]>;
  getRun(tenant: TenantContext, runId: string): Promise<CalibrationRunDto>;
  applySuggestions(
    tenant: TenantContext,
    runId: string,
    acceptedMetricIds: readonly string[],
  ): Promise<ApplyCalibrationSuggestionsResponse>;
}

function readResults(record: CalibrationRunRecord): CalibrationResultsDto | null {
  const raw = record.resultsJson;
  return raw !== null && typeof raw === 'object' ? (raw as CalibrationResultsDto) : null;
}

function toSummary(record: CalibrationRunRecord): CalibrationRunSummaryDto {
  const results = readResults(record);
  return {
    id: record.id,
    metricModelVersionId: record.metricModelVersionId,
    metricModelName: record.metricModelName,
    version: record.version,
    windowDays: record.windowDays,
    status: record.status as CalibrationRunStatus,
    churnsAnalyzed: results?.baseline.churnsAnalyzed ?? null,
    churnsCaught: results?.baseline.churnsCaught ?? null,
    precision: results?.baseline.precision ?? null,
    churnDetectionRate: results?.baseline.churnDetectionRate ?? null,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt === null ? null : record.finishedAt.toISOString(),
  };
}

function toDto(record: CalibrationRunRecord): CalibrationRunDto {
  const results = readResults(record);
  return { ...toSummary(record), parameters: results?.parameters ?? null, results };
}

/** Converte o resultado do motor no formato guardado em `results_json` (sem as linhas cruas). */
function toResultsDto(
  result: CalibrationResult,
  model: CalibrationResultsDto['model'],
): CalibrationResultsDto {
  const backtest = (source: CalibrationResult['baseline']) => ({
    windowDays: source.windowDays,
    periodDays: source.periodDays,
    windowPeriods: source.windowPeriods,
    alertRiskThreshold: source.alertRiskThreshold,
    periodsAnalyzed: source.periodsAnalyzed,
    pairsAnalyzed: source.pairsAnalyzed,
    clientsAnalyzed: source.clientsAnalyzed,
    churnsAnalyzed: source.churnsAnalyzed,
    churnsCaught: source.churnsCaught,
    truePositives: source.truePositives,
    falsePositives: source.falsePositives,
    trueNegatives: source.trueNegatives,
    falseNegatives: source.falseNegatives,
    precision: source.precision,
    recall: source.recall,
    churnDetectionRate: source.churnDetectionRate,
    falsePositiveRate: source.falsePositiveRate,
    f1: source.f1,
    leadTime: { ...source.leadTime },
    topN: source.topN.map((item) => ({ ...item })),
    churnOutcomes: source.churnOutcomes.map((item) => ({ ...item })),
  });

  return {
    parameters: { ...result.parameters, topN: [...result.parameters.topN] },
    baseline: backtest(result.baseline),
    proposed: backtest(result.proposed),
    suggestions: result.suggestions.map((item) => ({ ...item })),
    model,
  };
}

export interface CalibrationServiceDeps {
  repository: CalibrationRepository;
  /** Reaproveitado para criar o rascunho: quem manda em versão é o módulo de métricas. */
  metrics: MetricsRepository;
}

export function createCalibrationService({
  repository,
  metrics,
}: CalibrationServiceDeps): CalibrationService {
  return {
    async listVersions(tenant) {
      const versions = await repository.listCalibratableVersions(tenant.organizationId);
      return versions.map((version) => ({
        metricModelVersionId: version.metricModelVersionId,
        metricModelName: version.metricModelName,
        version: version.version,
        status: version.status,
        snapshotCount: version.snapshotCount,
      }));
    },

    async createRun(tenant, body) {
      const windowDays = CALIBRATION_WINDOW_DAYS.includes(
        body.windowDays as (typeof CALIBRATION_WINDOW_DAYS)[number],
      )
        ? (body.windowDays as number)
        : 90;

      const version = await repository.findVersion(
        tenant.organizationId,
        body.metricModelVersionId,
      );
      if (version === null) {
        throw new CalibrationError(
          'MODEL_VERSION_NOT_FOUND',
          'Não encontrei uma versão de modelo para calibrar.',
          404,
        );
      }
      if (version.weights.length === 0) {
        throw new CalibrationError(
          'MODEL_VERSION_WITHOUT_METRICS',
          'Esta versão do modelo não tem métrica alguma configurada.',
        );
      }

      const parameters = {
        windowDays,
        metricModelVersionId: version.metricModelVersionId,
        alertRiskThreshold: body.alertRiskThreshold,
        suggestionStrength: body.suggestionStrength,
      };
      const run = await repository.createRun({
        organizationId: tenant.organizationId,
        metricModelVersionId: version.metricModelVersionId,
        windowDays,
        parameters,
        createdBy: tenant.userId ?? null,
      });

      try {
        const clients = await repository.loadClientSeries(
          tenant.organizationId,
          version.metricModelVersionId,
        );
        if (clients.length === 0) {
          throw new CalibrationError(
            'NO_HISTORY',
            'Ainda não há histórico calculado para esta versão. Importe dados e recalcule antes de calibrar.',
          );
        }

        const weights: CalibrationWeight[] = version.weights.map((weight) => ({
          metricId: weight.metricId,
          metricName: weight.metricName,
          weight: weight.weight,
        }));
        const result = runCalibration({
          clients,
          weights,
          options: {
            windowDays,
            alertRiskThreshold: body.alertRiskThreshold,
            suggestionStrength: body.suggestionStrength,
          },
        });
        const finished = await repository.finishRun(
          tenant.organizationId,
          run.id,
          toResultsDto(result, {
            metricModelId: version.metricModelId,
            metricModelName: version.metricModelName,
            metricModelVersionId: version.metricModelVersionId,
            version: version.version,
            status: version.status,
          }),
        );
        return toDto(finished ?? run);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao calibrar.';
        const failed = await repository.failRun(tenant.organizationId, run.id, message);
        if (error instanceof CalibrationError) throw error;
        return toDto(failed ?? run);
      }
    },

    async listRuns(tenant) {
      const rows = await repository.listRuns(tenant.organizationId);
      return rows.map(toSummary);
    },

    async getRun(tenant, runId) {
      const record = await repository.findRun(tenant.organizationId, runId);
      if (record === null) {
        throw new CalibrationError('RUN_NOT_FOUND', 'Execução de calibração não encontrada.', 404);
      }
      return toDto(record);
    },

    async applySuggestions(tenant, runId, acceptedMetricIds) {
      const record = await repository.findRun(tenant.organizationId, runId);
      if (record === null) {
        throw new CalibrationError('RUN_NOT_FOUND', 'Execução de calibração não encontrada.', 404);
      }
      const results = readResults(record);
      if (record.status !== 'done' || results === null) {
        throw new CalibrationError(
          'RUN_NOT_READY',
          'Esta execução não terminou — não há sugestão para aplicar.',
        );
      }
      const accepted = new Set(acceptedMetricIds);
      if (accepted.size === 0) {
        throw new CalibrationError(
          'NO_SUGGESTION_ACCEPTED',
          'Escolha ao menos uma métrica para criar a nova versão.',
        );
      }

      const source = await metrics.findVersion(
        tenant.organizationId,
        results.model.metricModelId,
        results.model.version,
      );
      if (source === null) {
        throw new CalibrationError(
          'MODEL_VERSION_NOT_FOUND',
          'A versão calibrada não existe mais.',
          404,
        );
      }

      // Aceitas ficam com o peso sugerido cravado; as demais dividem o que sobrou, mantendo a
      // proporção entre elas. Assim a soma fecha 100 % e a versão nasce ativável (§32).
      const suggestionByMetric = new Map(results.suggestions.map((s) => [s.metricId, s]));
      const acceptedTotal = source.items.reduce((total, item) => {
        const suggestion = suggestionByMetric.get(item.metricDefinitionId);
        return accepted.has(item.metricDefinitionId) && suggestion !== undefined
          ? total + suggestion.suggestedWeight
          : total;
      }, 0);
      const keptTotal = source.items.reduce(
        (total, item) => (accepted.has(item.metricDefinitionId) ? total : total + item.weight),
        0,
      );
      const budget = Math.max(0, 1 - acceptedTotal);

      const rawWeights = source.items.map((item) => {
        const suggestion = suggestionByMetric.get(item.metricDefinitionId);
        if (accepted.has(item.metricDefinitionId) && suggestion !== undefined) {
          return suggestion.suggestedWeight;
        }
        if (keptTotal <= 0) return 0;
        return (item.weight / keptTotal) * budget;
      });
      const finalWeights = normalizeWeights(rawWeights);

      const items: MetricModelItemWrite[] = source.items.map((item, index) => ({
        metricDefinitionId: item.metricDefinitionId,
        weight: finalWeights[index] ?? item.weight,
        currentWeight: item.currentWeight,
        trendWeight: item.trendWeight,
        persistenceWeight: item.persistenceWeight,
        normalizationConfig:
          item.normalizationConfig as MetricModelItemWrite['normalizationConfig'],
        thresholdConfig: item.thresholdConfig as MetricModelItemWrite['thresholdConfig'],
        criticalTriggerConfig:
          item.criticalTriggerConfig as MetricModelItemWrite['criticalTriggerConfig'],
        formulaConfig: item.formulaConfig as MetricModelItemWrite['formulaConfig'],
        sortOrder: item.sortOrder,
      }));

      const latest = await metrics.findLatestVersionNumber(
        tenant.organizationId,
        results.model.metricModelId,
      );
      const draft = await metrics.createVersion(tenant.organizationId, {
        metricModelId: results.model.metricModelId,
        version: latest + 1,
        status: 'draft',
        effectiveFrom: null,
        items,
      });

      const nameByMetric = new Map(results.suggestions.map((s) => [s.metricId, s.metricName]));
      return {
        metricModelId: results.model.metricModelId,
        metricModelVersionId: draft.id,
        version: draft.version,
        status: draft.status,
        weights: source.items.map((item, index) => ({
          metricId: item.metricDefinitionId,
          metricName: nameByMetric.get(item.metricDefinitionId) ?? item.metricDefinitionId,
          weight: finalWeights[index] ?? item.weight,
        })),
        message:
          `Rascunho v${draft.version} criado. Nada muda na carteira enquanto ninguém ativar esta versão — ` +
          'os scores continuam saindo da versão em vigor.',
      };
    },
  };
}
