/**
 * ImportsRepository em memória: mesma interface do Drizzle, sem banco.
 *
 * Modela o suficiente das tabelas de destino (planos, clientes, contratos e valores de métrica)
 * para os testes conferirem o que a confirmação REALMENTE grava — e não só que ela respondeu 200.
 * As regras reproduzidas aqui são as mesmas do repositório de verdade: upsert pela chave natural,
 * cliente fora da carteira vira `skipped`, `status` do cliente só muda pelo dataset `client_status`.
 */
import { randomUUID } from 'node:crypto';

import type { ClientRow, ClientStatusRow, MonthlyMetricsRow, NpsRow } from '@inovaapss/importer';

import { monthBounds, monthlyMetricValues, npsMetricValue } from '../metric-mapping.js';

import type {
  ApplyContext,
  ImportJobPatch,
  ImportsRepository,
  NewImportJobInput,
  NewRowErrorInput,
} from '../repository.js';
import type { ApplyResult, ImportJob, ImportRowErrorItem } from '../types.js';

export interface FakeClient {
  id: string;
  organizationId: string;
  externalCode: string;
  name: string;
  segment: string | null;
  size: string | null;
  status: 'active' | 'cancelled' | 'archived';
}

export interface FakeContract {
  id: string;
  organizationId: string;
  portfolioClientId: string;
  planId: string | null;
  monthlyValue: number;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'ended';
  contractedSlaHours: number | null;
}

export interface FakeMetricValue {
  organizationId: string;
  portfolioClientId: string;
  metricSlug: string;
  periodStart: string;
  periodEnd: string;
  value: number | null;
  answered: string | null;
  source: string;
  sourceReference: string;
}

export interface ImportsStore {
  jobs: ImportJob[];
  rowErrors: Map<string, ImportRowErrorItem[]>;
  plans: { id: string; organizationId: string; name: string }[];
  clients: FakeClient[];
  contracts: FakeContract[];
  /** Slug → id, como as definições cadastradas na organização. */
  metricDefinitions: Map<string, string>;
  /** Chave `cliente|métrica|período` → valor. */
  metricValues: Map<string, FakeMetricValue>;
}

export function createImportsStore(seed: Partial<ImportsStore> = {}): ImportsStore {
  return {
    jobs: seed.jobs ?? [],
    rowErrors: seed.rowErrors ?? new Map(),
    plans: seed.plans ?? [],
    clients: seed.clients ?? [],
    contracts: seed.contracts ?? [],
    metricDefinitions: seed.metricDefinitions ?? new Map(),
    metricValues: seed.metricValues ?? new Map(),
  };
}

const keyOf = (...parts: readonly string[]) => parts.join('\u0000');

function emptyResult(): ApplyResult {
  return { rows: 0, recordsCreated: 0, recordsUpdated: 0, skipped: [] };
}

