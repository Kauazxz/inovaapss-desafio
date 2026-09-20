/**
 * §38 /metrics — a tela única das métricas.
 *
 * Antes eram duas: /metrics listava o cadastro e /metric-models guardava peso, ordem e
 * normalização de cada versão. Quem configura não pensa assim — pensa "esta métrica pesa
 * demais", olhando a linha inteira. Então a tabela do §41 virou o lugar onde se muda tudo:
 *
 *   — Ativa, Métrica, Tipo e Direção são o CADASTRO: PATCH /metrics/:id, salva na hora.
 *   — Ordem, Peso final e Normalização são o MODELO: viram um rascunho local e só passam a
 *     valer quando alguém publica, porque mudam o score de toda a carteira (§32, §41).
 *
 * A faixa do modelo, no alto, é o que sobrou da outra tela: versão em vigor, soma dos pesos e
 * o botão de publicar. O resto (gatilhos, faixas, histórico de versões, redistribuição) segue
 * em /metric-models/:id, a um clique de "Configuração avançada".
 */
import { Plus, Search, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  METRIC_SOURCE_LABELS,
  METRIC_SOURCES,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  type MetricModelVersionDto,
} from '@inovaapss/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAllMetricDefinitions, useMetricModelsWithVersions } from '@/features/metric-models/api';
import {
  compareDraftWithVersion,
  draftToItems,
  versionToDraft,
  weightsCheck,
  type DraftItem,
} from '@/features/metric-models/draft';
import { cn } from '@/lib/utils';

import { DEFAULT_METRICS_QUERY, useMetrics, useUpdateMetric, type MetricsListQuery } from './api';
import { MetricFormDialog } from './MetricFormDialog';
import { MetricsEmpty, MetricsError, MetricsLoading } from './MetricsStates';
import { MetricsTable } from './MetricsTable';
import {
  definitionsById,
  excludeFromDraft,
  includeInDraft,
  moveDraftBy,
  moveDraftTo,
  rowsFromDraft,
  rowsFromPlacement,
  setDraftStrategy,
  setDraftWeight,
} from './model-draft';
import { ModelBar } from './ModelBar';
import { PrefillBanner } from './PrefillBanner';
import { usePublishModelDraft } from './publish';

import type { MetricPrefill } from '@/features/documents/api';

// Largura total no celular; a partir de sm volta a caber pelo conteúdo, lado a lado.
const selectClassName =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto dark:bg-input/30';

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  allLabel,
  options,
  labels,
}: {
  label: string;
  value: T | '';
  onChange: (value: T | '') => void;
  allLabel: string;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
}) {
  const id = useId();
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T | '')}
        className={cn(selectClassName, value === '' ? 'text-muted-foreground' : 'text-foreground')}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

function isFiltered(query: MetricsListQuery): boolean {
  return (
    query.search !== '' ||
    query.type !== '' ||
    query.direction !== '' ||
    query.source !== '' ||
    query.isActive !== ''
  );
}

/** Identidade do conteúdo da versão no servidor: quando muda, a edição local recomeça dela. */
function versionSignature(version: MetricModelVersionDto | null): string {
  if (version === null) return '';
  return JSON.stringify({
    id: version.id,
    status: version.status,
    items: draftToItems(versionToDraft(version)),
  });
}

