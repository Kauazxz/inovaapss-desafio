/**
 * Chamadas de /api/v1/metric-models (§37) com TanStack Query. Os tipos são os DTOs de
 * @inovaapss/shared — os mesmos que a API devolve.
 *
 * A lista de modelos (GET /metric-models) não traz versões; o configurador precisa da versão
 * ativa de cada modelo para mostrar quantas métricas e quanto somam os pesos, então
 * `useMetricModelsWithVersions` busca o detalhe de cada modelo da página em paralelo.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  MetricDefinitionDto,
  MetricModelDto,
  MetricModelVersionDto,
  RebalanceProposalDto,
  WeightMode,
} from '@inovaapss/shared';
import type {
  CreateMetricModelBody,
  MetricModelItemBody,
  RebalanceMetricModelBody,
} from '@inovaapss/validation';

import { apiFetch } from '@/lib/api';

export interface MetricModelsListResponse {
  items: MetricModelDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MetricModelDetail {
  model: MetricModelDto;
  versions: MetricModelVersionDto[];
}

/** Quantos modelos a tela pede de uma vez (uma organização tem poucos). */
const MODELS_PAGE_SIZE = 50;

export function fetchMetricModels(): Promise<MetricModelsListResponse> {
  return apiFetch<MetricModelsListResponse>(
    `/api/v1/metric-models?page=1&pageSize=${MODELS_PAGE_SIZE}`,
  );
}

export function fetchMetricModel(id: string): Promise<MetricModelDetail> {
  return apiFetch<MetricModelDetail>(`/api/v1/metric-models/${id}`);
}

export function createMetricModel(
  body: CreateMetricModelBody,
): Promise<{ model: MetricModelDto; versions: MetricModelVersionDto[] }> {
  return apiFetch('/api/v1/metric-models', { method: 'POST', json: body });
}

export interface CreateVersionVars {
  modelId: string;
  /** Sem `items`, a API copia a versão ativa para o novo rascunho. */
  items?: MetricModelItemBody[];
}

export function createMetricModelVersion({
  modelId,
  items,
}: CreateVersionVars): Promise<{ version: MetricModelVersionDto }> {
  return apiFetch(`/api/v1/metric-models/${modelId}/versions`, {
    method: 'POST',
    json: items === undefined ? {} : { items },
  });
}

export interface UpdateVersionVars {
  modelId: string;
  version: number;
  items: MetricModelItemBody[];
}

export function updateMetricModelVersion({
  modelId,
  version,
  items,
}: UpdateVersionVars): Promise<{ version: MetricModelVersionDto }> {
  return apiFetch(`/api/v1/metric-models/${modelId}/versions/${version}`, {
    method: 'PATCH',
    json: { items },
  });
}

export interface ActivateVersionVars {
  modelId: string;
  version: number;
}

export function activateMetricModelVersion({
  modelId,
  version,
}: ActivateVersionVars): Promise<{ version: MetricModelVersionDto }> {
  return apiFetch(`/api/v1/metric-models/${modelId}/versions/${version}/activate`, {
    method: 'POST',
    json: {},
  });
}

/**
 * Joga fora um rascunho. A API só aceita rascunho: a versão em vigor pontua a carteira e a
 * arquivada é o histórico, então as duas respondem 409 (§31, §41).
 */
export function discardMetricModelVersion({
  modelId,
  version,
}: ActivateVersionVars): Promise<void> {
  return apiFetch(`/api/v1/metric-models/${modelId}/versions/${version}`, { method: 'DELETE' });
}

export interface RebalanceVars {
  modelId: string;
  body: RebalanceMetricModelBody;
}

export function rebalanceMetricModel({
  modelId,
  body,
}: RebalanceVars): Promise<RebalanceProposalDto> {
  return apiFetch(`/api/v1/metric-models/${modelId}/rebalance`, { method: 'POST', json: body });
}

export const metricModelsKeys = {
  all: ['metric-models'] as const,
  list: () => ['metric-models', 'list'] as const,
  detail: (id: string) => ['metric-models', 'detail', id] as const,
  definitions: () => ['metric-models', 'definitions'] as const,
};

