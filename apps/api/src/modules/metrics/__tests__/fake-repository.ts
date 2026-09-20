/**
 * Repositório em memória para os testes das rotas: mesma interface do repositório Drizzle, sem
 * banco. Filtra sempre por organization_id (como o real) e simula a violação de unique do slug
 * (código 23505 do Postgres).
 */
import { randomUUID } from 'node:crypto';

import type { MetricsRepository } from '../repository.js';
import type {
  ActivePlacement,
  MetricDefinition,
  MetricModel,
  MetricModelItem,
  MetricModelItemWrite,
  MetricModelVersion,
} from '../types.js';

export interface FakeMetricsRepository extends MetricsRepository {
  definitions: MetricDefinition[];
  models: MetricModel[];
  versions: MetricModelVersion[];
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
}

function toItem(versionId: string, item: MetricModelItemWrite): MetricModelItem {
  return {
    id: randomUUID(),
    metricModelVersionId: versionId,
    metricDefinitionId: item.metricDefinitionId,
    weight: item.weight,
    currentWeight: item.currentWeight,
    trendWeight: item.trendWeight,
    persistenceWeight: item.persistenceWeight,
    normalizationStrategy: item.normalizationConfig.strategy,
    normalizationConfig: structuredClone(item.normalizationConfig),
    thresholdConfig: item.thresholdConfig === null ? null : structuredClone(item.thresholdConfig),
    criticalTriggerConfig:
      item.criticalTriggerConfig === null ? null : structuredClone(item.criticalTriggerConfig),
    formulaConfig: item.formulaConfig === null ? null : structuredClone(item.formulaConfig),
    sortOrder: item.sortOrder,
  };
}

