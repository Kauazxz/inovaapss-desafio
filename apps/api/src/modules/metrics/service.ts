/**
 * Casos de uso do motor de métricas (§6, §31, §32, §37, §41):
 *
 * - definições: CRUD; apagar só quando nunca usada, senão desativa (histórico é sagrado, §31);
 * - modelos e versões: rascunho → ativação com soma 100 % entre as métricas ativas
 *   (nunca redistribui em silêncio, §41); a versão ativa anterior é arquivada, nunca apagada;
 *   versões ativas/arquivadas são imutáveis;
 * - rebalance: devolve uma PROPOSTA proporcional, não salva;
 * - preview-score: chama o motor de verdade sobre valores de exemplo.
 *
 * Toda configuração de item passa pelo Zod (controller) e pelo motor (assertEvaluableConfig).
 */
import type { MetricScore } from '@inovaapss/engine';
import type {
  DeleteMetricDefinitionResultDto,
  MetricDefinitionDetailDto,
  MetricDefinitionListItemDto,
  RebalanceProposalDto,
} from '@inovaapss/shared';
import {
  proposeRebalancedWeights,
  validateVersionWeights,
  type WeightedItem,
  type ActivateMetricModelVersionBody,
  type CreateMetricModelVersionBody,
  type PreviewScoreBody,
  type RebalanceMetricModelBody,
  type UpdateMetricModelVersionBody,
} from '@inovaapss/validation';

import { assertEvaluableConfig, previewScore } from './engine-mapping.js';
import { ConflictError } from '../../middleware/http-errors.js';
import { AppError, NotFoundError } from '../../shared/errors.js';

import type { MetricsRepository } from './repository.js';
import type {
  CreateMetricDefinitionInput,
  CreateMetricModelInput,
  ListMetricDefinitionsInput,
  ListMetricModelsInput,
  MetricDefinition,
  MetricModel,
  MetricModelItemInput,
  MetricModelItemWrite,
  MetricModelVersion,
  PagedResult,
  UpdateMetricDefinitionInput,
} from './types.js';
import type { TenantContext } from '../../middleware/tenant.js';

export interface MetricsService {
  listDefinitions(
    tenant: TenantContext,
    query: ListMetricDefinitionsInput,
  ): Promise<PagedResult<MetricDefinitionListItemDto>>;
  getDefinition(tenant: TenantContext, id: string): Promise<MetricDefinitionDetailDto>;
  createDefinition(
    tenant: TenantContext,
    input: CreateMetricDefinitionInput,
  ): Promise<MetricDefinition>;
  updateDefinition(
    tenant: TenantContext,
    id: string,
    patch: UpdateMetricDefinitionInput,
  ): Promise<MetricDefinition>;
  deleteDefinition(tenant: TenantContext, id: string): Promise<DeleteMetricDefinitionResultDto>;
  previewScore(tenant: TenantContext, id: string, body: PreviewScoreBody): Promise<MetricScore>;

  listModels(
    tenant: TenantContext,
    query: ListMetricModelsInput,
  ): Promise<PagedResult<MetricModel>>;
  createModel(tenant: TenantContext, input: CreateMetricModelInput): Promise<MetricModel>;
  getModel(
    tenant: TenantContext,
    id: string,
  ): Promise<{ model: MetricModel; versions: MetricModelVersion[] }>;
  createVersion(
    tenant: TenantContext,
    modelId: string,
    body: CreateMetricModelVersionBody,
  ): Promise<MetricModelVersion>;
  updateVersion(
    tenant: TenantContext,
    modelId: string,
    version: number,
    body: UpdateMetricModelVersionBody,
  ): Promise<MetricModelVersion>;
  activateVersion(
    tenant: TenantContext,
    modelId: string,
    version: number,
    body: ActivateMetricModelVersionBody,
  ): Promise<MetricModelVersion>;
  /** Joga fora um rascunho. Só rascunho: versão em vigor e arquivada são história. */
  discardVersion(tenant: TenantContext, modelId: string, version: number): Promise<void>;
  rebalance(
    tenant: TenantContext,
    modelId: string,
    body: RebalanceMetricModelBody,
  ): Promise<RebalanceProposalDto>;
}

/** Código do Postgres para violação de unique (slug repetido numa corrida). */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function slugTaken(): ConflictError {
  return new ConflictError('Já existe uma métrica com esta chave na organização.', 'SLUG_TAKEN');
}

