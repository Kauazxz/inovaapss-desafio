/**
 * Persistência da importação (Drizzle). Duas responsabilidades, separadas nos comentários:
 *
 *   1. o JOB em si — `import_jobs` e `import_row_errors`;
 *   2. a GRAVAÇÃO dos dados válidos nas tabelas de domínio (`plans`, `portfolio_clients`,
 *      `contracts`, `metric_values`), sempre por UPSERT na chave natural, para reimportar o
 *      mesmo arquivo atualizar em vez de duplicar (§34).
 *
 * Toda consulta recebe o organization_id do tenant e filtra por ele (§5). O repositório em
 * memória dos testes (__tests__/fake-repository.ts) implementa a mesma interface.
 *
 * Sem transação em volta da gravação, de propósito: uma importação pode ter centenas de milhares
 * de linhas, e segurar tudo numa transação só troca "importação parcial" por "transação longa
 * que estoura". Como toda escrita é upsert pela chave natural, uma importação interrompida no
 * meio é consertada reimportando o mesmo arquivo — o job fica em `failed` com o motivo.
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  ClientRow,
  ClientStatusRow,
  DatasetKey,
  ImportErrorCode,
  Mapping,
  MonthlyMetricsRow,
  NpsRow,
  RawRow,
} from '@inovaapss/importer';
import type { ImportFileType, ImportJobStatus } from '@inovaapss/shared';
import type { ImportErrorsQuery, ImportListQuery } from '@inovaapss/validation';

import { monthBounds, monthlyMetricValues, npsMetricValue } from './metric-mapping.js';
import {
  contracts,
  importJobs,
  importRowErrors,
  metricDefinitions,
  metricValues,
  plans,
  portfolioClients,
} from '../../db/schema/index.js';

import type { ApplyResult, ImportJob, ImportRowErrorItem, ImportSummary } from './types.js';
import type { Database } from '../../infrastructure/db/index.js';

/** Quantas linhas vão por INSERT nas gravações em lote. */
const CHUNK = 500;

export interface NewImportJobInput {
  /** Gerado pelo service antes do upload: o caminho no bucket é derivado dele. */
  id: string;
  organizationId: string;
  storagePath: string;
  fileName: string;
  fileType: ImportFileType;
  sizeBytes: number;
  createdBy: string;
}

export interface ImportJobPatch {
  status?: ImportJobStatus;
  sheetName?: string | null;
  dataset?: DatasetKey | null;
  mapping?: Mapping | null;
  summary?: ImportSummary | null;
  rowsImported?: number;
  errorMessage?: string | null;
  confirmedAt?: Date | null;
}

export interface NewRowErrorInput {
  row: number;
  field: string | null;
  code: ImportErrorCode;
  message: string;
  rawData: RawRow | null;
}

export interface PaginatedRows<T> {
  items: T[];
  total: number;
}

/** Entrada comum das gravações: de onde os dados vieram, para rastrear a origem do valor. */
export interface ApplyContext {
  organizationId: string;
  source: ImportFileType;
  /** Nome do arquivo, gravado em `metric_values.source_reference`. */
  sourceReference: string;
  /** Número da linha no arquivo, por chave natural, para apontar o que não pôde ser gravado. */
  rowNumbers: ReadonlyMap<string, number>;
}

export interface ImportsRepository {
  // ---------- 1. o job ----------
  createJob(input: NewImportJobInput): Promise<ImportJob>;
  findJob(organizationId: string, id: string): Promise<ImportJob | null>;
  listJobs(organizationId: string, query: ImportListQuery): Promise<PaginatedRows<ImportJob>>;
  updateJob(organizationId: string, id: string, patch: ImportJobPatch): Promise<ImportJob | null>;
  /** Troca todos os erros guardados do job pelos novos (a confirmação reescreve o relatório). */
  replaceRowErrors(
    organizationId: string,
    jobId: string,
    errors: readonly NewRowErrorInput[],
  ): Promise<number>;
  listRowErrors(
    organizationId: string,
    jobId: string,
    query: ImportErrorsQuery,
  ): Promise<PaginatedRows<ImportRowErrorItem>>;

