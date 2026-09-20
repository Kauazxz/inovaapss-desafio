/**
 * Repositórios em memória da importação: mesma interface dos de Drizzle, sem banco.
 *
 * Filtram sempre por organization_id, como os reais — é o que faz os testes de isolamento entre
 * organizações valerem alguma coisa.
 */
import { randomUUID } from 'node:crypto';

import type { ImportJobDto, ImportRowErrorDto } from '@inovaapss/shared';

import type {
  ImportIngestRepository,
  IngestClientInput,
  ResolvedMetricValue,
} from '../ingest-repository.js';
import type { ImportsRepository, NewImportRowErrorInput } from '../repository.js';
import type { ImportJobRecord } from '../types.js';

export interface FakeImportsRepository extends ImportsRepository {
  jobs: ImportJobRecord[];
  rowErrors: NewImportRowErrorInput[];
}

export function createFakeImportsRepository(): FakeImportsRepository {
  const jobs: ImportJobRecord[] = [];
  let rowErrors: NewImportRowErrorInput[] = [];
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 20, 12, 0, tick++)).toISOString();

  const toPublic = (job: ImportJobRecord): ImportJobDto => {
    const { filePath: _filePath, ...rest } = job;
    return { ...rest };
  };

  return {
    jobs,
    get rowErrors() {
      return rowErrors;
    },

    async createJob(input) {
      const record: ImportJobRecord = {
        id: input.id,
        organizationId: input.organizationId,
        fileName: input.fileName,
        fileType: input.fileType,
        sizeBytes: input.sizeBytes,
        status: 'uploaded',
        mapping: null,
        summary: null,
        error: null,
        createdBy: input.createdBy,
        createdAt: stamp(),
        finishedAt: null,
        filePath: input.filePath,
      };
      jobs.push(record);
      return { ...record };
    },

    async findJob(organizationId, id) {
      const found = jobs.find((job) => job.organizationId === organizationId && job.id === id);
      return found === undefined ? null : { ...found };
    },

    async listJobs(organizationId, query) {
      const rows = jobs
        .filter((job) => job.organizationId === organizationId)
        .filter((job) => query.status === undefined || job.status === query.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(start, start + query.pageSize).map(toPublic),
        total: rows.length,
      };
    },

    async updateJob(organizationId, id, patch) {
      const job = jobs.find((item) => item.organizationId === organizationId && item.id === id);
      if (job === undefined) return null;
      if (patch.status !== undefined) job.status = patch.status;
      if (patch.mapping !== undefined) job.mapping = patch.mapping;
      if (patch.summary !== undefined) job.summary = patch.summary;
      if (patch.errorMessage !== undefined) job.error = patch.errorMessage;
      if (patch.finishedAt !== undefined) {
        job.finishedAt = patch.finishedAt === null ? null : patch.finishedAt.toISOString();
      }
      return { ...job };
    },

    async replaceRowErrors(organizationId, importJobId, errors) {
      rowErrors = rowErrors.filter(
        (error) => !(error.organizationId === organizationId && error.importJobId === importJobId),
      );
      rowErrors.push(...errors);
      return errors.length;
    },

    async listRowErrors(organizationId, importJobId, query) {
      const rows = rowErrors
        .filter(
          (error) => error.organizationId === organizationId && error.importJobId === importJobId,
        )
        .sort((a, b) => a.rowNumber - b.rowNumber);
      const start = (query.page - 1) * query.pageSize;
      const items: ImportRowErrorDto[] = rows.slice(start, start + query.pageSize).map((error) => ({
        row: error.rowNumber,
        sheet: error.sheet,
        dataset: error.dataset,
        field: error.field,
        code: error.errorCode,
        message: error.message,
      }));
      return { items, total: rows.length };
    },
  };
}

/** Cliente gravado, como o dublê guarda (o suficiente para os testes conferirem). */
export interface FakeStoredClient extends IngestClientInput {
  id: string;
  organizationId: string;
  planId: string | null;
}