/** Teto de itens por página aceito pela API (§61). Pedir mais que isso devolve 400. */
const DEFINITIONS_PAGE_SIZE = 100;
/** Trava de segurança: evita laço infinito se a API devolver um `total` incoerente. */
const DEFINITIONS_MAX_PAGES = 20;

export interface MetricDefinitionsResponse {
  items: MetricDefinitionDto[];
  total: number;
}

/**
 * Todas as definições da organização. O configurador precisa delas para dois motivos: mostrar
 * nome, tipo e direção de cada linha e saber quais estão ATIVAS — só os pesos das ativas entram
 * na soma que precisa fechar 100 % (§41).
 */
export async function fetchAllMetricDefinitions(): Promise<MetricDefinitionsResponse> {
  const items: MetricDefinitionDto[] = [];
  let total = 0;
  for (let page = 1; page <= DEFINITIONS_MAX_PAGES; page += 1) {
    const resposta = await apiFetch<MetricDefinitionsResponse>(
      `/api/v1/metrics?page=${page}&pageSize=${DEFINITIONS_PAGE_SIZE}&sort=name`,
    );
    items.push(...resposta.items);
    total = resposta.total;
    if (items.length >= total || resposta.items.length < DEFINITIONS_PAGE_SIZE) break;
  }
  return { items, total };
}

export function useAllMetricDefinitions() {
  return useQuery({
    queryKey: metricModelsKeys.definitions(),
    queryFn: fetchAllMetricDefinitions,
  });
}

export function useMetricModels() {
  return useQuery({ queryKey: metricModelsKeys.list(), queryFn: fetchMetricModels });
}

export function useMetricModel(id: string | undefined) {
  return useQuery({
    queryKey: metricModelsKeys.detail(id ?? ''),
    queryFn: () => fetchMetricModel(id as string),
    enabled: id !== undefined,
  });
}

/** Resumo de um modelo na lista (§41): versão ativa, modo, nº de métricas e soma dos pesos. */
export interface MetricModelSummary {
  model: MetricModelDto;
  mode: WeightMode;
  /** `null` enquanto o detalhe do modelo carrega ou falha. */
  detail: MetricModelDetail | null;
  isPending: boolean;
}

/** Lista de modelos + o detalhe de cada um (para a versão ativa e a soma dos pesos). */
export function useMetricModelsWithVersions(): {
  list: ReturnType<typeof useMetricModels>;
  summaries: MetricModelSummary[];
} {
  const list = useMetricModels();
  const models = list.data?.items ?? [];
  const details = useQueries({
    queries: models.map((model) => ({
      queryKey: metricModelsKeys.detail(model.id),
      queryFn: () => fetchMetricModel(model.id),
    })),
  });
  const summaries = models.map((model, index) => {
    const query = details[index];
    return {
      model,
      mode: model.mode,
      detail: query?.data ?? null,
      isPending: query?.isPending ?? true,
    };
  });
  return { list, summaries };
}

function invalidator(queryClient: ReturnType<typeof useQueryClient>) {
  return () => {
    void queryClient.invalidateQueries({ queryKey: metricModelsKeys.all });
  };
}

export function useCreateMetricModel() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createMetricModel, onSuccess: invalidator(queryClient) });
}

export function useCreateMetricModelVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMetricModelVersion,
    onSuccess: invalidator(queryClient),
  });
}

export function useUpdateMetricModelVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMetricModelVersion,
    onSuccess: invalidator(queryClient),
  });
}

export function useActivateMetricModelVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activateMetricModelVersion,
    onSuccess: invalidator(queryClient),
  });
}

export function useDiscardMetricModelVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discardMetricModelVersion,
    onSuccess: invalidator(queryClient),
  });
}

/** §41 — a redistribuição é sempre uma PROPOSTA: a API não salva nada. */
export function useRebalanceMetricModel() {
  return useMutation({ mutationFn: rebalanceMetricModel });
}