  // ---------- 2. os dados ----------
  applyClients(context: ApplyContext, rows: readonly ClientRow[]): Promise<ApplyResult>;
  applyClientStatus(context: ApplyContext, rows: readonly ClientStatusRow[]): Promise<ApplyResult>;
  applyMonthlyMetrics(
    context: ApplyContext,
    rows: readonly MonthlyMetricsRow[],
  ): Promise<ApplyResult>;
  applyNps(context: ApplyContext, rows: readonly NpsRow[]): Promise<ApplyResult>;
}

type JobRow = typeof importJobs.$inferSelect;
type RowErrorRow = typeof importRowErrors.$inferSelect;

export function toImportJob(row: JobRow): ImportJob {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fileName: row.fileName,
    fileType: row.fileType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    sheetName: row.sheetName,
    dataset: (row.dataset as DatasetKey | null) ?? null,
    mapping: (row.mappingJson as Mapping | null) ?? null,
    summary: (row.summaryJson as ImportSummary | null) ?? null,
    rowsImported: row.rowsImported,
    errorMessage: row.errorMessage,
    createdBy: row.createdBy,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRowError(row: RowErrorRow): ImportRowErrorItem {
  return {
    id: row.id,
    row: row.rowNumber,
    field: row.field,
    code: row.errorCode as ImportErrorCode,
    message: row.message,
    rawData: (row.rawDataJson as RawRow | null) ?? null,
  };
}

/** Chave natural de uma linha, no mesmo formato que o service usa em `rowNumbers`. */
function keyOf(...parts: readonly string[]): string {
  return parts.join('\u0000');
}

function emptyResult(): ApplyResult {
  return { rows: 0, recordsCreated: 0, recordsUpdated: 0, skipped: [] };
}

async function inChunks<T>(rows: readonly T[], run: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await run(rows.slice(i, i + CHUNK));
  }
}