export class VersionNotEditableError extends AppError {
  constructor(status: string) {
    super(
      409,
      'VERSION_NOT_EDITABLE',
      `Só rascunhos podem ser editados; esta versão está "${status}". Crie uma nova versão.`,
    );
    this.name = 'VersionNotEditableError';
  }
}

export class WeightsSumError extends AppError {
  constructor(message: string, details: unknown) {
    super(422, 'WEIGHTS_MUST_SUM_100', message, details);
    this.name = 'WeightsSumError';
  }
}

export function createMetricsService(repository: MetricsRepository): MetricsService {
  function definitionNotFound(): NotFoundError {
    return new NotFoundError('Métrica não encontrada.');
  }
  function modelNotFound(): NotFoundError {
    return new NotFoundError('Modelo de métricas não encontrado.');
  }
  function versionNotFound(): NotFoundError {
    return new NotFoundError('Versão do modelo não encontrada.');
  }

  async function requireDefinition(tenant: TenantContext, id: string): Promise<MetricDefinition> {
    const definition = await repository.findDefinitionById(tenant.organizationId, id);
    if (definition === null) throw definitionNotFound();
    return definition;
  }

  async function requireModel(tenant: TenantContext, id: string): Promise<MetricModel> {
    const model = await repository.findModelById(tenant.organizationId, id);
    if (model === null) throw modelNotFound();
    return model;
  }

  async function requireVersion(
    tenant: TenantContext,
    modelId: string,
    version: number,
  ): Promise<MetricModelVersion> {
    const found = await repository.findVersion(tenant.organizationId, modelId, version);
    if (found === null) throw versionNotFound();
    return found;
  }

  /**
   * Confere que cada item aponta para uma definição DA organização (isolamento, §5) e que a
   * configuração é avaliável pelo motor. Devolve os itens prontos para gravar, com sortOrder
   * preenchido pela ordem de chegada quando ausente.
   */
  async function prepareItems(
    tenant: TenantContext,
    items: MetricModelItemInput[],
  ): Promise<{ writes: MetricModelItemWrite[]; definitions: Map<string, MetricDefinition> }> {
    const ids = items.map((item) => item.metricDefinitionId);
    const definitions = await repository.findDefinitionsByIds(tenant.organizationId, ids);
    const byId = new Map(definitions.map((d) => [d.id, d]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new AppError(
        400,
        'UNKNOWN_METRIC_DEFINITION',
        'Uma ou mais métricas do modelo não existem nesta organização.',
        { metricDefinitionIds: missing },
      );
    }
    const writes = items.map((item, index) => {
      const write: MetricModelItemWrite = {
        metricDefinitionId: item.metricDefinitionId,
        weight: item.weight,
        currentWeight: item.currentWeight,
        trendWeight: item.trendWeight,
        persistenceWeight: item.persistenceWeight,
        normalizationConfig: item.normalization,
        thresholdConfig: item.thresholds,
        criticalTriggerConfig: item.triggers,
        formulaConfig: item.formula,
        sortOrder: item.sortOrder ?? index + 1,
      };
      assertEvaluableConfig(byId.get(item.metricDefinitionId) as MetricDefinition, write);
      return write;
    });
    return { writes, definitions: byId };
  }

  function toWeighted(
    version: MetricModelVersion,
    definitions: Map<string, MetricDefinition>,
  ): WeightedItem[] {
    return version.items.map((item) => ({
      metricDefinitionId: item.metricDefinitionId,
      weight: item.weight,
      isActive: definitions.get(item.metricDefinitionId)?.isActive ?? false,
    }));
  }

  async function definitionsOf(
    tenant: TenantContext,
    version: MetricModelVersion,
  ): Promise<Map<string, MetricDefinition>> {
    const list = await repository.findDefinitionsByIds(
      tenant.organizationId,
      version.items.map((item) => item.metricDefinitionId),
    );
    return new Map(list.map((d) => [d.id, d]));
  }

  return {
    async listDefinitions(tenant, query) {
      const page = await repository.listDefinitions(tenant.organizationId, query);
      const placements = await repository.findActivePlacements(
        tenant.organizationId,
        page.items.map((d) => d.id),
      );
      const byDefinition = new Map(placements.map((p) => [p.metricDefinitionId, p]));
      return {
        total: page.total,
        items: page.items.map((definition) => {
          const placement = byDefinition.get(definition.id);
          return {
            ...definition,
            activePlacement:
              placement === undefined
                ? null
                : {
                    modelId: placement.modelId,
                    modelName: placement.modelName,
                    version: placement.version,
                    weight: placement.weight,
                    sortOrder: placement.sortOrder,
                    normalizationStrategy: placement.normalizationStrategy,
                  },
          };
        }),
      };
    },

    async getDefinition(tenant, id) {
      const definition = await requireDefinition(tenant, id);
      const [placement] = await repository.findActivePlacements(tenant.organizationId, [id]);
      return {
        definition,
        activeItem: placement?.item ?? null,
        activeModel:
          placement === undefined
            ? null
            : { id: placement.modelId, name: placement.modelName, version: placement.version },
      };
    },

    async createDefinition(tenant, input) {
      if ((await repository.findDefinitionBySlug(tenant.organizationId, input.slug)) !== null) {
        throw slugTaken();
      }
      try {
        return await repository.createDefinition(tenant.organizationId, input);
      } catch (err) {
        if (isUniqueViolation(err)) throw slugTaken();
        throw err;
      }
    },

    async updateDefinition(tenant, id, patch) {
      await requireDefinition(tenant, id);
      if (patch.slug !== undefined) {
        const other = await repository.findDefinitionBySlug(tenant.organizationId, patch.slug);
        if (other !== null && other.id !== id) throw slugTaken();
      }
      try {
        const updated = await repository.updateDefinition(tenant.organizationId, id, patch);
        if (updated === null) throw definitionNotFound();
        return updated;
      } catch (err) {
        if (isUniqueViolation(err)) throw slugTaken();
        throw err;
      }
    },

    async deleteDefinition(tenant, id) {
      await requireDefinition(tenant, id);
      const usage = await repository.countDefinitionUsage(tenant.organizationId, id);
      if (usage.total === 0) {
        await repository.deleteDefinition(tenant.organizationId, id);
        return { outcome: 'deleted', definition: null };
      }
      // Usada em alguma versão (ativa, arquivada ou rascunho): o histórico fica; só desativa.
      const definition = await repository.updateDefinition(tenant.organizationId, id, {
        isActive: false,
      });
      return { outcome: 'deactivated', definition };
    },

    async previewScore(tenant, id, body) {
      const definition = await requireDefinition(tenant, id);
      return previewScore({
        definition,
        item: {
          weight: body.item.weight,
          currentWeight: body.item.currentWeight,
          trendWeight: body.item.trendWeight,
          persistenceWeight: body.item.persistenceWeight,
          normalizationConfig: body.item.normalization,
          thresholdConfig: body.item.thresholds,
          criticalTriggerConfig: body.item.triggers,
          formulaConfig: body.item.formula,
        },
        series: body.series.map((p) => ({
          periodEnd: p.periodEnd,
          value: p.value,
          text: p.text ?? null,
        })),
        extra: body.extra,
        periodLabel: body.periodLabel,
      });
    },

    async listModels(tenant, query) {
      return repository.listModels(tenant.organizationId, query);
    },

    async createModel(tenant, input) {
      return repository.createModel(tenant.organizationId, input);
    },

    async getModel(tenant, id) {
      const model = await requireModel(tenant, id);
      const versions = await repository.listVersions(tenant.organizationId, id);
      return { model, versions };
    },

    async createVersion(tenant, modelId, body) {
      await requireModel(tenant, modelId);
      let writes: MetricModelItemWrite[];
      if (body.items !== undefined) {
        writes = (await prepareItems(tenant, body.items)).writes;
      } else {
        // Sem itens no corpo: o rascunho nasce como cópia da versão ativa (ou vazio).
        const active = await repository.findActiveVersion(tenant.organizationId, modelId);
        writes =
          active === null
            ? []
            : active.items.map((item) => ({
                metricDefinitionId: item.metricDefinitionId,
                weight: item.weight,
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
      }
      const latest = await repository.findLatestVersionNumber(tenant.organizationId, modelId);
      return repository.createVersion(tenant.organizationId, {
        metricModelId: modelId,
        version: latest + 1,
        status: 'draft',
        effectiveFrom: body.effectiveFrom ?? null,
        items: writes,
      });
    },

    async updateVersion(tenant, modelId, version, body) {
      await requireModel(tenant, modelId);
      const current = await requireVersion(tenant, modelId, version);
      if (current.status !== 'draft') throw new VersionNotEditableError(current.status);
      const patch: { items?: MetricModelItemWrite[]; effectiveFrom?: string | null } = {};
      if (body.items !== undefined) patch.items = (await prepareItems(tenant, body.items)).writes;
      if (body.effectiveFrom !== undefined) patch.effectiveFrom = body.effectiveFrom;
      const updated = await repository.updateVersion(tenant.organizationId, current.id, patch);
      if (updated === null) throw versionNotFound();
      return updated;
    },

    async activateVersion(tenant, modelId, version, body) {
      await requireModel(tenant, modelId);
      const current = await requireVersion(tenant, modelId, version);
      if (current.status === 'active') {
        throw new ConflictError('Esta versão já é a ativa.', 'VERSION_ALREADY_ACTIVE');
      }
      if (current.status === 'archived') {
        throw new ConflictError(
          'Versão arquivada não volta a ser ativa: crie um rascunho a partir dela.',
          'VERSION_ARCHIVED',
        );
      }
      const definitions = await definitionsOf(tenant, current);
      const check = validateVersionWeights(toWeighted(current, definitions));
      if (!check.ok) {
        throw new WeightsSumError(
          `Os pesos das métricas ativas precisam somar 100 % para ativar. ${check.message}`,
          { total: check.total, difference: check.difference, activeCount: check.activeCount },
        );
      }
      const activated = await repository.activateVersion(
        tenant.organizationId,
        modelId,
        current.id,
        body.effectiveFrom ?? new Date().toISOString(),
      );
      if (activated === null) throw versionNotFound();
      return activated;
    },

    async discardVersion(tenant, modelId, version) {
      await requireModel(tenant, modelId);
      const current = await requireVersion(tenant, modelId, version);
      if (current.status === 'active') {
        throw new ConflictError(
          'A versão em vigor não pode ser descartada. Ative outra antes.',
          'VERSION_ACTIVE',
        );
      }
      if (current.status === 'archived') {
        throw new ConflictError(
          'Versão arquivada faz parte do histórico e não é descartada.',
          'VERSION_ARCHIVED',
        );
      }
      // Quem aponta para a versão apaga em cascata. Rascunho não pontua, mas conferimos
      // assim mesmo: nenhum histórico pode sumir junto com um descarte.
      const comScore = await repository.countVersionSnapshots(tenant.organizationId, current.id);
      if (comScore > 0) {
        throw new ConflictError(
          'Esta versão já gerou pontuação e por isso faz parte do histórico.',
          'VERSION_HAS_SCORES',
        );
      }
      const apagada = await repository.deleteVersion(tenant.organizationId, modelId, current.id);
      if (!apagada) throw versionNotFound();
    },

    async rebalance(tenant, modelId, body) {
      await requireModel(tenant, modelId);
      let weighted: WeightedItem[];
      if (body.items !== undefined) {
        const ids = body.items.map((i) => i.metricDefinitionId);
        const definitions = await repository.findDefinitionsByIds(tenant.organizationId, ids);
        const byId = new Map(definitions.map((d) => [d.id, d]));
        weighted = body.items.map((item) => ({
          metricDefinitionId: item.metricDefinitionId,
          weight: item.weight,
          isActive: byId.get(item.metricDefinitionId)?.isActive ?? false,
        }));
      } else {
        let version: MetricModelVersion | null;
        if (body.version !== undefined) {
          version = await requireVersion(tenant, modelId, body.version);
        } else {
          // Sem versão indicada: o rascunho mais recente, senão a ativa.
          const versions = await repository.listVersions(tenant.organizationId, modelId);
          version =
            versions.find((v) => v.status === 'draft') ??
            versions.find((v) => v.status === 'active') ??
            null;
        }
        if (version === null) {
          throw new NotFoundError('O modelo ainda não tem versão para rebalancear.');
        }
        weighted = toWeighted(version, await definitionsOf(tenant, version));
      }
      const proposal = proposeRebalancedWeights(weighted);
      return {
        rows: proposal.rows,
        currentTotal: proposal.currentTotal,
        proposedTotal: proposal.proposedTotal,
        saved: false,
      };
    },
  };
}
