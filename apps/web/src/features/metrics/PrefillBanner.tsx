import { FileText, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

import { METRIC_DIRECTION_LABELS, METRIC_TYPE_LABELS } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';

import { useCreateMetric } from './api';
import { pct } from './explain';

import type { MetricPrefill } from '@/features/documents/api';

/**
 * Sugestão de métrica aceita em /documents/:id (§35, fluxo manual): a tela de documentos navega
 * para /metrics com `state.prefill` (formato em docs/DOCUMENTS.md §3). Aqui a pessoa confirma e a
 * métrica nasce em POST /metrics, inativa e sem peso — peso e normalização entram no modelo pelo
 * configurador (Etapa 10). Sem `state.prefill`, o componente não aparece.
 */
export function PrefillBanner({ onReview }: { onReview?: (prefill: MetricPrefill) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const create = useCreateMetric();
  const prefill = (location.state as { prefill?: MetricPrefill } | null)?.prefill;

  if (prefill === undefined) return null;

  const dismiss = () => navigate('/metrics', { replace: true, state: null });
  const confirm = () => {
    create.mutate(
      {
        name: prefill.name,
        slug: prefill.slug,
        description: prefill.description,
        category: prefill.category,
        metricType: prefill.metricType,
        unit: prefill.unit,
        direction: prefill.direction,
        periodicity: prefill.periodicity,
        sourceType: prefill.sourceType,
        isActive: false,
      },
      {
        onSuccess: ({ definition }) => {
          navigate(`/metrics/${definition.id}`, { replace: true, state: null });
        },
      },
    );
  };

  const details = [
    METRIC_TYPE_LABELS[prefill.metricType],
    METRIC_DIRECTION_LABELS[prefill.direction],
    prefill.unit !== null && prefill.unit !== '' ? `unidade ${prefill.unit}` : null,
    prefill.weight !== null ? `peso sugerido ${pct(prefill.weight)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <section
      role="status"
      aria-labelledby="prefill-title"
      className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/5 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 id="prefill-title" className="cn-font-heading text-base leading-snug font-medium">
            Sugestão aceita
            {prefill.origin.fileName !== null ? ` do documento ${prefill.origin.fileName}` : ''}
          </h2>
          <p className="text-sm break-words">
            <span className="font-medium">{prefill.name}</span>{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{prefill.slug}</code> ·{' '}
            {details.join(' · ')}
          </p>
          {prefill.description !== null && prefill.description !== '' ? (
            <p className="text-sm text-muted-foreground">{prefill.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            A métrica nasce inativa. Peso, normalização e gatilhos entram no modelo de métricas
            depois.
          </p>
          {create.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          ) : null}
        </div>
      </div>
      {/* No celular as três ações empilham em linhas que caibam; a partir de sm ficam ao lado. */}
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <Button type="button" size="sm" onClick={confirm} disabled={create.isPending}>
          {create.isPending ? 'Criando…' : 'Criar métrica'}
        </Button>
        {onReview === undefined ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onReview(prefill)}
            disabled={create.isPending}
          >
            Revisar no formulário
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={dismiss}
          disabled={create.isPending}
        >
          <X aria-hidden="true" />
          Descartar
        </Button>
      </div>
    </section>
  );
}