export function createFakeImportsRepository(store: ImportsStore): ImportsRepository {
  const clientsOf = (organizationId: string) =>
    store.clients.filter((client) => client.organizationId === organizationId);

  const findClient = (organizationId: string, externalCode: string) =>
    clientsOf(organizationId).find((client) => client.externalCode === externalCode);

  const writeMetricValue = (value: FakeMetricValue): 'created' | 'updated' => {
    const key = keyOf(value.portfolioClientId, value.metricSlug, value.periodStart);
    const existed = store.metricValues.has(key);
    store.metricValues.set(key, value);
    return existed ? 'updated' : 'created';
  };

  return {
    async createJob(input: NewImportJobInput) {
      const timestamp = new Date().toISOString();
      const job: ImportJob = {
        id: input.id,
        organizationId: input.organizationId,
        fileName: input.fileName,
        fileType: input.fileType,
        sizeBytes: input.sizeBytes,
        status: 'uploaded',
        sheetName: null,
        dataset: null,
        mapping: null,
        summary: null,
        rowsImported: 0,
        errorMessage: null,
        createdBy: input.createdBy,
        confirmedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.jobs.push(job);
      return job;
    },

    async findJob(organizationId, id) {
      return (
        store.jobs.find((job) => job.organizationId === organizationId && job.id === id) ?? null
      );
    },

    async listJobs(organizationId, query) {
      const all = store.jobs
        .filter((job) => job.organizationId === organizationId)
        .filter((job) => query.status === undefined || job.status === query.status)
        .slice()
        .reverse();
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length };
    },

    async updateJob(organizationId, id, patch: ImportJobPatch) {
      const index = store.jobs.findIndex(
        (job) => job.organizationId === organizationId && job.id === id,
      );
      const current = store.jobs[index];
      if (index === -1 || current === undefined) return null;
      const updated: ImportJob = {
        ...current,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.sheetName === undefined ? {} : { sheetName: patch.sheetName }),
        ...(patch.dataset === undefined ? {} : { dataset: patch.dataset }),
        ...(patch.mapping === undefined ? {} : { mapping: patch.mapping }),
        ...(patch.summary === undefined ? {} : { summary: patch.summary }),
        ...(patch.rowsImported === undefined ? {} : { rowsImported: patch.rowsImported }),
        ...(patch.errorMessage === undefined ? {} : { errorMessage: patch.errorMessage }),
        ...(patch.confirmedAt === undefined
          ? {}
          : { confirmedAt: patch.confirmedAt?.toISOString() ?? null }),
        updatedAt: new Date().toISOString(),
      };
      store.jobs[index] = updated;
      return updated;
    },

    async replaceRowErrors(_organizationId, jobId, errors: readonly NewRowErrorInput[]) {
      store.rowErrors.set(
        jobId,
        errors.map((error) => ({
          id: randomUUID(),
          row: error.row,
          field: error.field,
          code: error.code,
          message: error.message,
          rawData: error.rawData,
        })),
      );
      return errors.length;
    },

    async listRowErrors(_organizationId, jobId, query) {
      const all = store.rowErrors.get(jobId) ?? [];
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length };
    },

    async applyClients(context: ApplyContext, rows: readonly ClientRow[]) {
      const result = emptyResult();
      for (const row of rows) {
        let planId = store.plans.find(
          (plan) => plan.organizationId === context.organizationId && plan.name === row.plan,
        )?.id;
        if (planId === undefined) {
          planId = randomUUID();
          store.plans.push({ id: planId, organizationId: context.organizationId, name: row.plan });
        }

        const existing = findClient(context.organizationId, row.external_code);
        let clientId: string;
        if (existing === undefined) {
          clientId = randomUUID();
          store.clients.push({
            id: clientId,
            organizationId: context.organizationId,
            externalCode: row.external_code,
            name: row.name ?? row.external_code,
            segment: row.segment,
            size: row.size,
            status: 'active',
          });
          result.recordsCreated += 1;
        } else {
          clientId = existing.id;
          existing.name = row.name ?? row.external_code;
          existing.segment = row.segment;
          existing.size = row.size;
          result.recordsUpdated += 1;
        }
        result.rows += 1;

        const contract =
          store.contracts.find(
            (item) => item.portfolioClientId === clientId && item.status === 'active',
          ) ?? store.contracts.find((item) => item.portfolioClientId === clientId);
        if (contract === undefined) {
          store.contracts.push({
            id: randomUUID(),
            organizationId: context.organizationId,
            portfolioClientId: clientId,
            planId,
            monthlyValue: row.monthly_value,
            startDate: row.contract_start,
            endDate: null,
            status: 'active',
            contractedSlaHours: Math.round(row.contracted_sla_hours),
          });
        } else {
          contract.planId = planId;
          contract.monthlyValue = row.monthly_value;
          contract.startDate = row.contract_start;
          contract.contractedSlaHours = Math.round(row.contracted_sla_hours);
        }
      }
      return result;
    },

    async applyClientStatus(context: ApplyContext, rows: readonly ClientStatusRow[]) {
      const result = emptyResult();
      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code)) ?? 0;
        const client = findClient(context.organizationId, row.external_code);
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
        client.status = row.status === 'cancelled' ? 'cancelled' : 'active';
        result.rows += 1;
        result.recordsUpdated += 1;

        if (client.status === 'cancelled' && row.cancellation_period !== null) {
          const { end } = monthBounds(row.cancellation_period);
          for (const contract of store.contracts) {
            if (contract.portfolioClientId === client.id && contract.status === 'active') {
              contract.status = 'ended';
              contract.endDate = end;
            }
          }
        }
      }
      return result;
    },

    async applyMonthlyMetrics(context: ApplyContext, rows: readonly MonthlyMetricsRow[]) {
      const result = emptyResult();
      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code, row.period)) ?? 0;
        const client = findClient(context.organizationId, row.external_code);
        if (client === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
          });
          continue;
        }
        const { start, end } = monthBounds(row.period);
        let used = false;
        for (const draft of monthlyMetricValues(row)) {
          if (!store.metricDefinitions.has(draft.metricSlug)) continue;
          used = true;
          const outcome = writeMetricValue({
            organizationId: context.organizationId,
            portfolioClientId: client.id,
            metricSlug: draft.metricSlug,
            periodStart: start,
            periodEnd: end,
            value: draft.value,
            answered: null,
            source: context.source,
            sourceReference: context.sourceReference,
          });
          if (outcome === 'created') result.recordsCreated += 1;
          else result.recordsUpdated += 1;
        }
        if (!used) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Nenhuma métrica do atendimento mensal está cadastrada nesta organização.',
          });
          continue;
        }
        result.rows += 1;
      }
      return result;
    },

    async applyNps(context: ApplyContext, rows: readonly NpsRow[]) {
      const result = emptyResult();
      for (const row of rows) {
        const rowNumber = context.rowNumbers.get(keyOf(row.external_code, row.period)) ?? 0;
        const client = findClient(context.organizationId, row.external_code);
        if (client === undefined) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
          });
          continue;
        }
        const draft = npsMetricValue(row);
        if (!store.metricDefinitions.has(draft.metricSlug)) {
          result.skipped.push({
            row: rowNumber,
            externalCode: row.external_code,
            reason: `A métrica "${draft.metricSlug}" não está cadastrada nesta organização.`,
          });
          continue;
        }
        const { start, end } = monthBounds(row.period);
        const outcome = writeMetricValue({
          organizationId: context.organizationId,
          portfolioClientId: client.id,
          metricSlug: draft.metricSlug,
          periodStart: start,
          periodEnd: end,
          value: draft.value,
          answered: draft.answered === undefined ? null : String(draft.answered),
          source: context.source,
          sourceReference: context.sourceReference,
        });
        if (outcome === 'created') result.recordsCreated += 1;
        else result.recordsUpdated += 1;
        result.rows += 1;
      }
      return result;
    },
  };
}
