import { ArrowRight, BadgeCheck, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router';

import type {
  AssistantCanvas,
  AssistantCanvasMetric,
  AssistantCanvasMetricTone,
  AssistantCanvasWidget,
  RankingRow,
} from '@inovaapss/shared';

import { ClassDistributionChart } from '@/components/charts/class-distribution-chart';
import { DimensionHealthChart } from '@/components/charts/dimension-health-chart';
import { ForecastDumbbellChart } from '@/components/charts/forecast-dumbbell-chart';
import { HealthTimelineChart } from '@/components/charts/health-timeline-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatCompactCurrency,
  formatInteger,
  formatPercent,
  formatSignedInteger,
} from '@/lib/format';
import { cn } from '@/lib/utils';

const toneClasses: Record<AssistantCanvasMetricTone, string> = {
  neutral: 'border-border',
  attention: 'border-class-attention/50 bg-class-attention/5',
  risk: 'border-class-risk/50 bg-class-risk/5',
  critical: 'border-class-critical/50 bg-class-critical/5',
};

function metricValue(metric: AssistantCanvasMetric): string {
  if (metric.format === 'currency') return formatCompactCurrency(metric.value);
  if (metric.format === 'percent') return formatPercent(metric.value);
  if (metric.format === 'score') return `${formatInteger(metric.value)}/100`;
  return formatInteger(metric.value);
}

function metricDelta(metric: AssistantCanvasMetric): string | null {
  if (metric.delta === null) return null;
  if (metric.format === 'currency') {
    const sign = metric.delta > 0 ? '+' : metric.delta < 0 ? '−' : '';
    return `${sign}${formatCompactCurrency(Math.abs(metric.delta))}`;
  }
  return formatSignedInteger(metric.delta);
}

function MetricsWidget({
  widget,
}: {
  widget: Extract<AssistantCanvasWidget, { type: 'metrics' }>;
}) {
  return (
    <section aria-label={widget.title}>
      <h3 className="mb-3 text-sm font-semibold">{widget.title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {widget.items.map((metric) => {
          const delta = metricDelta(metric);
          return (
            <div
              key={metric.label}
              className={cn('rounded-xl border p-4', toneClasses[metric.tone ?? 'neutral'])}
            >
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                {metricValue(metric)}
              </dd>
              {delta === null && metric.hint === undefined ? null : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {delta === null ? null : (
                    <>
                      {delta}
                      <span className="sr-only"> em relação ao período anterior</span>
                    </>
                  )}
                  {delta !== null && metric.hint !== undefined ? ' · ' : null}
                  {metric.hint}
                </p>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function PriorityItem({ row }: { row: RankingRow }) {
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="mr-2 text-muted-foreground">#{row.position}</span>
            {row.clientName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saúde {formatInteger(row.healthCurrent)}/100 · prioridade{' '}
            {formatInteger(row.priorityScore)}/100
          </p>
        </div>
        <Link
          to={`/clients/${row.clientId}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
          aria-label={`Analisar ${row.clientName}`}
        >
          Analisar <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-3 text-sm">{row.topEvidence}</p>
      <p className="mt-1 text-xs text-muted-foreground">Próxima ação: {row.suggestedAction}</p>
    </li>
  );
}

function Widget({ widget }: { widget: AssistantCanvasWidget }) {
  switch (widget.type) {
    case 'metrics':
      return <MetricsWidget widget={widget} />;
    case 'forecast':
      return <ForecastDumbbellChart data={widget.data} initialRows={5} maxRows={8} />;
    case 'dimensions':
      return (
        <DimensionHealthChart
          dimensions={widget.dimensions}
          targetBand={widget.targetBand}
          thresholds={widget.thresholds}
        />
      );
    case 'timeline':
      return <HealthTimelineChart timeline={widget.timeline} thresholds={widget.thresholds} />;
    case 'distribution':
      return <ClassDistributionChart distribution={widget.distribution} />;
    case 'priorities':
      return (
        <section aria-labelledby="assistant-priorities-title">
          <h3 id="assistant-priorities-title" className="mb-3 text-sm font-semibold">
            {widget.title}
          </h3>
          {widget.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum cliente exige atenção neste recorte.
            </p>
          ) : (
            <ol className="grid gap-3 2xl:grid-cols-2">
              {widget.rows.map((row) => (
                <PriorityItem key={row.clientId} row={row} />
              ))}
            </ol>
          )}
        </section>
      );
  }
}

export function DecisionCanvas({ canvas }: { canvas: AssistantCanvas }) {
  return (
    <Card className="border-foreground/15 shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="gap-1 bg-background">
            <LayoutDashboard className="size-3" aria-hidden="true" />
            Canvas de decisão
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Dados verificados pelo motor
          </span>
        </div>
        <CardTitle className="mt-3 text-xl">{canvas.title}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{canvas.summary}</p>
      </CardHeader>
      <CardContent className="space-y-8">
        {canvas.widgets.map((widget, index) => (
          <Widget key={`${widget.type}-${index}`} widget={widget} />
        ))}
      </CardContent>
    </Card>
  );
}
