import { Play } from 'lucide-react';
import { useId, useState } from 'react';

import type { MetricDefinitionDto, MetricModelItemDto } from '@inovaapss/shared';
import type { PreviewScoreInput } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type PreviewScore, usePreviewScore } from './api';
import { DEFAULT_SIMULATION_ITEM } from './explain';
import { parseSeriesText } from './parse-series';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Fins de mês sintéticos terminando no mês atual, do mais antigo ao mais recente. */
function syntheticPeriodEnds(count: number, now = new Date()): string[] {
  const ends: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 0));
    ends.push(end.toISOString().slice(0, 10));
  }
  return ends;
}

function itemToInput(item: MetricModelItemDto | null): PreviewScoreInput['item'] {
  if (item === null) return { ...DEFAULT_SIMULATION_ITEM };
  return {
    weight: item.weight,
    currentWeight: item.currentWeight,
    trendWeight: item.trendWeight,
    persistenceWeight: item.persistenceWeight,
    normalization: item.normalizationConfig as PreviewScoreInput['item']['normalization'],
    thresholds: item.thresholdConfig as PreviewScoreInput['item']['thresholds'],
    triggers: item.criticalTriggerConfig as PreviewScoreInput['item']['triggers'],
    formula: item.formulaConfig as PreviewScoreInput['item']['formula'],
  };
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {/* Número grande solto: figuras proporcionais, `tabular-nums` só em tabela
          (DATAVIZ.md §2.2). Não quebra linha no meio do número. */}
      <dd className="text-2xl font-semibold tracking-tight whitespace-nowrap">
        {value === null ? 'N/A' : number.format(value)}
      </dd>
    </div>
  );
}

/**
 * Painel "Simular" (§41): valores digitados → POST /metrics/:id/preview-score → os componentes
 * do score (atual, tendência, persistência, health da métrica), a confiança e a explicação.
 * Sem gráfico: preview em texto, como manda o DATAVIZ.md §4.5.
 */
export function SimulatePanel({
  definition,
  item,
  caption,
}: {
  definition: MetricDefinitionDto;
  item: MetricModelItemDto | null;
  /** Texto sob o título. O configurador simula um rascunho, não a versão ativa. */
  caption?: string;
}) {
  const valuesId = useId();
  const [text, setText] = useState('90, 85, 80');
  const [parseError, setParseError] = useState<string | null>(null);
  const preview = usePreviewScore(definition.id);
  const score: PreviewScore | undefined = preview.data?.score;

  const run = () => {
    const values = parseSeriesText(text);
    if (values.length === 0) {
      setParseError('Informe ao menos um valor.');
      return;
    }
    setParseError(null);
    const ends = syntheticPeriodEnds(values.length);
    preview.mutate({
      item: itemToInput(item),
      series: values.map((value, index) => ({ periodEnd: ends[index] as string, value })),
      periodLabel: 'mês',
    });
  };

  return (
    <section aria-labelledby="simular-titulo" className="space-y-4">
      <div>
        <h3 id="simular-titulo" className="cn-font-heading text-base leading-snug font-medium">
          Simular
        </h3>
        <p className="text-sm text-muted-foreground">
          {caption ??
            (item === null
              ? 'Esta métrica ainda não está em nenhuma versão ativa: a simulação usa uma escala linear de 0 a 100 como exemplo.'
              : 'Usa a configuração da versão ativa. Nada é salvo.')}
        </p>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="flex w-full min-w-0 flex-col gap-1 sm:flex-1">
          {/* Rótulo longo: `leading-snug` no lugar do `leading-none` do componente, senão as
              linhas ficam coladas quando ele quebra no celular. */}
          <Label htmlFor={valuesId} className="leading-snug">
            Valores por período, do mais antigo ao mais recente (separe por vírgula, decimal com
            ponto; "x" = sem dado)
          </Label>
          <Input
            id={valuesId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={parseError !== null}
            aria-describedby={parseError !== null ? `${valuesId}-erro` : undefined}
          />
          {parseError !== null ? (
            <p id={`${valuesId}-erro`} className="text-sm text-destructive">
              {parseError}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full sm:w-auto" disabled={preview.isPending}>
          <Play aria-hidden="true" />
          {preview.isPending ? 'Simulando…' : 'Simular'}
        </Button>
      </form>

      {preview.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {preview.error instanceof Error ? preview.error.message : 'Não foi possível simular.'}
        </p>
      ) : null}

      {score !== undefined ? (
        <div className="space-y-4" aria-live="polite">
          <dl
            aria-label="Componentes do score"
            className="grid gap-x-6 gap-y-5 border-b border-border pb-4 sm:grid-cols-3 lg:grid-cols-5"
          >
            <Score label="Atual" value={score.currentHealth} />
            <Score label="Tendência" value={score.trendHealth} />
            <Score label="Persistência" value={score.persistenceHealth} />
            <Score label="Health da métrica" value={score.metricHealth} />
            <Score label="Confiança (%)" value={score.confidence} />
          </dl>
          <p className="text-sm font-medium">{score.explanation.summary}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {score.explanation.components.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {score.explanation.notes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {score.triggers.hits.length > 0 ? (
            <ul className="text-sm" aria-label="Gatilhos disparados">
              {score.triggers.hits.map((hit) => (
                <li key={hit.name}>
                  <span className="font-medium">{hit.name}</span>: {hit.message}
                  {hit.priorityFloor !== null
                    ? ` (prioridade mínima ${number.format(hit.priorityFloor)})`
                    : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
