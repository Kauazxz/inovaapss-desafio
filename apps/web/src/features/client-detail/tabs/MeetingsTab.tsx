import type { ClientHealthOverview } from '@inovaapss/shared';

import { ChartFigure } from '@/components/charts/chart-figure';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useChartPalette } from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';

import { useClientScores } from '../api';
import { meetingsTitle } from '../titles';

const NA_TEXT = 'N/A — sem reunião prevista no período';

interface MeetingPoint {
  label: string;
  periodEnd: string;
  planned: number;
  completed: number;
  hasData: boolean;
}

/**
 * Aba "Reuniões" (§40): previstas × realizadas por período em barras horizontais (previstas em
 * cinza ao fundo, realizadas em azul por cima). Período sem reunião prevista é N/A — não é
 * saudável nem crítico (§21).
 */
export function MeetingsTab({ overview }: { overview: ClientHealthOverview }) {
  const palette = useChartPalette();
  const scores = useClientScores(overview.client.id);
  if (scores.isPending) {
    return (
      <div role="status" aria-label="Carregando a aba Reuniões" className="space-y-4">
        <Skeleton className="h-5 w-full max-w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  if (scores.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar as reuniões.
      </p>
    );
  }
  const score = scores.data.items.find((item) => item.dimension === 'meetings');
  if (!score) {
    return (
      <p className="text-sm text-muted-foreground">Nenhuma métrica de reuniões no modelo ativo.</p>
    );
  }
  const points: MeetingPoint[] = score.series.map((point) => ({
    label: point.label,
    periodEnd: point.periodEnd,
    planned: Number(point.extra?.['planned'] ?? 0),
    completed: Number(point.extra?.['completed'] ?? 0),
    hasData: point.naReason !== 'sem dado no período',
  }));
  const maxPlanned = Math.max(1, ...points.map((point) => point.planned));
  const title = meetingsTitle(points.filter((point) => point.hasData));
  const summary = `${title}. Por período: ${points
    .map((point) =>
      point.planned === 0
        ? `${point.label}: ${NA_TEXT}`
        : `${point.label}: ${point.completed} de ${point.planned} realizadas`,
    )
    .join('; ')}.`;
  const healthText =
    score.metricHealth === null
      ? `N/A — ${score.naReason ?? 'sem dado'}`
      : `${formatInteger(score.metricHealth)}/100`;

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Reuniões não realizadas (peso 5 %): (previstas − realizadas) ÷ previstas. Sem reunião
        prevista não há o que medir: a métrica fica N/A e o peso é redistribuído (§21).
      </p>
      <ChartFigure
        title={title}
        subtitle={`Previstas em cinza, realizadas em azul · health da métrica ${healthText}`}
        summary={summary}
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Previstas</TableHead>
                <TableHead className="text-right">Realizadas</TableHead>
                <TableHead className="text-right">Não realizadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow key={point.periodEnd}>
                  <TableCell>{point.label}</TableCell>
                  {point.planned === 0 ? (
                    <TableCell colSpan={3} className="text-muted-foreground">
                      {NA_TEXT}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">{point.planned}</TableCell>
                      <TableCell className="text-right tabular-nums">{point.completed}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {point.planned - point.completed} (
                        {formatInteger(((point.planned - point.completed) / point.planned) * 100)}{' '}
                        %)
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      >
        {/* No celular período, barra e contagem ficam um embaixo do outro (em três colunas o
            texto sairia da tela); do tablet para cima voltam para a mesma linha. */}
        <ol
          aria-label="Reuniões previstas e realizadas por período"
          className="space-y-4 sm:space-y-2"
        >
          {points.map((point) => (
            <li
              key={point.periodEnd}
              className="flex flex-col gap-1 text-sm sm:grid sm:grid-cols-[64px_1fr_auto] sm:items-center sm:gap-3"
            >
              <span className="text-muted-foreground">{point.label}</span>
              {point.planned === 0 ? (
                <span className="text-muted-foreground sm:col-span-2">{NA_TEXT}</span>
              ) : (
                <>
                  <span className="relative h-5 w-full max-w-80" aria-hidden="true">
                    <span
                      className="absolute inset-y-0 left-0 rounded-r-sm"
                      style={{
                        width: `${(point.planned / maxPlanned) * 100}%`,
                        backgroundColor: palette.neutral,
                      }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-r-sm"
                      style={{
                        width: `${(point.completed / maxPlanned) * 100}%`,
                        backgroundColor: palette.accent,
                      }}
                    />
                  </span>
                  <span className="tabular-nums">
                    {point.completed} de {point.planned} realizada{point.planned === 1 ? '' : 's'}
                    {point.completed < point.planned
                      ? ` · ${point.planned - point.completed} não ${point.planned - point.completed === 1 ? 'ocorreu' : 'ocorreram'}`
                      : ''}
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      </ChartFigure>
    </div>
  );
}
