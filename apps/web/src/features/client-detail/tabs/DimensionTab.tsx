import type { ClientHealthOverview, MetricScoreDto } from '@inovaapss/shared';

import { Skeleton } from '@/components/ui/skeleton';

import { useClientScores } from '../api';
import { MetricTrendChart } from '../MetricTrendChart';

export interface DimensionChartSpec {
  /** `metricKey` do preset (ou id da métrica) que este gráfico mostra. */
  metricKey: string;
  reference?:
    | ((
        score: MetricScoreDto,
        overview: ClientHealthOverview,
      ) => { value: number; label: string } | undefined)
    | undefined;
  annotateWorstStep?: boolean | undefined;
  domainMax?: number | undefined;
}

/**
 * Base das abas de série temporal (Atendimento, SLA, Uso, Financeiro): busca os scores uma vez
 * e desenha um gráfico de tendência por métrica da dimensão, na ordem pedida.
 */
export function DimensionTab({
  overview,
  charts,
  intro,
  loadingLabel,
}: {
  overview: ClientHealthOverview;
  charts: readonly DimensionChartSpec[];
  /** Uma frase de contexto acima dos gráficos. */
  intro: string;
  loadingLabel: string;
}) {
  const scores = useClientScores(overview.client.id);
  if (scores.isPending) {
    return (
      <div role="status" aria-label={loadingLabel} className="space-y-4">
        <Skeleton className="h-5 w-full max-w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  if (scores.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar as métricas desta aba.
      </p>
    );
  }
  const byKey = new Map(
    scores.data.items.map((score) => [score.metricKey ?? score.metricId, score]),
  );
  return (
    // Um gráfico embaixo do outro: o respiro é o que diz onde um acaba e o outro começa.
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>
      {charts.map((spec) => {
        const score = byKey.get(spec.metricKey);
        if (!score) return null;
        return (
          <MetricTrendChart
            key={spec.metricKey}
            score={score}
            periodLabel={overview.periodLabel}
            reference={spec.reference?.(score, overview)}
            annotateWorstStep={spec.annotateWorstStep}
            domainMax={spec.domainMax}
          />
        );
      })}
    </div>
  );
}