export function MetricsPage() {
  const [query, setQuery] = useState<MetricsListQuery>(DEFAULT_METRICS_QUERY);
  const searchId = useId();
  const result = useMetrics(query);
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState<MetricPrefill | null>(null);

  // O modelo: de onde vêm peso, ordem e normalização.
  const { list: models, summaries } = useMetricModelsWithVersions();
  const allDefinitions = useAllMetricDefinitions();
  const updateMetric = useUpdateMetric();
  const publish = usePublishModelDraft();

  const [modelId, setModelId] = useState<string | null>(null);
  const summary =
    summaries.find((candidate) => candidate.model.id === modelId) ??
    summaries.find((candidate) => candidate.model.isActive) ??
    summaries[0] ??
    null;
  const versions = summary?.detail?.versions ?? [];
  const activeVersion = versions.find((version) => version.status === 'active') ?? null;
  const draftVersion = versions.find((version) => version.status === 'draft') ?? null;
  /** A versão que a tela edita: o rascunho aberto, se houver; senão a que está em vigor. */
  const base = draftVersion ?? activeVersion;

  /** `null` = ninguém mexeu em peso, ordem ou normalização; a tabela mostra o que o servidor diz. */
  const [draft, setDraft] = useState<DraftItem[] | null>(null);

  // Quando o servidor muda de versão (porque publicamos, ou porque outra pessoa salvou), a
  // edição local recomeça do que está gravado — o mesmo que o configurador avançado faz.
  const signature = versionSignature(base);
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setDraft(null);
  }

  // Qualquer mudança de filtro volta para a página 1.
  const set = <K extends Exclude<keyof MetricsListQuery, 'page'>>(
    key: K,
    value: MetricsListQuery[K],
  ) => setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  const goToPage = (page: number) => setQuery((current) => ({ ...current, page }));
  const clear = () => setQuery(DEFAULT_METRICS_QUERY);

  const data = result.data;
  const items = data?.items ?? [];
  const rows = draft === null ? rowsFromPlacement(items) : rowsFromDraft(items, draft);
  const pageCount = data === undefined ? 0 : Math.max(1, Math.ceil(data.total / data.pageSize));

  /** Toda edição de modelo parte da versão gravada — a primeira delas abre o rascunho. */
  const editDraft = (change: (current: DraftItem[]) => DraftItem[]) => {
    if (base === null) return;
    setDraft((current) => change(current ?? versionToDraft(base)));
  };

  const byId = definitionsById(allDefinitions.data?.items ?? items);
  const nameOf = (id: string): string => byId.get(id)?.name ?? 'Métrica removida';
  const edited = draft ?? (base === null ? null : versionToDraft(base));
  const check = edited === null ? null : weightsCheck(edited, byId);
  const remaining = check === null ? 0 : 1 - check.total;

  const savedItems = base === null ? [] : draftToItems(versionToDraft(base));
  const orderChanged =
    draft !== null &&
    JSON.stringify(draftToItems(draft).map((item) => item.metricDefinitionId)) !==
      JSON.stringify(savedItems.map((item) => item.metricDefinitionId));
  const changes =
    draft === null
      ? []
      : [
          ...(orderChanged ? ['a ordem das métricas mudou'] : []),
          ...compareDraftWithVersion(activeVersion, draft, nameOf).map(
            (change) => `${change.metricName}: ${change.description}`,
          ),
        ];

  const canModel = base !== null;
  const modelHint = models.isPending
    ? 'Carregando o modelo…'
    : summary === null
      ? 'Crie um modelo de métricas para distribuir os pesos.'
      : 'Este modelo ainda não tem versão.';
  const canOrder = canModel && !isFiltered(query) && pageCount <= 1;
  const orderHint = isFiltered(query)
    ? 'Limpe a busca e os filtros para reordenar.'
    : 'Reordenar exige a lista inteira na tela.';

  return (
    <>
      <PageHeader title="Métricas" description="O que o sistema mede, com peso e ordem.">
        <Button
          type="button"
          onClick={() => {
            setFormPrefill(null);
            setFormOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
          Nova métrica
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <ModelBar
          models={summaries.map((candidate) => candidate.model)}
          modelId={summary?.model.id ?? null}
          onSelectModel={(id) => {
            setModelId(id);
            setDraft(null);
          }}
          activeVersion={activeVersion?.version ?? null}
          draftVersion={draftVersion?.version ?? null}
          check={check}
          changes={changes}
          publishing={publish.isPending}
          error={publish.error?.message ?? null}
          loading={models.isPending}
          onPublish={() => {
            if (summary === null || draft === null) return;
            publish.mutate(
              {
                modelId: summary.model.id,
                draftVersion: draftVersion?.version ?? null,
                items: draftToItems(draft),
              },
              { onSuccess: () => setDraft(null) },
            );
          }}
          onDiscard={() => setDraft(null)}
        />

        <PrefillBanner
          onReview={(prefill) => {
            setFormPrefill(prefill);
            setFormOpen(true);
          }}
        />

        <form
          role="search"
          aria-label="Buscar e filtrar métricas"
          /* No celular os quatro filtros iam um embaixo do outro e tomavam a tela inteira antes
             da primeira métrica. Em duas colunas ocupam metade da altura, sem esconder nada. */
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="relative col-span-2 w-full min-w-0 sm:min-w-56 sm:flex-1 lg:max-w-sm">
            <label htmlFor={searchId} className="sr-only">
              Buscar por nome ou chave
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              placeholder="Buscar por nome ou chave"
              className="pl-8"
              value={query.search}
              onChange={(event) => set('search', event.target.value)}
            />
          </div>
          <FilterSelect
            label="Tipo"
            value={query.type}
            onChange={(value) => set('type', value)}
            allLabel="Todos os tipos"
            options={METRIC_TYPES}
            labels={METRIC_TYPE_LABELS}
          />
          <FilterSelect
            label="Direção"
            value={query.direction}
            onChange={(value) => set('direction', value)}
            allLabel="Todas as direções"
            options={METRIC_DIRECTIONS}
            labels={METRIC_DIRECTION_LABELS}
          />
          <FilterSelect
            label="Fonte"
            value={query.source}
            onChange={(value) => set('source', value)}
            allLabel="Todas as fontes"
            options={METRIC_SOURCES}
            labels={METRIC_SOURCE_LABELS}
          />
          <FilterSelect
            label="Situação"
            value={query.isActive}
            onChange={(value) => set('isActive', value)}
            allLabel="Ativas e inativas"
            options={['true', 'false'] as const}
            labels={{ true: 'Só ativas', false: 'Só inativas' }}
          />
          {isFiltered(query) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full sm:w-auto"
              onClick={clear}
            >
              <X aria-hidden="true" />
              Limpar
            </Button>
          ) : null}
        </form>

        {updateMetric.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {updateMetric.error.message}
          </p>
        ) : null}

        {result.isPending ? (
          <MetricsLoading label="Carregando métricas" />
        ) : result.isError ? (
          <MetricsError
            title="Não foi possível carregar as métricas"
            error={result.error}
            onRetry={() => void result.refetch()}
          />
        ) : data === undefined || data.total === 0 ? (
          <MetricsEmpty filtered={isFiltered(query)} onClearFilters={clear} />
        ) : (
          <div className={cn('space-y-3', result.isFetching && 'opacity-60 transition-opacity')}>
            {/* Legenda fora da superfície: a tabela mora numa superfície elevada só dela. */}
            {/*
              Esta é a ÚNICA explicação da regra na tela. Antes a mesma coisa aparecia três
              vezes: no subtítulo, na barra do modelo e aqui — e a primeira métrica só apareceu
              depois de rolar. Fica aqui porque é onde a pessoa clica para mudar.
            */}
            <p className="text-sm text-muted-foreground">
              Clique em qualquer dado para mudar. Ativa, nome, tipo e direção salvam na hora; ordem,
              peso e normalização são do modelo e só valem quando você publicar.
            </p>
            <div className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5">
              <MetricsTable
                rows={rows}
                canModel={canModel}
                modelHint={modelHint}
                canOrder={canOrder}
                orderHint={orderHint}
                remaining={remaining}
                editing={draft !== null}
                savingId={updateMetric.isPending ? (updateMetric.variables?.id ?? null) : null}
                actions={{
                  onDefinition: (id, patch) => updateMetric.mutate({ id, body: patch }),
                  onWeight: (id, weight) =>
                    editDraft((current) => setDraftWeight(current, id, weight)),
                  onInclude: (id, weight) =>
                    editDraft((current) => includeInDraft(current, id, weight)),
                  onExclude: (id) => editDraft((current) => excludeFromDraft(current, id)),
                  onStrategy: (id, strategy) =>
                    editDraft((current) => setDraftStrategy(current, id, strategy)),
                  onMoveTo: (fromId, toId) =>
                    editDraft((current) => moveDraftTo(current, fromId, toId)),
                  onMoveBy: (id, delta) => editDraft((current) => moveDraftBy(current, id, delta)),
                }}
              />

              {/* O rodapé fecha a mesma superfície da tabela, separado por uma linha fina. */}
              <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {data.total} {data.total === 1 ? 'métrica' : 'métricas'}
                  {pageCount > 1 ? ` · página ${data.page} de ${pageCount}` : ''}
                </span>
                {pageCount > 1 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.page <= 1}
                      onClick={() => goToPage(data.page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.page >= pageCount}
                      onClick={() => goToPage(data.page + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      <MetricFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        prefill={formPrefill}
        onSaved={(definition) => {
          setFormPrefill(null);
          void navigate(`/metrics/${definition.id}`, { state: null });
        }}
      />
    </>
  );
}
