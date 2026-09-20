/**
 * Leitura do histórico para a calibração (§26, §59) e persistência das execuções.
 *
 * Nada aqui recalcula score: as fotos já existem (metric_score_snapshots e client_score_snapshots),
 * cada uma carimbada com a versão do modelo que a gerou. A calibração só as lê de volta, junta a
 * data de saída de quem cancelou — que entra apenas como alvo de validação — e devolve séries
 * prontas para o motor.
 */
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { CalibrationClientSeries } from '@inovaapss/engine';

import {
  calibrationRuns,
  clientScoreSnapshots,
  contracts,
  metricDefinitions,
  metricModelItems,
  metricModels,
  metricModelVersions,
  metricScoreSnapshots,
  portfolioClients,
} from '../../db/schema/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

/** Uma versão do modelo com os pesos que ela define e quantas fotos existem para ela. */
export interface CalibratableVersion {
  metricModelId: string;
  metricModelName: string;
  metricModelVersionId: string;
  version: number;
  status: string;
  weights: { metricId: string; metricName: string; weight: number }[];
  /** Fotos de cliente gravadas com esta versão. Zero = não há o que calibrar. */
  snapshotCount: number;
}

export interface CalibrationRunRecord {
  id: string;
  organizationId: string;
  metricModelVersionId: string;
  windowDays: number;
  status: string;
  parametersJson: unknown;
  resultsJson: unknown;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  metricModelName: string | null;
  version: number | null;
}

export interface CalibrationRepository {
  /** Versões com fotos gravadas, da mais nova para a mais antiga. */
  listCalibratableVersions(organizationId: string): Promise<CalibratableVersion[]>;
  /** A versão pedida, ou a ativa do modelo ativo quando `versionId` vem vazio. */
  findVersion(organizationId: string, versionId?: string): Promise<CalibratableVersion | null>;
  /** Série histórica por cliente, com o período de saída de quem cancelou. */
  loadClientSeries(
    organizationId: string,
    metricModelVersionId: string,
  ): Promise<CalibrationClientSeries[]>;
  createRun(input: {
    organizationId: string;
    metricModelVersionId: string;
    windowDays: number;
    parameters: unknown;
    createdBy: string | null;
  }): Promise<CalibrationRunRecord>;
  finishRun(
    organizationId: string,
    runId: string,
    results: unknown,
  ): Promise<CalibrationRunRecord | null>;
  failRun(
    organizationId: string,
    runId: string,
    message: string,
  ): Promise<CalibrationRunRecord | null>;
  listRuns(organizationId: string, limit?: number): Promise<CalibrationRunRecord[]>;
  findRun(organizationId: string, runId: string): Promise<CalibrationRunRecord | null>;
}

function toRunRecord(row: Record<string, unknown>): CalibrationRunRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    metricModelVersionId: row.metricModelVersionId as string,
    windowDays: Number(row.windowDays ?? 0),
    status: row.status as string,
    parametersJson: row.parametersJson ?? null,
    resultsJson: row.resultsJson ?? null,
    errorMessage: (row.errorMessage as string | null) ?? null,
    createdAt: row.createdAt as Date,
    finishedAt: (row.finishedAt as Date | null) ?? null,
    metricModelName: (row.metricModelName as string | null) ?? null,
    version: row.version === null || row.version === undefined ? null : Number(row.version),
  };
}