export interface FakeStoredValue extends ResolvedMetricValue {
  organizationId: string;
  sourceReference: string;
  source: string;
}

export interface FakeIngestRepository extends ImportIngestRepository {
  plans: { id: string; organizationId: string; name: string }[];
  clients: FakeStoredClient[];
  values: FakeStoredValue[];
  /** Métricas que a organização "tem cadastradas" (slug → id). */
  metrics: Map<string, string>;
}

export function createFakeIngestRepository(
  metricSlugs: readonly string[] = [],
): FakeIngestRepository {
  const plans: { id: string; organizationId: string; name: string }[] = [];
  const clients: FakeStoredClient[] = [];
  const values: FakeStoredValue[] = [];
  const metrics = new Map<string, string>(metricSlugs.map((slug) => [slug, randomUUID()]));

  return {
    plans,
    clients,
    values,
    metrics,

    async ensurePlans(organizationId, names) {
      const idByName = new Map<string, string>();
      let created = 0;
      for (const name of [...new Set(names)].filter((n) => n.trim() !== '').sort()) {
        let plan = plans.find((p) => p.organizationId === organizationId && p.name === name);
        if (plan === undefined) {
          plan = { id: randomUUID(), organizationId, name };
          plans.push(plan);
          created += 1;
        }
        idByName.set(name, plan.id);
      }
      return { idByName, created };
    },

    async upsertClients(organizationId, inputs, planIdByName) {
      const clientIdByCode = new Map<string, string>();
      let created = 0;
      let updated = 0;
      let cancelled = 0;
      let contractsCreated = 0;
      let contractsUpdated = 0;

      for (const input of inputs) {
        const existing = clients.find(
          (client) =>
            client.organizationId === organizationId && client.externalCode === input.externalCode,
        );
        const planId = planIdByName.get(input.plan) ?? null;
        if (existing) {
          Object.assign(existing, input, { planId });
          clientIdByCode.set(input.externalCode, existing.id);
          updated += 1;
          contractsUpdated += 1;
        } else {
          const client: FakeStoredClient = {
            ...input,
            id: randomUUID(),
            organizationId,
            planId,
          };
          clients.push(client);
          clientIdByCode.set(input.externalCode, client.id);
          created += 1;
          contractsCreated += 1;
        }
        if (input.status === 'cancelled') cancelled += 1;
      }
      return {
        clientIdByCode,
        created,
        updated,
        cancelled,
        contractsCreated,
        contractsUpdated,
      };
    },

    async applyStatuses(organizationId, inputs) {
      const missing: string[] = [];
      let updated = 0;
      let cancelled = 0;
      for (const input of inputs) {
        const client = clients.find(
          (item) =>
            item.organizationId === organizationId && item.externalCode === input.externalCode,
        );
        if (client === undefined) {
          missing.push(input.externalCode);
          continue;
        }
        client.status = input.status;
        client.contractEnd = input.contractEnd;
        updated += 1;
        if (input.status === 'cancelled') cancelled += 1;
      }
      return { updated, cancelled, missing };
    },

    async clientIdsByExternalCode(organizationId) {
      return new Map(
        clients
          .filter((client) => client.organizationId === organizationId)
          .map((client) => [client.externalCode, client.id]),
      );
    },

    async metricIdsBySlug() {
      return new Map(metrics);
    },

    async upsertMetricValues(organizationId, incoming, sourceReference, source) {
      for (const value of incoming) {
        const existing = values.find(
          (item) =>
            item.organizationId === organizationId &&
            item.portfolioClientId === value.portfolioClientId &&
            item.metricDefinitionId === value.metricDefinitionId &&
            item.periodStart === value.periodStart,
        );
        if (existing) {
          Object.assign(existing, value, { sourceReference, source });
        } else {
          values.push({ ...value, organizationId, sourceReference, source });
        }
      }
      return incoming.length;
    },
  };
}
