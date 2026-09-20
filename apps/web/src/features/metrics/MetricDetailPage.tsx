import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import {
  METRIC_PERIODICITY_LABELS,
  METRIC_SOURCE_LABELS,
  METRIC_TYPE_LABELS,
  type MetricDefinitionDetailDto,
} from '@inovaapss/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import { useMetric } from './api';
import {
  describeComponents,
  describeDirection,
  describeNormalization,
  describeTriggers,
  pct,
} from './explain';
import { MetricsError, MetricsLoading } from './MetricsStates';
import { SimulatePanel } from './SimulatePanel';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function ConfigList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section aria-labelledby={`cfg-${title}`} className="space-y-1">
      <h3 id={`cfg-${title}`} className="text-sm font-semibold">
        {title}
      </h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Detail({ data }: { data: MetricDefinitionDetailDto }) {
  const { definition, activeItem, activeModel } = data;
  const triggers = activeItem === null ? [] : describeTriggers(activeItem.criticalTriggerConfig);
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-4 border-b border-border pb-6 md:grid-cols-4">
        <Field label="Chave" value={definition.slug} />
        <Field label="Tipo" value={METRIC_TYPE_LABELS[definition.metricType]} />
        <Field label="Unidade" value={definition.unit ?? '—'} />
        <Field label="Periodicidade" value={METRIC_PERIODICITY_LABELS[definition.periodicity]} />
        <Field label="Fonte" value={METRIC_SOURCE_LABELS[definition.sourceType]} />
        <Field label="Categoria" value={definition.category ?? '—'} />
        <Field label="Ativa" value={definition.isActive ? 'Sim' : 'Não'} />
        <Field
          label="No modelo ativo"
          value={
            activeModel === null || activeItem === null
              ? 'Não'
              : `${activeModel.name} v${activeModel.version} · peso ${pct(activeItem.weight)} · ordem ${activeItem.sortOrder}`
          }
        />
      </dl>

      <div className="space-y-6">
        <ConfigList title="Direção" lines={[describeDirection(definition.direction)]} />
        {activeItem === null ? (
          <p className="text-sm text-muted-foreground">
            Esta métrica ainda não faz parte da versão ativa de nenhum modelo: normalização, pesos e
            gatilhos serão definidos ao incluí-la num modelo (Modelos de métricas).
          </p>
        ) : (
          <>
            <ConfigList
              title="Normalização"
              lines={describeNormalization(activeItem.normalizationConfig, definition.direction)}
            />
            <ConfigList title="Composição do score" lines={describeComponents(activeItem)} />
            {triggers.length > 0 ? <ConfigList title="Gatilhos críticos" lines={triggers} /> : null}
          </>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <SimulatePanel definition={definition} item={activeItem} />
      </div>
    </div>
  );
}

/** §38 /metrics/:id — definição legível (sem editor rico) e o painel "Simular" (§41). */
export function MetricDetailPage() {
  const { id } = useParams();
  const result = useMetric(id);

  return (
    <>
      <PageHeader
        title={result.data?.definition.name ?? 'Métrica'}
        description={
          result.data?.definition.description ??
          'Como esta métrica é medida, normalizada e pesada no modelo.'
        }
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/metrics">
            <ArrowLeft aria-hidden="true" />
            Todas as métricas
          </Link>
        </Button>
      </PageHeader>

      {result.isPending ? (
        <MetricsLoading label="Carregando métrica" />
      ) : result.isError ? (
        <MetricsError
          title="Não foi possível carregar a métrica"
          error={result.error}
          onRetry={() => void result.refetch()}
        />
      ) : (
        <Detail data={result.data} />
      )}
    </>
  );
}
