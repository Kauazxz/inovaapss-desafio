import {
  LabelList,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { HEALTH_CLASS_LABELS, type MetricScoreDto } from '@inovaapss/shared';

import { ChartFigure } from '@/components/charts/chart-figure';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHART_MARKS, CHART_TYPOGRAPHY, useChartPalette } from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';

import { formatDecimal, formatMetricValue, formatWeight } from './format';

export interface MetricTrendChartProps {
  score: MetricScoreDto;
  /** Nome do período nos textos ("mês"). */
  periodLabel: string;
  /** Linha de referência horizontal (ex.: SLA contratado em horas) com o rótulo. */
  reference?: { value: number; label: string } | undefined;
  /** Anota a pior variação entre períodos consecutivos (a queda do uso, o salto de críticos). */
  annotateWorstStep?: boolean | undefined;
  /** Escala fixa do eixo Y (ex.: 0–100 para percentuais). Padrão: 0 até o maior valor. */
  domainMax?: number | undefined;
}

interface Datum {
  label: string;
  periodEnd: string;
  value: number | null;
  baseline: number | null;
  portfolio: number | null;
  health: number | null;
  naReason: string | null;
}

/** Índice do pior passo entre períodos consecutivos, respeitando a direção da métrica. */
function worstStepIndex(
  data: readonly Datum[],
  direction: MetricScoreDto['direction'],
): number | null {
  let worst: { index: number; change: number } | null = null;
  for (let index = 1; index < data.length; index += 1) {
    const current = data[index]?.value ?? null;
    const previous = data[index - 1]?.value ?? null;
    if (current === null || previous === null) continue;
    const change = current - previous;
    const adverse = direction === 'HIGHER_IS_WORSE' ? change : -change;
    if (adverse > 0 && (worst === null || adverse > worst.change))
      worst = { index, change: adverse };
  }
  return worst?.index ?? null;
}

/**
 * Tendência de uma métrica (DATAVIZ.md §4.3): linha do cliente em azul, baseline do próprio
 * cliente em cinza, rótulo no último ponto, título dinâmico com o "e daí?" (a explicação do
 * motor) e a tabela irmã com valor, baseline, média da carteira e health por período.
 * Período sem dado fica sem ponto — nunca vira zero (§21, §22).
 */
