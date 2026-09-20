import { Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  METRIC_SOURCE_LABELS,
  METRIC_SOURCES,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  NORMALIZATION_STRATEGY_LABELS,
  type MetricDefinitionListItemDto,
} from '@inovaapss/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DEFAULT_METRICS_QUERY, type MetricsListQuery, useMetrics } from './api';
import { pct } from './explain';
import { MetricsEmpty, MetricsError, MetricsLoading } from './MetricsStates';
import { orderMetricItems } from './order';
import { PrefillBanner } from './PrefillBanner';

const selectClassName =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

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
    <div className="flex flex-col gap-1">
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

/** Pílula "Sim/Não" para a coluna Ativa: texto sempre, cor nunca sozinha (DATAVIZ.md §1.4). */
function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {active ? 'Sim' : 'Não'}
    </span>
  );
}

function statusOf(row: MetricDefinitionListItemDto): string {
  if (row.activePlacement !== null) {
    return `No modelo ativo (${row.activePlacement.modelName} v${row.activePlacement.version})`;
  }
  return row.isActive ? 'Fora do modelo ativo' : 'Desativada';
}

/**
 * §38 /metrics — tabela do configurador (§41): Ativa, Ordem, Métrica, Tipo, Peso final da versão
 * ativa, Direção, Normalização, Status. Busca e filtros §61. Edição visual chega na Etapa 10.
 */
export function MetricsPage() {
  const [query, setQuery] = useState<MetricsListQuery>(DEFAULT_METRICS_QUERY);
  const searchId = useId();
  const result = useMetrics(query);

  // Qualquer mudança de filtro volta para a página 1.
  const set = <K extends Exclude<keyof MetricsListQuery, 'page'>>(
    key: K,
    value: MetricsListQuery[K],
  ) => setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  const goToPage = (page: number) => setQuery((current) => ({ ...current, page }));
  const clear = () => setQuery(DEFAULT_METRICS_QUERY);

  const data = result.data;
  const orderedItems = useMemo(() => orderMetricItems(data?.items ?? []), [data?.items]);
  const pageCount = data === undefined ? 0 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader
        title="Métricas"
        description="Tudo é métrica: tipo, direção, fonte, normalização e peso de cada indicador da organização."
      />

      <PrefillBanner />

      <form
        role="search"
        aria-label="Buscar e filtrar métricas"
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar por nome ou chave
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Buscar por nome ou chave"
            className="w-64 pl-8"
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
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden="true" />
            Limpar
          </Button>
        ) : null}
      </form>

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
        <div className={cn(result.isFetching && 'opacity-60 transition-opacity')}>
          <p className="mb-3 text-sm text-muted-foreground">
            Ordem fixa: métricas do modelo ativo aparecem primeiro, na ordem configurada; as demais
            vêm em ordem alfabética.
          </p>
          <Table aria-label="Métricas da organização">
            <TableHeader>
              <TableRow>
                <TableHead>Ativa</TableHead>
                <TableHead className="text-right">Ordem</TableHead>
                <TableHead>Métrica</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Peso final</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead>Normalização</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedItems.map((row) => (
                <TableRow key={row.id} data-metric-id={row.id}>
                  <TableCell>
                    <ActivePill active={row.isActive} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.activePlacement?.sortOrder ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/metrics/${row.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{row.slug}</span>
                  </TableCell>
                  <TableCell>{METRIC_TYPE_LABELS[row.metricType]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.activePlacement === null ? '—' : pct(row.activePlacement.weight)}
                  </TableCell>
                  <TableCell>{METRIC_DIRECTION_LABELS[row.direction]}</TableCell>
                  <TableCell>
                    {row.activePlacement === null
                      ? '—'
                      : NORMALIZATION_STRATEGY_LABELS[row.activePlacement.normalizationStrategy]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{statusOf(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
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
      )}
    </>
  );
}
