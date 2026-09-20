/**
 * Slopegraph peso atual → peso sugerido (§43; DATAVIZ.md §1.2 e A1: nada de pizza).
 *
 * Duas colunas e uma linha por métrica. O que a tela precisa responder num olhar é "quem sobe,
 * quem desce e quanto" — uma pizza mostraria a composição e esconderia justamente a mudança.
 * Cinza para todas as linhas e a cor de destaque só para a maior mudança, que é a história.
 *
 * SVG próprio: o Recharts não tem slopegraph, e um LineChart com duas categorias perderia os
 * rótulos diretos nas duas pontas sem colisão.
 */
import { useRef } from 'react';

import type { CalibrationSuggestionDto } from '@inovaapss/shared';

import { ChartFigure } from '@/components/charts/chart-figure';
import { useElementWidth } from '@/components/charts/use-element-width';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHART_MARKS, CHART_TYPOGRAPHY, useChartPalette } from '@/lib/chart-theme';

import { formatWeight, formatWeightDelta } from './format';

const ROW_GAP = 26;
const TOP = 34;
const BOTTOM = 20;
const LABEL_WIDTH = 190;
const VALUE_WIDTH = 56;

export interface WeightSlopegraphProps {
  suggestions: readonly CalibrationSuggestionDto[];
  /** Métricas cujo peso sugerido já foi aceito — a linha fica sólida em vez de tracejada. */
  accepted?: ReadonlySet<string>;
}

export function WeightSlopegraph({ suggestions, accepted }: WeightSlopegraphProps) {
  const palette = useChartPalette();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef, 720);

  // Do maior peso atual para o menor: a leitura de cima para baixo é a ordem do modelo hoje.
  const rows = [...suggestions].sort((a, b) => b.currentWeight - a.currentWeight);
  if (rows.length === 0) return null;

  const height = TOP + rows.length * ROW_GAP + BOTTOM;
  const leftX = LABEL_WIDTH + VALUE_WIDTH;
  const rightX = Math.max(leftX + 80, width - VALUE_WIDTH - 12);
  const maxWeight = Math.max(
    ...rows.flatMap((row) => [row.currentWeight, row.suggestedWeight]),
    0.01,
  );
  const y = (weight: number) =>
    TOP + (rows.length - 1) * ROW_GAP * (1 - Math.min(1, weight / maxWeight)) + 6;

  const maiorMudanca = rows.reduce(
    (maior, row) => (Math.abs(row.delta) > Math.abs(maior.delta) ? row : maior),
    rows[0] as CalibrationSuggestionDto,
  );

  const subiu = rows.filter((row) => row.delta > 0.0005).length;
  const desceu = rows.filter((row) => row.delta < -0.0005).length;

  return (
    <div ref={containerRef} className="min-w-0">
      <ChartFigure
        title={
          Math.abs(maiorMudanca.delta) < 0.0005
            ? 'O histórico não pede mudança de peso'
            : `${maiorMudanca.metricName} é a métrica que mais muda de peso (${formatWeightDelta(maiorMudanca.delta)})`
        }
        subtitle={`${subiu} métrica(s) ganham peso, ${desceu} perdem. Nada disso vale até alguém criar e ativar uma nova versão.`}
        summary={rows
          .map(
            (row) =>
              `${row.metricName}: de ${formatWeight(row.currentWeight)} para ${formatWeight(row.suggestedWeight)} (${formatWeightDelta(row.delta)}).`,
          )
          .join(' ')}
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Peso atual</TableHead>
                <TableHead className="text-right">Peso sugerido</TableHead>
                <TableHead className="text-right">Mudança</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.metricId}>
                  <TableCell>{row.metricName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatWeight(row.currentWeight)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatWeight(row.suggestedWeight)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatWeightDelta(row.delta)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      >
        <svg
          role="img"
          aria-label="Peso atual e peso sugerido de cada métrica"
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(width, 420)} ${height}`}
          style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
        >
          <text
            x={leftX}
            y={16}
            textAnchor="end"
            fill={palette.muted}
            fontSize={CHART_TYPOGRAPHY.tick.size}
          >
            Peso atual
          </text>
          <text
            x={rightX}
            y={16}
            textAnchor="start"
            fill={palette.muted}
            fontSize={CHART_TYPOGRAPHY.tick.size}
          >
            Peso sugerido
          </text>
          <line
            x1={leftX}
            y1={TOP - 6}
            x2={leftX}
            y2={height - BOTTOM}
            stroke={palette.grid}
            strokeWidth={CHART_MARKS.referenceLineWidth}
          />
          <line
            x1={rightX}
            y1={TOP - 6}
            x2={rightX}
            y2={height - BOTTOM}
            stroke={palette.grid}
            strokeWidth={CHART_MARKS.referenceLineWidth}
          />

          {rows.map((row) => {
            const destaque =
              row.metricId === maiorMudanca.metricId && Math.abs(row.delta) >= 0.0005;
            const cor = destaque ? palette.accent : palette.neutral;
            const y1 = y(row.currentWeight);
            const y2 = y(row.suggestedWeight);
            const aceita = accepted?.has(row.metricId) === true;
            return (
              <g key={row.metricId}>
                <text
                  x={LABEL_WIDTH - 8}
                  y={y1 + 4}
                  textAnchor="end"
                  fill={destaque ? palette.ink : palette.inkSecondary}
                  fontSize={CHART_TYPOGRAPHY.directLabel.size}
                  fontWeight={destaque ? 600 : 400}
                >
                  {row.metricName}
                </text>
                <text
                  x={leftX - 8}
                  y={y1 + 4}
                  textAnchor="end"
                  fill={palette.inkSecondary}
                  fontSize={CHART_TYPOGRAPHY.tick.size}
                >
                  {formatWeight(row.currentWeight)}
                </text>
                <line
                  x1={leftX}
                  y1={y1}
                  x2={rightX}
                  y2={y2}
                  stroke={cor}
                  strokeWidth={destaque ? CHART_MARKS.lineWidth + 1 : CHART_MARKS.lineWidth}
                  strokeDasharray={aceita ? undefined : '5 3'}
                />
                <circle cx={leftX} cy={y1} r={CHART_MARKS.pointDiameter / 2} fill={cor} />
                <circle cx={rightX} cy={y2} r={CHART_MARKS.pointDiameter / 2} fill={cor} />
                <text
                  x={rightX + 8}
                  y={y2 + 4}
                  textAnchor="start"
                  fill={destaque ? palette.ink : palette.inkSecondary}
                  fontSize={CHART_TYPOGRAPHY.tick.size}
                  fontWeight={destaque ? 600 : 400}
                >
                  {formatWeight(row.suggestedWeight)}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-xs text-muted-foreground">
          Linha tracejada = proposta ainda não aceita. Sólida = você aceitou o peso sugerido.
        </p>
      </ChartFigure>
    </div>
  );
}
