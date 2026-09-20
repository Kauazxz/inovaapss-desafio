/**
 * Persistência de metric_definitions, metric_models, metric_model_versions e
 * metric_model_items (Drizzle). Toda consulta recebe o organization_id do tenant e filtra por
 * ele (§5) — inclusive as de itens, que chegam à organização pela versão.
 *
 * Recebe `getDb` (e não a instância) para a conexão só abrir na primeira consulta.
 */
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';

import type { MetricModelVersionStatus } from '@inovaapss/shared';

import {
  clientScoreSnapshots,
  metricDefinitions,
  metricModelItems,
  metricModels,
  metricModelVersions,
} from '../../db/schema/index.js';

import type {
  ActivePlacement,
  CreateMetricDefinitionInput,
  CreateMetricModelInput,
  CreateVersionInput,
  DefinitionUsage,
  ListMetricDefinitionsInput,
  ListMetricModelsInput,
  MetricDefinition,
  MetricModel,
  MetricModelItem,
  MetricModelItemWrite,
  MetricModelVersion,
  PagedResult,
  UpdateMetricDefinitionInput,
} from './types.js';
import type { Database } from '../../infrastructure/db/index.js';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export interface MetricsRepository {
  // ---- definições ----
  listDefinitions(
    organizationId: string,
    query: ListMetricDefinitionsInput,
  ): Promise<PagedResult<MetricDefinition>>;
  findDefinitionById(organizationId: string, id: string): Promise<MetricDefinition | null>;
  findDefinitionBySlug(organizationId: string, slug: string): Promise<MetricDefinition | null>;
  findDefinitionsByIds(organizationId: string, ids: readonly string[]): Promise<MetricDefinition[]>;
  createDefinition(
    organizationId: string,
    input: CreateMetricDefinitionInput,
  ): Promise<MetricDefinition>;
  updateDefinition(
    organizationId: string,
    id: string,
    patch: UpdateMetricDefinitionInput,
  ): Promise<MetricDefinition | null>;
  deleteDefinition(organizationId: string, id: string): Promise<boolean>;
  /** Em quantas versões (por status) a definição aparece. */
  countDefinitionUsage(organizationId: string, id: string): Promise<DefinitionUsage>;
  /** Posição de cada definição na versão ativa do modelo ativo mais antigo (uma por definição). */
  findActivePlacements(
    organizationId: string,
    definitionIds: readonly string[],
  ): Promise<ActivePlacement[]>;

  // ---- modelos ----
  listModels(
    organizationId: string,
    query: ListMetricModelsInput,
  ): Promise<PagedResult<MetricModel>>;
  findModelById(organizationId: string, id: string): Promise<MetricModel | null>;
  createModel(organizationId: string, input: CreateMetricModelInput): Promise<MetricModel>;

  // ---- versões ----
  listVersions(organizationId: string, modelId: string): Promise<MetricModelVersion[]>;
  findVersion(
    organizationId: string,
    modelId: string,
    version: number,
  ): Promise<MetricModelVersion | null>;
  findActiveVersion(organizationId: string, modelId: string): Promise<MetricModelVersion | null>;
  findLatestVersionNumber(organizationId: string, modelId: string): Promise<number>;
  createVersion(organizationId: string, input: CreateVersionInput): Promise<MetricModelVersion>;
  /** Substitui todos os itens e/ou o effective_from de um rascunho. */
  updateVersion(
    organizationId: string,
    versionId: string,
    patch: { items?: MetricModelItemWrite[]; effectiveFrom?: string | null },
  ): Promise<MetricModelVersion | null>;
  /** Na mesma transação: arquiva a versão ativa anterior e ativa esta. Nunca apaga nada. */
  activateVersion(
    organizationId: string,
    modelId: string,
    versionId: string,
    effectiveFrom: string,
  ): Promise<MetricModelVersion | null>;
  /** Quantas fotos de cliente apontam para esta versão. Zero = nada de histórico depende dela. */
  countVersionSnapshots(organizationId: string, versionId: string): Promise<number>;
  /**
   * Apaga um RASCUNHO e os itens dele. As tabelas que apontam para metric_model_versions têm
   * exclusão em cascata, por isso o filtro por status 'draft' fica na própria consulta: uma
   * versão ativa ou arquivada nunca é removida por engano. Devolve false se nada foi apagado.
   */
  deleteVersion(organizationId: string, modelId: string, versionId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Conversões linha → DTO
// ---------------------------------------------------------------------------

type DefinitionRow = typeof metricDefinitions.$inferSelect;
type ModelRow = typeof metricModels.$inferSelect;
type VersionRow = typeof metricModelVersions.$inferSelect;
type ItemRow = typeof metricModelItems.$inferSelect;

function toDefinition(row: DefinitionRow): MetricDefinition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    metricType: row.metricType,
    unit: row.unit,
    direction: row.direction,
    periodicity: row.periodicity,
    sourceType: row.sourceType,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toModel(row: ModelRow): MetricModel {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    mode: row.mode,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItem(row: ItemRow): MetricModelItem {
  return {
    id: row.id,
    metricModelVersionId: row.metricModelVersionId,
    metricDefinitionId: row.metricDefinitionId,
    weight: row.weight,
    currentWeight: row.currentWeight,
    trendWeight: row.trendWeight,
    persistenceWeight: row.persistenceWeight,
    normalizationStrategy: row.normalizationStrategy,
    normalizationConfig: row.normalizationConfigJson,
    thresholdConfig: row.thresholdConfigJson ?? null,
    criticalTriggerConfig: row.criticalTriggerConfigJson ?? null,
    formulaConfig: row.formulaConfigJson ?? null,
    sortOrder: row.sortOrder,
  };
}

function toVersion(row: VersionRow, items: ItemRow[]): MetricModelVersion {
  return {
    id: row.id,
    metricModelId: row.metricModelId,
    organizationId: row.organizationId,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effectiveFrom === null ? null : row.effectiveFrom.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(toItem),
  };
}

function toItemInsert(versionId: string, item: MetricModelItemWrite) {
  return {
    metricModelVersionId: versionId,
    metricDefinitionId: item.metricDefinitionId,
    weight: item.weight,
    currentWeight: item.currentWeight,
    trendWeight: item.trendWeight,
    persistenceWeight: item.persistenceWeight,
    normalizationStrategy: item.normalizationConfig.strategy,
    normalizationConfigJson: item.normalizationConfig,
    thresholdConfigJson: item.thresholdConfig,
    criticalTriggerConfigJson: item.criticalTriggerConfig,
    formulaConfigJson: item.formulaConfig,
    sortOrder: item.sortOrder,
  };
}

const DEFINITION_SORT: Record<ListMetricDefinitionsInput['sort'], AnyPgColumn> = {
  name: metricDefinitions.name,
  slug: metricDefinitions.slug,
  metricType: metricDefinitions.metricType,
  direction: metricDefinitions.direction,
  createdAt: metricDefinitions.createdAt,
  updatedAt: metricDefinitions.updatedAt,
};

const MODEL_SORT: Record<ListMetricModelsInput['sort'], AnyPgColumn> = {
  name: metricModels.name,
  createdAt: metricModels.createdAt,
  updatedAt: metricModels.updatedAt,
};

const EMPTY_USAGE: DefinitionUsage = { total: 0, byStatus: { draft: 0, active: 0, archived: 0 } };

export function createMetricsRepository(getDb: () => Database): MetricsRepository {
  async function loadVersions(rows: VersionRow[]): Promise<MetricModelVersion[]> {
    if (rows.length === 0) return [];
    const items = await getDb()
      .select()
      .from(metricModelItems)
      .where(
        inArray(
          metricModelItems.metricModelVersionId,
          rows.map((r) => r.id),
        ),
      );
    const byVersion = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = byVersion.get(item.metricModelVersionId) ?? [];
      list.push(item);
      byVersion.set(item.metricModelVersionId, list);
    }
    return rows.map((row) => toVersion(row, byVersion.get(row.id) ?? []));
  }

  const repository: MetricsRepository = {
    async listDefinitions(organizationId, query) {
      const conditions: SQL[] = [eq(metricDefinitions.organizationId, organizationId)];
      if (query.search !== undefined && query.search !== '') {
        const pattern = `%${query.search}%`;
        conditions.push(
          or(ilike(metricDefinitions.name, pattern), ilike(metricDefinitions.slug, pattern)) as SQL,
        );
      }
      if (query.type !== undefined) conditions.push(eq(metricDefinitions.metricType, query.type));
      if (query.direction !== undefined) {
        conditions.push(eq(metricDefinitions.direction, query.direction));
      }
      if (query.source !== undefined) {
        conditions.push(eq(metricDefinitions.sourceType, query.source));
      }
      if (query.is_active !== undefined) {
        conditions.push(eq(metricDefinitions.isActive, query.is_active));
      }
      const where = and(...conditions);
      const orderBy = query.order === 'desc' ? desc : asc;
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(metricDefinitions)
          .where(where)
          .orderBy(orderBy(DEFINITION_SORT[query.sort]), asc(metricDefinitions.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(metricDefinitions).where(where),
      ]);
      return { items: rows.map(toDefinition), total: totals[0]?.total ?? 0 };
    },

    async findDefinitionById(organizationId, id) {
      const rows = await getDb()
        .select()
        .from(metricDefinitions)
        .where(
          and(eq(metricDefinitions.organizationId, organizationId), eq(metricDefinitions.id, id)),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDefinition(row);
    },

    async findDefinitionBySlug(organizationId, slug) {
      const rows = await getDb()
        .select()
        .from(metricDefinitions)
        .where(
          and(
            eq(metricDefinitions.organizationId, organizationId),
            eq(metricDefinitions.slug, slug),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDefinition(row);
    },

    async findDefinitionsByIds(organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await getDb()
        .select()
        .from(metricDefinitions)
        .where(
          and(
            eq(metricDefinitions.organizationId, organizationId),
            inArray(metricDefinitions.id, [...ids]),
          ),
        );
      return rows.map(toDefinition);
    },

    async createDefinition(organizationId, input) {
      const rows = await getDb()
        .insert(metricDefinitions)
        .values({ ...input, organizationId })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao criar a definição de métrica.');
      return toDefinition(row);
    },

    async updateDefinition(organizationId, id, patch) {
      const values: Partial<typeof metricDefinitions.$inferInsert> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          (values as Record<string, unknown>)[key] = value;
        }
      }
      const rows = await getDb()
        .update(metricDefinitions)
        .set(values)
        .where(
          and(eq(metricDefinitions.organizationId, organizationId), eq(metricDefinitions.id, id)),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toDefinition(row);
    },

    async deleteDefinition(organizationId, id) {
      const rows = await getDb()
        .delete(metricDefinitions)
        .where(
          and(eq(metricDefinitions.organizationId, organizationId), eq(metricDefinitions.id, id)),
        )
        .returning({ id: metricDefinitions.id });
      return rows.length > 0;
    },

    async countDefinitionUsage(organizationId, id) {
      const rows = await getDb()
        .select({ status: metricModelVersions.status, total: count() })
        .from(metricModelItems)
        .innerJoin(
          metricModelVersions,
          eq(metricModelVersions.id, metricModelItems.metricModelVersionId),
        )
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelItems.metricDefinitionId, id),
          ),
        )
        .groupBy(metricModelVersions.status);
      const usage: DefinitionUsage = { total: 0, byStatus: { ...EMPTY_USAGE.byStatus } };
      for (const row of rows) {
        usage.byStatus[row.status as MetricModelVersionStatus] = row.total;
        usage.total += row.total;
      }
      return usage;
    },

    async findActivePlacements(organizationId, definitionIds) {
      if (definitionIds.length === 0) return [];
      const rows = await getDb()
        .select({
          item: metricModelItems,
          version: metricModelVersions.version,
          modelId: metricModels.id,
          modelName: metricModels.name,
          modelCreatedAt: metricModels.createdAt,
        })
        .from(metricModelItems)
        .innerJoin(
          metricModelVersions,
          eq(metricModelVersions.id, metricModelItems.metricModelVersionId),
        )
        .innerJoin(metricModels, eq(metricModels.id, metricModelVersions.metricModelId))
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelVersions.status, 'active'),
            eq(metricModels.isActive, true),
            inArray(metricModelItems.metricDefinitionId, [...definitionIds]),
          ),
        )
        .orderBy(asc(metricModels.createdAt), asc(metricModels.id));
      const placements = new Map<string, ActivePlacement>();
      for (const row of rows) {
        if (placements.has(row.item.metricDefinitionId)) continue;
        placements.set(row.item.metricDefinitionId, {
          metricDefinitionId: row.item.metricDefinitionId,
          modelId: row.modelId,
          modelName: row.modelName,
          version: row.version,
          weight: row.item.weight,
          sortOrder: row.item.sortOrder,
          normalizationStrategy: row.item.normalizationStrategy,
          item: toItem(row.item),
        });
      }
      return [...placements.values()];
    },

    async listModels(organizationId, query) {
      const conditions: SQL[] = [eq(metricModels.organizationId, organizationId)];
      if (query.search !== undefined && query.search !== '') {
        conditions.push(ilike(metricModels.name, `%${query.search}%`));
      }
      if (query.is_active !== undefined)
        conditions.push(eq(metricModels.isActive, query.is_active));
      const where = and(...conditions);
      const orderBy = query.order === 'desc' ? desc : asc;
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(metricModels)
          .where(where)
          .orderBy(orderBy(MODEL_SORT[query.sort]), asc(metricModels.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(metricModels).where(where),
      ]);
      return { items: rows.map(toModel), total: totals[0]?.total ?? 0 };
    },

    async findModelById(organizationId, id) {
      const rows = await getDb()
        .select()
        .from(metricModels)
        .where(and(eq(metricModels.organizationId, organizationId), eq(metricModels.id, id)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toModel(row);
    },

    async createModel(organizationId, input) {
      const rows = await getDb()
        .insert(metricModels)
        .values({ ...input, organizationId })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao criar o modelo de métricas.');
      return toModel(row);
    },

    async listVersions(organizationId, modelId) {
      const rows = await getDb()
        .select()
        .from(metricModelVersions)
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelVersions.metricModelId, modelId),
          ),
        )
        .orderBy(desc(metricModelVersions.version));
      return loadVersions(rows);
    },

    async findVersion(organizationId, modelId, version) {
      const rows = await getDb()
        .select()
        .from(metricModelVersions)
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelVersions.metricModelId, modelId),
            eq(metricModelVersions.version, version),
          ),
        )
        .limit(1);
      return (await loadVersions(rows))[0] ?? null;
    },

    async findActiveVersion(organizationId, modelId) {
      const rows = await getDb()
        .select()
        .from(metricModelVersions)
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelVersions.metricModelId, modelId),
            eq(metricModelVersions.status, 'active'),
          ),
        )
        .limit(1);
      return (await loadVersions(rows))[0] ?? null;
    },

    async findLatestVersionNumber(organizationId, modelId) {
      const rows = await getDb()
        .select({ latest: sql<number>`coalesce(max(${metricModelVersions.version}), 0)` })
        .from(metricModelVersions)
        .where(
          and(
            eq(metricModelVersions.organizationId, organizationId),
            eq(metricModelVersions.metricModelId, modelId),
          ),
        );
      return Number(rows[0]?.latest ?? 0);
    },

    async createVersion(organizationId, input) {
      return getDb().transaction(async (tx) => {
        const inserted = await tx
          .insert(metricModelVersions)
          .values({
            metricModelId: input.metricModelId,
            organizationId,
            version: input.version,
            status: input.status,
            effectiveFrom: input.effectiveFrom === null ? null : new Date(input.effectiveFrom),
          })
          .returning();
        const row = inserted[0];
        if (row === undefined) throw new Error('Falha ao criar a versão do modelo.');
        let items: ItemRow[] = [];
        if (input.items.length > 0) {
          items = await tx
            .insert(metricModelItems)
            .values(input.items.map((item) => toItemInsert(row.id, item)))
            .returning();
        }
        return toVersion(row, items);
      });
    },

    async updateVersion(organizationId, versionId, patch) {
      return getDb().transaction(async (tx) => {
        const values: Partial<typeof metricModelVersions.$inferInsert> = {};
        if (patch.effectiveFrom !== undefined) {
          values.effectiveFrom =
            patch.effectiveFrom === null ? null : new Date(patch.effectiveFrom);
        }
        const where = and(
          eq(metricModelVersions.organizationId, organizationId),
          eq(metricModelVersions.id, versionId),
        );
        const rows =
          Object.keys(values).length > 0
            ? await tx.update(metricModelVersions).set(values).where(where).returning()
            : await tx.select().from(metricModelVersions).where(where).limit(1);
        const row = rows[0];
        if (row === undefined) return null;
        let items: ItemRow[];
        if (patch.items !== undefined) {
          await tx
            .delete(metricModelItems)
            .where(eq(metricModelItems.metricModelVersionId, row.id));
          items =
            patch.items.length > 0
              ? await tx
                  .insert(metricModelItems)
                  .values(patch.items.map((item) => toItemInsert(row.id, item)))
                  .returning()
              : [];
        } else {
          items = await tx
            .select()
            .from(metricModelItems)
            .where(eq(metricModelItems.metricModelVersionId, row.id));
        }
        return toVersion(row, items);
      });
    },

    async countVersionSnapshots(organizationId, versionId) {
      const [row] = await getDb()
        .select({ total: count() })
        .from(clientScoreSnapshots)
        .where(
          and(
            eq(clientScoreSnapshots.organizationId, organizationId),
            eq(clientScoreSnapshots.metricModelVersionId, versionId),
          ),
        );
      return row?.total ?? 0;
    },

    async deleteVersion(organizationId, modelId, versionId) {
      return getDb().transaction(async (tx) => {
        const rows = await tx
          .delete(metricModelVersions)
          .where(
            and(
              eq(metricModelVersions.organizationId, organizationId),
              eq(metricModelVersions.metricModelId, modelId),
              eq(metricModelVersions.id, versionId),
              eq(metricModelVersions.status, 'draft'),
            ),
          )
          .returning({ id: metricModelVersions.id });
        if (rows.length === 0) return false;
        await tx
          .update(metricModels)
          .set({ updatedAt: new Date() })
          .where(
            and(eq(metricModels.organizationId, organizationId), eq(metricModels.id, modelId)),
          );
        return true;
      });
    },

    async activateVersion(organizationId, modelId, versionId, effectiveFrom) {
      return getDb().transaction(async (tx) => {
        await tx
          .update(metricModelVersions)
          .set({ status: 'archived' })
          .where(
            and(
              eq(metricModelVersions.organizationId, organizationId),
              eq(metricModelVersions.metricModelId, modelId),
              eq(metricModelVersions.status, 'active'),
            ),
          );
        const rows = await tx
          .update(metricModelVersions)
          .set({ status: 'active', effectiveFrom: new Date(effectiveFrom) })
          .where(
            and(
              eq(metricModelVersions.organizationId, organizationId),
              eq(metricModelVersions.id, versionId),
            ),
          )
          .returning();
        await tx
          .update(metricModels)
          .set({ updatedAt: new Date() })
          .where(
            and(eq(metricModels.organizationId, organizationId), eq(metricModels.id, modelId)),
          );
        const row = rows[0];
        if (row === undefined) return null;
        const items = await tx
          .select()
          .from(metricModelItems)
          .where(eq(metricModelItems.metricModelVersionId, row.id));
        return toVersion(row, items);
      });
    },
  };

  return repository;
}