export function MetricTrendChart({
  score,
  periodLabel,
  reference,
  annotateWorstStep = false,
  domainMax,
}: MetricTrendChartProps) {
  const palette = useChartPalette();
  const unit = score.unit;
  const data: Datum[] = score.series.map((point) => ({
    label: point.label,
    periodEnd: point.periodEnd,
    value: point.value,
    baseline: point.baseline,
    portfolio: point.portfolioValue,
    health: point.health,
    naReason: point.naReason,
  }));
  const lastIndex = data.length - 1;
  const worstIndex = annotateWorstStep ? worstStepIndex(data, score.direction) : null;
  const worst = worstIndex === null ? null : data[worstIndex];
  const worstPrevious = worstIndex === null ? null : data[worstIndex - 1];
  const maxValue = Math.max(
    domainMax ?? 0,
    reference?.value ?? 0,
    ...data.flatMap((point) => [point.value ?? 0, point.baseline ?? 0]),
  );
  const yMax = domainMax ?? Math.max(1, Math.ceil(maxValue * 1.15));

  const healthText =
    score.metricHealth === null
      ? `N/A — ${score.naReason ?? 'sem dado'}`
      : `${formatInteger(score.metricHealth)}/100${score.healthClass ? ` — ${HEALTH_CLASS_LABELS[score.healthClass]}` : ''}`;
  const title = score.explanation.summary.replace(/\.$/, '');
  const subtitle = `${score.metricName} por ${periodLabel} · em azul o cliente, em cinza o baseline (média dos 3 ${periodLabel === 'mês' ? 'meses' : `${periodLabel}s`} anteriores)${reference ? ` · linha de referência: ${reference.label}` : ''} · health da métrica ${healthText} · peso ${formatWeight(score.weight)}`;
  const summary = `${title}. ${score.metricName} por período: ${data
    .map((point) => `${point.label}: ${formatMetricValue(point.value, unit, point.naReason)}`)
    .join('; ')}. Health da métrica ${healthText}.`;

  const formatValue = (value: number | null, naReason: string | null = null) =>
    formatMetricValue(value, unit, naReason);

  const renderLastLabel = (props: {
    x?: number | string | undefined;
    y?: number | string | undefined;
    index?: number | undefined;
    value?: unknown;
  }) => {
    if (props.index !== lastIndex || props.value === null || props.value === undefined) return null;
    return (
      <text
        x={Number(props.x) + 8}
        y={Number(props.y)}
        dominantBaseline="middle"
        fill={palette.ink}
        fontSize={CHART_TYPOGRAPHY.directLabel.size}
        fontWeight={CHART_TYPOGRAPHY.directLabel.weight}
      >
        {formatValue(Number(props.value))}
      </text>
    );
  };

  return (
    <ChartFigure
      title={title}
      subtitle={subtitle}
      summary={summary}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">{score.metricName}</TableHead>
              <TableHead className="text-right">Baseline</TableHead>
              {/* No celular sobra o que conta a história: período, valor, baseline e health. */}
              <TableHead className="hidden text-right md:table-cell">Média da carteira</TableHead>
              <TableHead className="text-right">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.periodEnd}>
                <TableCell>{point.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatValue(point.value, point.naReason)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {point.baseline === null ? '—' : formatValue(point.baseline)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {point.portfolio === null ? '—' : formatValue(point.portfolio)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {point.health === null ? 'N/A' : formatInteger(point.health)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <div style={{ height: 240 }} className="w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 640, height: 240 }}
        >
          <LineChart
            data={data}
            margin={{ top: 20, right: 96, bottom: 4, left: 0 }}
            style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
          >
            <XAxis
              dataKey="label"
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              tick={{ fill: palette.muted, fontSize: CHART_TYPOGRAPHY.tick.size }}
            />
            <YAxis
              domain={[0, yMax]}
              width={44}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatDecimal(value, 0)}
              tick={{ fill: palette.muted, fontSize: CHART_TYPOGRAPHY.tick.size }}
            />
            {reference ? (
              <ReferenceLine
                y={reference.value}
                stroke={palette.grid}
                strokeWidth={CHART_MARKS.referenceLineWidth}
                label={{
                  value: reference.label,
                  position: 'insideTopRight',
                  fill: palette.muted,
                  fontSize: CHART_TYPOGRAPHY.tick.size,
                }}
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: palette.grid }}
              content={({ active, payload }) => {
                const datum = payload?.[0]?.payload as Datum | undefined;
                if (!active || !datum) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-popover">
                    <p className="font-medium">{datum.label}</p>
                    <p className="text-muted-foreground">
                      {score.metricName}: {formatValue(datum.value, datum.naReason)}
                    </p>
                    {datum.baseline !== null ? (
                      <p className="text-muted-foreground">
                        Baseline: {formatValue(datum.baseline)}
                      </p>
                    ) : null}
                    {datum.portfolio !== null ? (
                      <p className="text-muted-foreground">
                        Média da carteira: {formatValue(datum.portfolio)}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      Health: {datum.health === null ? 'N/A' : `${formatInteger(datum.health)}/100`}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Baseline"
              stroke={palette.neutral}
              strokeWidth={CHART_MARKS.lineWidth}
              strokeLinejoin="round"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={score.metricName}
              stroke={palette.accent}
              strokeWidth={CHART_MARKS.lineWidth}
              strokeLinejoin="round"
              dot={{ r: CHART_MARKS.pointDiameter / 2 - 1, fill: palette.accent, strokeWidth: 0 }}
              activeDot={{ r: CHART_MARKS.pointDiameter / 2, strokeWidth: CHART_MARKS.pointRing }}
              connectNulls={false}
              isAnimationActive={false}
            >
              <LabelList dataKey="value" content={renderLastLabel} />
            </Line>
            {worst && worst.value !== null && worstPrevious && worstPrevious.value !== null ? (
              <ReferenceDot
                x={worst.label}
                y={worst.value}
                r={CHART_MARKS.pointDiameter / 2 + 2}
                fill="none"
                stroke={palette.accent}
                strokeWidth={CHART_MARKS.pointRing}
                label={{
                  value: `${unit === '%' ? `${formatDecimal(worst.value - worstPrevious.value, 0)} p.p.` : `${worst.value > worstPrevious.value ? '+' : ''}${formatDecimal(worst.value - worstPrevious.value, 1)}`} vs. ${worstPrevious.label}`,
                  position: 'top',
                  fill: palette.inkSecondary,
                  fontSize: CHART_TYPOGRAPHY.annotation.size,
                }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