export function createImportsRepository(getDb: () => Database): ImportsRepository {
  /** Código externo → id do cliente, para os datasets que referenciam a carteira. */
  const loadClientIds = async (organizationId: string): Promise<Map<string, string>> => {
    const rows = await getDb()
      .select({ id: portfolioClients.id, externalCode: portfolioClients.externalCode })
      .from(portfolioClients)
      .where(eq(portfolioClients.organizationId, organizationId));
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.externalCode !== null) map.set(row.externalCode, row.id);
    }
    return map;
  };

  /** Slug da métrica → id da definição na organização. */
  const loadMetricIds = async (organizationId: string): Promise<Map<string, string>> => {
    const rows = await getDb()
      .select({ id: metricDefinitions.id, slug: metricDefinitions.slug })
      .from(metricDefinitions)
      .where(eq(metricDefinitions.organizationId, organizationId));
    return new Map(rows.map((row) => [row.slug, row.id]));
  };

  /**
   * Grava valores de métrica por UPSERT na chave natural (cliente, métrica, início do período),
   * que é o índice único `metric_values_client_metric_period_unique`. Antes de gravar, consulta
   * quais combinações já existem — é o que permite dizer quantas linhas foram criadas e quantas
   * atualizadas sem depender de truques do Postgres.
   */
  const upsertMetricValues = async (
    organizationId: string,
    rows: readonly (typeof metricValues.$inferInsert)[],
  ): Promise<{ created: number; updated: number }> => {
    if (rows.length === 0) return { created: 0, updated: 0 };
    const db = getDb();
    const clientIds = [...new Set(rows.map((row) => row.portfolioClientId))];
    const periodStarts = [...new Set(rows.map((row) => row.periodStart))];
    const metricIds = [...new Set(rows.map((row) => row.metricDefinitionId))];

    const existing = await db
      .select({
        portfolioClientId: metricValues.portfolioClientId,
        metricDefinitionId: metricValues.metricDefinitionId,
        periodStart: metricValues.periodStart,
      })
      .from(metricValues)
      .where(
        and(
          eq(metricValues.organizationId, organizationId),
          inArray(metricValues.portfolioClientId, clientIds),
          inArray(metricValues.metricDefinitionId, metricIds),
          inArray(metricValues.periodStart, periodStarts),
        ),
      );
    const known = new Set(
      existing.map((row) =>
        keyOf(row.portfolioClientId, row.metricDefinitionId, String(row.periodStart)),
      ),
    );

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const key = keyOf(row.portfolioClientId, row.metricDefinitionId, String(row.periodStart));
      if (known.has(key)) updated += 1;
      else created += 1;
    }

    await inChunks(rows, (chunk) =>
      db
        .insert(metricValues)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            metricValues.portfolioClientId,
            metricValues.metricDefinitionId,
            metricValues.periodStart,
          ],
          // A importação é dona da linha inteira: reimportar não deixa para trás um valor
          // textual ou um `answered` de uma carga anterior.
          set: {
            periodEnd: sql`excluded.period_end`,
            rawValueNumeric: sql`excluded.raw_value_numeric`,
            rawValueText: sql`excluded.raw_value_text`,
            answered: sql`excluded.answered`,
            source: sql`excluded.source`,
            sourceReference: sql`excluded.source_reference`,
            recordedAt: new Date(),
          },
        }),
    );

    return { created, updated };
  };

  return {
    // ------------------------------------------------------------------ job
    async createJob(input) {
      const [row] = await getDb()
        .insert(importJobs)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          storagePath: input.storagePath,
          fileName: input.fileName,
          fileType: input.fileType,
          sizeBytes: input.sizeBytes,
          createdBy: input.createdBy,
        })
        .returning();
      if (row === undefined) throw new Error('Falha ao criar a importação.');
      return toImportJob(row);
    },

    async findJob(organizationId, id) {
      const [row] = await getDb()
        .select()
        .from(importJobs)
        .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.id, id)))
        .limit(1);
      return row === undefined ? null : toImportJob(row);
    },

    async listJobs(organizationId, query) {
      const conditions = [eq(importJobs.organizationId, organizationId)];
      if (query.status !== undefined) conditions.push(eq(importJobs.status, query.status));
      const where = and(...conditions);

      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(importJobs)
          .where(where)
          // A importação mais recente primeiro: é a que a pessoa acabou de fazer.
          .orderBy(desc(importJobs.createdAt), desc(importJobs.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(importJobs).where(where),
      ]);
      return { items: rows.map(toImportJob), total: totals[0]?.total ?? 0 };
    },

    async updateJob(organizationId, id, patch) {
      const values: Partial<typeof importJobs.$inferInsert> = { updatedAt: new Date() };
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.sheetName !== undefined) values.sheetName = patch.sheetName;
      if (patch.dataset !== undefined) values.dataset = patch.dataset;
      if (patch.mapping !== undefined) values.mappingJson = patch.mapping;
      if (patch.summary !== undefined) values.summaryJson = patch.summary;
      if (patch.rowsImported !== undefined) values.rowsImported = patch.rowsImported;
      if (patch.errorMessage !== undefined) values.errorMessage = patch.errorMessage;
      if (patch.confirmedAt !== undefined) values.confirmedAt = patch.confirmedAt;

      const rows = await getDb()
        .update(importJobs)
        .set(values)
        .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.id, id)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : toImportJob(row);
    },

    async replaceRowErrors(organizationId, jobId, errors) {
      const db = getDb();
      await db
        .delete(importRowErrors)
        .where(
          and(
            eq(importRowErrors.organizationId, organizationId),
            eq(importRowErrors.importJobId, jobId),
          ),
        );
      if (errors.length === 0) return 0;
      await inChunks(errors, (chunk) =>
        db.insert(importRowErrors).values(
          chunk.map((error) => ({
            importJobId: jobId,
            organizationId,
            rowNumber: error.row,
            field: error.field,
            errorCode: error.code,
            message: error.message,
            rawDataJson: error.rawData,
          })),
        ),
      );
      return errors.length;
    },

    async listRowErrors(organizationId, jobId, query) {
      const where = and(
        eq(importRowErrors.organizationId, organizationId),
        eq(importRowErrors.importJobId, jobId),
      );
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(importRowErrors)
          .where(where)
          .orderBy(importRowErrors.rowNumber, importRowErrors.id)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(importRowErrors).where(where),
      ]);
      return { items: rows.map(toRowError), total: totals[0]?.total ?? 0 };
    },

    // ---------------------------------------------------------------- dados
    /**
     * Clientes: plano (cria o que faltar), cadastro e contrato. O `status` do cliente NÃO é
     * tocado numa atualização — quem manda nele é o dataset `client_status` e o arquivamento
     * feito na tela (§37: DELETE /clients/:id só arquiva).
     */
    async applyClients(context, rows) {
      const result = emptyResult();
      if (rows.length === 0) return result;
      const db = getDb();
      const { organizationId } = context;

      // Planos: um select por nome distinto, criando os que faltarem.
      const planIdByName = new Map<string, string>();
      for (const name of [...new Set(rows.map((row) => row.plan))].sort()) {
        const [existing] = await db
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.organizationId, organizationId), eq(plans.name, name)))
          .limit(1);
        if (existing) {
          planIdByName.set(name, existing.id);
          continue;
        }
        const [created] = await db
          .insert(plans)
          .values({ organizationId, name, description: `Plano ${name} (importado).` })
          .returning({ id: plans.id });
        if (created) planIdByName.set(name, created.id);
      }

      for (const row of rows) {
        const [existingClient] = await db
          .select({ id: portfolioClients.id })
          .from(portfolioClients)
          .where(
            and(
              eq(portfolioClients.organizationId, organizationId),
              eq(portfolioClients.externalCode, row.external_code),
            ),
          )
          .limit(1);

        let clientId: string;
        if (existingClient) {
          await db
            .update(portfolioClients)
            .set({
              name: row.name ?? row.external_code,
              segment: row.segment,
              size: row.size,
              updatedAt: new Date(),
            })
            .where(eq(portfolioClients.id, existingClient.id));
          clientId = existingClient.id;
          result.recordsUpdated += 1;
        } else {
          const [created] = await db
            .insert(portfolioClients)
            .values({
              organizationId,
              externalCode: row.external_code,
              name: row.name ?? row.external_code,
              segment: row.segment,
              size: row.size,
              status: 'active',
            })
            .returning({ id: portfolioClients.id });
          if (created === undefined) {
            result.skipped.push({
              row: context.rowNumbers.get(keyOf(row.external_code)) ?? 0,
              externalCode: row.external_code,
              reason: 'Não foi possível criar o cliente.',
            });
            continue;
          }
          clientId = created.id;
          result.recordsCreated += 1;
        }
        result.rows += 1;

        // Contrato: o ativo do cliente; sem ativo, o último existente; sem nenhum, cria.
        const contractValues = {
          planId: planIdByName.get(row.plan) ?? null,
          monthlyValue: row.monthly_value.toFixed(2),
          startDate: row.contract_start,
          // A coluna é inteira; arredondar aqui é explícito em vez de depender do cast do Postgres.
          contractedSlaHours: Math.round(row.contracted_sla_hours),
          updatedAt: new Date(),
        };
        const [activeContract] = await db
          .select({ id: contracts.id })
          .from(contracts)
          .where(
            and(
              eq(contracts.organizationId, organizationId),
              eq(contracts.portfolioClientId, clientId),
              eq(contracts.status, 'active'),
            ),
          )
          .limit(1);
        const [anyContract] = activeContract
          ? [activeContract]
          : await db
              .select({ id: contracts.id })
              .from(contracts)
              .where(
                and(
                  eq(contracts.organizationId, organizationId),
                  eq(contracts.portfolioClientId, clientId),
                ),
              )
              .orderBy(desc(contracts.startDate), desc(contracts.id))
              .limit(1);

        if (anyContract) {
          await db.update(contracts).set(contractValues).where(eq(contracts.id, anyContract.id));
        } else {
          await db.insert(contracts).values({
            organizationId,
            portfolioClientId: clientId,
            currency: 'BRL',
            status: 'active',
            ...contractValues,
          });
        }
      }
      return result;
    },

    /**
     * Situação: ativa quem está ativo, cancela quem cancelou (encerrando o contrato no último
     * dia do mês da saída, §33). Cliente arquivado na tela não volta sozinho por importação.
     */
    async applyClientStatus(context, rows) {
      const result = emptyResult();
      if (rows.length === 0) return result;
      const db = getDb();
      const { organizationId } = context;

      const current = await db
        .select({
          id: portfolioClients.id,
          externalCode: portfolioClients.externalCode,
          status: portfolioClients.status,
        })
        .from(portfolioClients)
        .where(eq(portfolioClients.organizationId, organizationId));
      const byCode = new Map(
        current
          .filter((row) => row.externalCode !== null)
          .map((row) => [row.externalCode as string, row]),
      );

      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code)) ?? 0;
        const client = byCode.get(row.external_code);
        if (client === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
          });
          continue;
        }
        if (client.status === 'archived') {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente arquivado; desarquive antes de atualizar a situação.',
          });
          continue;
        }

        const status = row.status === 'cancelled' ? 'cancelled' : 'active';
        await db
          .update(portfolioClients)
          .set({ status, updatedAt: new Date() })
          .where(eq(portfolioClients.id, client.id));
        result.rows += 1;
        result.recordsUpdated += 1;

        if (status === 'cancelled' && row.cancellation_period !== null) {
          const { end } = monthBounds(row.cancellation_period);
          await db
            .update(contracts)
            .set({ status: 'ended', endDate: end, updatedAt: new Date() })
            .where(
              and(
                eq(contracts.organizationId, organizationId),
                eq(contracts.portfolioClientId, client.id),
                eq(contracts.status, 'active'),
              ),
            );
        }
      }
      return result;
    },

    /** Atendimento mensal: uma linha de `metric_values` por métrica do preset (metric-mapping). */
    async applyMonthlyMetrics(context, rows) {
      const result = emptyResult();
      if (rows.length === 0) return result;
      const { organizationId } = context;
      const [clientIdByCode, metricIdBySlug] = await Promise.all([
        loadClientIds(organizationId),
        loadMetricIds(organizationId),
      ]);

      const values: (typeof metricValues.$inferInsert)[] = [];
      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code, row.period)) ?? 0;
        const portfolioClientId = clientIdByCode.get(row.external_code);
        if (portfolioClientId === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
          });
          continue;
        }
        const { start, end } = monthBounds(row.period);
        let usedAnyMetric = false;
        for (const draft of monthlyMetricValues(row)) {
          // Métrica não cadastrada é configuração legítima: cada organização escolhe as suas.
          const metricDefinitionId = metricIdBySlug.get(draft.metricSlug);
          if (metricDefinitionId === undefined) continue;
          usedAnyMetric = true;
          values.push({
            organizationId,
            portfolioClientId,
            metricDefinitionId,
            periodStart: start,
            periodEnd: end,
            rawValueNumeric: draft.value,
            source: context.source,
            sourceReference: context.sourceReference,
          });
        }
        if (!usedAnyMetric) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Nenhuma métrica do atendimento mensal está cadastrada nesta organização.',
          });
          continue;
        }
        result.rows += 1;
      }

      const { created, updated } = await upsertMetricValues(organizationId, values);
      result.recordsCreated = created;
      result.recordsUpdated = updated;
      return result;
    },

    /** NPS: a métrica `nps_dissatisfaction`, com `answered` separado do valor (§16). */
    async applyNps(context, rows) {
      const result = emptyResult();
      if (rows.length === 0) return result;
      const { organizationId } = context;
      const [clientIdByCode, metricIdBySlug] = await Promise.all([
        loadClientIds(organizationId),
        loadMetricIds(organizationId),
      ]);

      const values: (typeof metricValues.$inferInsert)[] = [];
      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code, row.period)) ?? 0;
        const portfolioClientId = clientIdByCode.get(row.external_code);
        if (portfolioClientId === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
          });
          continue;
        }
        const draft = npsMetricValue(row);
        const metricDefinitionId = metricIdBySlug.get(draft.metricSlug);
        if (metricDefinitionId === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: `A métrica "${draft.metricSlug}" não está cadastrada nesta organização.`,
          });
          continue;
        }
        const { start, end } = monthBounds(row.period);
        values.push({
          organizationId,
          portfolioClientId,
          metricDefinitionId,
          periodStart: start,
          periodEnd: end,
          rawValueNumeric: draft.value,
          answered: draft.answered === undefined ? null : String(draft.answered),
          source: context.source,
          sourceReference: context.sourceReference,
        });
        result.rows += 1;
      }

      const { created, updated } = await upsertMetricValues(organizationId, values);
      result.recordsCreated = created;
      result.recordsUpdated = updated;
      return result;
    },
  };
}