/** Mesma ordem do repositório real: sort_order, depois id. */
function sortItems(items: MetricModelItem[]): MetricModelItem[] {
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function compareBy<T>(key: keyof T, order: 'asc' | 'desc') {
  return (a: T, b: T): number => {
    const left = String(a[key]);
    const right = String(b[key]);
    return order === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
  };
}

export function createFakeMetricsRepository(): FakeMetricsRepository {
  const definitions: MetricDefinition[] = [];
  const models: MetricModel[] = [];
  const versions: MetricModelVersion[] = [];

  const clone = <T>(value: T): T => structuredClone(value);
  const now = () => new Date().toISOString();

  const versionsOf = (organizationId: string, modelId: string) =>
    versions.filter((v) => v.organizationId === organizationId && v.metricModelId === modelId);

  return {
    definitions,
    models,
    versions,

    async listDefinitions(organizationId, query) {
      let rows = definitions.filter((d) => d.organizationId === organizationId);
      if (query.search) {
        const needle = query.search.toLowerCase();
        rows = rows.filter(
          (d) => d.name.toLowerCase().includes(needle) || d.slug.toLowerCase().includes(needle),
        );
      }
      if (query.type !== undefined) rows = rows.filter((d) => d.metricType === query.type);
      if (query.direction !== undefined) rows = rows.filter((d) => d.direction === query.direction);
      if (query.source !== undefined) rows = rows.filter((d) => d.sourceType === query.source);
      if (query.is_active !== undefined) rows = rows.filter((d) => d.isActive === query.is_active);
      rows = [...rows].sort(compareBy<MetricDefinition>(query.sort, query.order));
      const start = (query.page - 1) * query.pageSize;
      return { items: clone(rows.slice(start, start + query.pageSize)), total: rows.length };
    },

    async findDefinitionById(organizationId, id) {
      const found = definitions.find((d) => d.organizationId === organizationId && d.id === id);
      return found ? clone(found) : null;
    },

    async findDefinitionBySlug(organizationId, slug) {
      const found = definitions.find((d) => d.organizationId === organizationId && d.slug === slug);
      return found ? clone(found) : null;
    },

    async findDefinitionsByIds(organizationId, ids) {
      const set = new Set(ids);
      return clone(definitions.filter((d) => d.organizationId === organizationId && set.has(d.id)));
    },

    async createDefinition(organizationId, input) {
      if (definitions.some((d) => d.organizationId === organizationId && d.slug === input.slug)) {
        throw uniqueViolation();
      }
      const stamp = now();
      const definition: MetricDefinition = {
        id: randomUUID(),
        organizationId,
        ...input,
        createdAt: stamp,
        updatedAt: stamp,
      };
      definitions.push(definition);
      return clone(definition);
    },

    async updateDefinition(organizationId, id, patch) {
      const definition = definitions.find(
        (d) => d.organizationId === organizationId && d.id === id,
      );
      if (!definition) return null;
      if (
        patch.slug !== undefined &&
        definitions.some(
          (d) => d.organizationId === organizationId && d.slug === patch.slug && d.id !== id,
        )
      ) {
        throw uniqueViolation();
      }
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (definition as unknown as Record<string, unknown>)[key] = value;
      }
      definition.updatedAt = now();
      return clone(definition);
    },

    async deleteDefinition(organizationId, id) {
      const index = definitions.findIndex(
        (d) => d.organizationId === organizationId && d.id === id,
      );
      if (index === -1) return false;
      definitions.splice(index, 1);
      return true;
    },

    async countDefinitionUsage(organizationId, id) {
      const usage = { total: 0, byStatus: { draft: 0, active: 0, archived: 0 } };
      for (const version of versions) {
        if (version.organizationId !== organizationId) continue;
        if (version.items.some((item) => item.metricDefinitionId === id)) {
          usage.byStatus[version.status] += 1;
          usage.total += 1;
        }
      }
      return usage;
    },

    async findActivePlacements(organizationId, definitionIds) {
      const wanted = new Set(definitionIds);
      const activeModels = models
        .filter((m) => m.organizationId === organizationId && m.isActive)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const placements = new Map<string, ActivePlacement>();
      for (const model of activeModels) {
        const active = versionsOf(organizationId, model.id).find((v) => v.status === 'active');
        if (!active) continue;
        for (const item of active.items) {
          if (!wanted.has(item.metricDefinitionId) || placements.has(item.metricDefinitionId)) {
            continue;
          }
          placements.set(item.metricDefinitionId, {
            metricDefinitionId: item.metricDefinitionId,
            modelId: model.id,
            modelName: model.name,
            version: active.version,
            weight: item.weight,
            sortOrder: item.sortOrder,
            normalizationStrategy: item.normalizationStrategy,
            item: clone(item),
          });
        }
      }
      return [...placements.values()];
    },

    async listModels(organizationId, query) {
      let rows = models.filter((m) => m.organizationId === organizationId);
      if (query.search) {
        const needle = query.search.toLowerCase();
        rows = rows.filter((m) => m.name.toLowerCase().includes(needle));
      }
      if (query.is_active !== undefined) rows = rows.filter((m) => m.isActive === query.is_active);
      rows = [...rows].sort(compareBy<MetricModel>(query.sort, query.order));
      const start = (query.page - 1) * query.pageSize;
      return { items: clone(rows.slice(start, start + query.pageSize)), total: rows.length };
    },

    async findModelById(organizationId, id) {
      const found = models.find((m) => m.organizationId === organizationId && m.id === id);
      return found ? clone(found) : null;
    },

    async createModel(organizationId, input) {
      const stamp = now();
      const model: MetricModel = {
        id: randomUUID(),
        organizationId,
        ...input,
        createdAt: stamp,
        updatedAt: stamp,
      };
      models.push(model);
      return clone(model);
    },

    async listVersions(organizationId, modelId) {
      return clone(versionsOf(organizationId, modelId).sort((a, b) => b.version - a.version));
    },

    async findVersion(organizationId, modelId, version) {
      const found = versionsOf(organizationId, modelId).find((v) => v.version === version);
      return found ? clone(found) : null;
    },

    async findActiveVersion(organizationId, modelId) {
      const found = versionsOf(organizationId, modelId).find((v) => v.status === 'active');
      return found ? clone(found) : null;
    },

    async findLatestVersionNumber(organizationId, modelId) {
      return versionsOf(organizationId, modelId).reduce((max, v) => Math.max(max, v.version), 0);
    },

    async createVersion(organizationId, input) {
      if (
        versionsOf(organizationId, input.metricModelId).some((v) => v.version === input.version)
      ) {
        throw uniqueViolation();
      }
      const id = randomUUID();
      const version: MetricModelVersion = {
        id,
        metricModelId: input.metricModelId,
        organizationId,
        version: input.version,
        status: input.status,
        effectiveFrom: input.effectiveFrom,
        createdAt: now(),
        items: sortItems(input.items.map((item) => toItem(id, item))),
      };
      versions.push(version);
      return clone(version);
    },

    async updateVersion(organizationId, versionId, patch) {
      const version = versions.find(
        (v) => v.organizationId === organizationId && v.id === versionId,
      );
      if (!version) return null;
      if (patch.effectiveFrom !== undefined) version.effectiveFrom = patch.effectiveFrom;
      if (patch.items !== undefined) {
        version.items = sortItems(patch.items.map((item) => toItem(version.id, item)));
      }
      return clone(version);
    },

    async activateVersion(organizationId, modelId, versionId, effectiveFrom) {
      for (const other of versionsOf(organizationId, modelId)) {
        if (other.status === 'active') other.status = 'archived';
      }
      const version = versions.find(
        (v) => v.organizationId === organizationId && v.id === versionId,
      );
      if (!version) return null;
      version.status = 'active';
      version.effectiveFrom = effectiveFrom;
      const model = models.find((m) => m.id === modelId);
      if (model) model.updatedAt = now();
      return clone(version);
    },
  };
}