export function createCalibrationRepository(getDb: () => Database): CalibrationRepository {
  const runColumns = {
    id: calibrationRuns.id,
    organizationId: calibrationRuns.organizationId,
    metricModelVersionId: calibrationRuns.metricModelVersionId,
    windowDays: calibrationRuns.windowDays,
    status: calibrationRuns.status,
    parametersJson: calibrationRuns.parametersJson,
    resultsJson: calibrationRuns.resultsJson,
    errorMessage: calibrationRuns.errorMessage,
    createdAt: calibrationRuns.createdAt,
    finishedAt: calibrationRuns.finishedAt,
    metricModelName: metricModels.name,
    version: metricModelVersions.version,
  };

  async function readRun(organizationId: string, runId: string) {
    const rows = await getDb()
      .select(runColumns)
      .from(calibrationRuns)
      .leftJoin(
        metricModelVersions,
        eq(metricModelVersions.id, calibrationRuns.metricModelVersionId),
      )
      .leftJoin(metricModels, eq(metricModels.id, metricModelVersions.metricModelId))
      .where(and(eq(calibrationRuns.organizationId, organizationId), eq(calibrationRuns.id, runId)))
      .limit(1);
    return rows[0] === undefined ? null : toRunRecord(rows[0]);
  }

  async function loadVersions(
    organizationId: string,
    versionId?: string,
  ): Promise<CalibratableVersion[]> {
    const conditions = [eq(metricModelVersions.organizationId, organizationId)];
    if (versionId !== undefined) conditions.push(eq(metricModelVersions.id, versionId));

    const versionRows = await getDb()
      .select({
        metricModelVersionId: metricModelVersions.id,
        metricModelId: metricModelVersions.metricModelId,
        metricModelName: metricModels.name,
        version: metricModelVersions.version,
        status: metricModelVersions.status,
      })
      .from(metricModelVersions)
      .innerJoin(metricModels, eq(metricModels.id, metricModelVersions.metricModelId))
      .where(and(...conditions))
      .orderBy(desc(metricModelVersions.version));
    if (versionRows.length === 0) return [];

    const ids = versionRows.map(
      (row: { metricModelVersionId: string }) => row.metricModelVersionId,
    );
    const itemRows = await getDb()
      .select({
        metricModelVersionId: metricModelItems.metricModelVersionId,
        metricId: metricModelItems.metricDefinitionId,
        metricName: metricDefinitions.name,
        weight: metricModelItems.weight,
        sortOrder: metricModelItems.sortOrder,
      })
      .from(metricModelItems)
      .innerJoin(metricDefinitions, eq(metricDefinitions.id, metricModelItems.metricDefinitionId))
      .where(inArray(metricModelItems.metricModelVersionId, ids));

    const countRows = await getDb()
      .select({
        metricModelVersionId: clientScoreSnapshots.metricModelVersionId,
        total: sql<number>`count(*)::int`,
      })
      .from(clientScoreSnapshots)
      .where(
        and(
          eq(clientScoreSnapshots.organizationId, organizationId),
          inArray(clientScoreSnapshots.metricModelVersionId, ids),
        ),
      )
      .groupBy(clientScoreSnapshots.metricModelVersionId);

    const countByVersion = new Map(
      countRows.map((row: { metricModelVersionId: string; total: number }) => [
        row.metricModelVersionId,
        Number(row.total ?? 0),
      ]),
    );

    return versionRows.map((row: Record<string, unknown>) => ({
      metricModelId: row.metricModelId as string,
      metricModelName: row.metricModelName as string,
      metricModelVersionId: row.metricModelVersionId as string,
      version: Number(row.version),
      status: row.status as string,
      weights: itemRows
        .filter(
          (item: { metricModelVersionId: string }) =>
            item.metricModelVersionId === row.metricModelVersionId,
        )
        .sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)
        .map((item: { metricId: string; metricName: string; weight: unknown }) => ({
          metricId: item.metricId,
          metricName: item.metricName,
          weight: Number(item.weight ?? 0),
        })),
      snapshotCount: (countByVersion.get(row.metricModelVersionId as string) as number) ?? 0,
    }));
  }

  return {
    async listCalibratableVersions(organizationId) {
      const versions = await loadVersions(organizationId);
      return versions.filter((version) => version.snapshotCount > 0);
    },

    async findVersion(organizationId, versionId) {
      if (versionId !== undefined) {
        const [version] = await loadVersions(organizationId, versionId);
        return version ?? null;
      }
      const versions = await loadVersions(organizationId);
      const ativa = versions.find((version) => version.status === 'active');
      if (ativa !== undefined) return ativa;
      // Sem versão ativa, calibramos a que tem histórico — o passado é o que importa aqui.
      return versions.find((version) => version.snapshotCount > 0) ?? null;
    },

    async loadClientSeries(organizationId, metricModelVersionId) {
      const clientRows = await getDb()
        .select({
          id: portfolioClients.id,
          name: portfolioClients.name,
          status: portfolioClients.status,
        })
        .from(portfolioClients)
        .where(eq(portfolioClients.organizationId, organizationId));

      // Saída = fim do último contrato encerrado. Entra só como alvo de validação (§27).
      const churnRows = await getDb()
        .select({
          portfolioClientId: contracts.portfolioClientId,
          churnPeriodEnd: sql<string>`max(${contracts.endDate})`,
        })
        .from(contracts)
        .where(and(eq(contracts.organizationId, organizationId), isNotNull(contracts.endDate)))
        .groupBy(contracts.portfolioClientId);
      const churnByClient = new Map(
        churnRows.map((row: { portfolioClientId: string; churnPeriodEnd: string | null }) => [
          row.portfolioClientId,
          row.churnPeriodEnd,
        ]),
      );

      const clientSnapshots = await getDb()
        .select({
          portfolioClientId: clientScoreSnapshots.portfolioClientId,
          periodEnd: clientScoreSnapshots.periodEnd,
          overallHealth: clientScoreSnapshots.overallHealth,
          commercialImpactScore: clientScoreSnapshots.commercialImpactScore,
        })
        .from(clientScoreSnapshots)
        .where(
          and(
            eq(clientScoreSnapshots.organizationId, organizationId),
            eq(clientScoreSnapshots.metricModelVersionId, metricModelVersionId),
          ),
        );

      const metricSnapshots = await getDb()
        .select({
          portfolioClientId: metricScoreSnapshots.portfolioClientId,
          metricDefinitionId: metricScoreSnapshots.metricDefinitionId,
          periodEnd: metricScoreSnapshots.periodEnd,
          metricHealth: metricScoreSnapshots.metricHealth,
        })
        .from(metricScoreSnapshots)
        .where(
          and(
            eq(metricScoreSnapshots.organizationId, organizationId),
            eq(metricScoreSnapshots.metricModelVersionId, metricModelVersionId),
          ),
        );

      const healthByPair = new Map<string, Record<string, number | null>>();
      for (const row of metricSnapshots as {
        portfolioClientId: string;
        metricDefinitionId: string;
        periodEnd: string;
        metricHealth: number | null;
      }[]) {
        const key = `${row.portfolioClientId}|${row.periodEnd}`;
        const bucket = healthByPair.get(key) ?? {};
        bucket[row.metricDefinitionId] =
          row.metricHealth === null ? null : Number(row.metricHealth);
        healthByPair.set(key, bucket);
      }

      const periodsByClient = new Map<string, CalibrationClientSeries['periods']>();
      for (const row of clientSnapshots as {
        portfolioClientId: string;
        periodEnd: string;
        overallHealth: number | null;
        commercialImpactScore: number | null;
      }[]) {
        const list = (periodsByClient.get(row.portfolioClientId) ??
          []) as CalibrationClientSeries['periods'];
        const point = {
          periodEnd: row.periodEnd,
          metricHealth: healthByPair.get(`${row.portfolioClientId}|${row.periodEnd}`) ?? {},
          commercialImpactScore:
            row.commercialImpactScore === null ? null : Number(row.commercialImpactScore),
          recordedHealthScore: row.overallHealth === null ? null : Number(row.overallHealth),
        };
        periodsByClient.set(row.portfolioClientId, [...list, point]);
      }

      return (clientRows as { id: string; name: string; status: string }[])
        .filter((client) => client.status !== 'archived')
        .map((client) => ({
          clientId: client.id,
          clientName: client.name,
          churnPeriodEnd:
            client.status === 'cancelled'
              ? ((churnByClient.get(client.id) as string | null) ?? null)
              : null,
          periods: periodsByClient.get(client.id) ?? [],
        }))
        .filter((series) => series.periods.length > 0);
    },

    async createRun(input) {
      const inserted = await getDb()
        .insert(calibrationRuns)
        .values({
          organizationId: input.organizationId,
          metricModelVersionId: input.metricModelVersionId,
          windowDays: input.windowDays,
          status: 'running',
          parametersJson: input.parameters,
          createdBy: input.createdBy,
        })
        .returning({ id: calibrationRuns.id });
      const row = inserted[0];
      if (row === undefined) throw new Error('Falha ao registrar a execução de calibração.');
      const record = await readRun(input.organizationId, row.id);
      if (record === null) throw new Error('Falha ao ler a execução de calibração recém-criada.');
      return record;
    },

    async finishRun(organizationId, runId, results) {
      await getDb()
        .update(calibrationRuns)
        .set({ status: 'done', resultsJson: results, errorMessage: null, finishedAt: new Date() })
        .where(
          and(eq(calibrationRuns.organizationId, organizationId), eq(calibrationRuns.id, runId)),
        );
      return readRun(organizationId, runId);
    },

    async failRun(organizationId, runId, message) {
      await getDb()
        .update(calibrationRuns)
        .set({ status: 'failed', errorMessage: message, finishedAt: new Date() })
        .where(
          and(eq(calibrationRuns.organizationId, organizationId), eq(calibrationRuns.id, runId)),
        );
      return readRun(organizationId, runId);
    },

    async listRuns(organizationId, limit = 20) {
      const rows = await getDb()
        .select(runColumns)
        .from(calibrationRuns)
        .leftJoin(
          metricModelVersions,
          eq(metricModelVersions.id, calibrationRuns.metricModelVersionId),
        )
        .leftJoin(metricModels, eq(metricModels.id, metricModelVersions.metricModelId))
        .where(eq(calibrationRuns.organizationId, organizationId))
        .orderBy(desc(calibrationRuns.createdAt))
        .limit(limit);
      return rows.map(toRunRecord);
    },

    findRun: readRun,
  };
}
