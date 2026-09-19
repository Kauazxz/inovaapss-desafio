import {
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { type HealthThresholds, type HealthTimeline } from '@inovaapss/shared';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CHART_MARKS,
  CHART_TYPOGRAPHY,
  classifyHealthWith,
  healthClassLabel,
  useChartPalette,
} from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';

import { ChartFigure } from './chart-figure';
import { timelineTitle } from './titles';

export interface HealthTimelineChartProps {
  timeline: HealthTimeline;
  thresholds: HealthThresholds;
  reloading?: boolean | undefined;
}

interface Datum {
  label: string;
  periodEnd: string;
  portfolio: number | null;
  client: number | null;
}

/**
 * Evolução temporal do health (DATAVIZ.md §4.2): linha da média da carteira em cinza, linhas de
 * referência 80/60/40 com o nome da faixa, e o cliente escolhido no filtro em destaque.
 */
export function HealthTimelineChart({ timeline, thresholds, reloading }: HealthTimelineChartProps) {
  const palette = useChartPalette();
  const client = timeline.client;

  const data: Datum[] = timeline.portfolio.map((point, index) => ({
    label: point.label,
    periodEnd: point.periodEnd,
    portfolio: point.health,
    client: client?.points[index]?.health ?? null,
  }));
  const lastIndex = data.length - 1;
  const title = timelineTitle(timeline);
  const summary = `${title}. Média da carteira por período: ${data
    .map(
      (point) =>
        `${point.label}: ${point.portfolio === null ? 'sem dado' : formatInteger(point.portfolio)}`,
    )
    .join('; ')}.${
    client
      ? ` ${client.clientName}: ${data
          .map(
            (point) =>
              `${point.label}: ${point.client === null ? 'sem dado' : formatInteger(point.client)}`,
          )
          .join('; ')}.`
      : ''
  }`;

  const renderLastLabel =
    (color: string, name: string) =>
    (props: {
      x?: number | string | undefined;
      y?: number | string | undefined;
      index?: number | undefined;
      value?: unknown;
    }) => {
      if (props.index !== lastIndex || props.value === null || props.value === undefined)
        return null;
      const x = Number(props.x) + 8;
      const y = Number(props.y);
      return (
        <text
          x={x}
          y={y}
          dominantBaseline="middle"
          fill={color}
          fontSize={CHART_TYPOGRAPHY.directLabel.size}
          fontWeight={CHART_TYPOGRAPHY.directLabel.weight}
        >
          {`${formatInteger(Number(props.value))} ${name}`}
        </text>
      );
    };

  const referenceLabel = (text: string, position: 'insideTopRight' | 'insideBottomRight') => ({
    value: text,
    position,
    fill: palette.muted,
    fontSize: CHART_TYPOGRAPHY.tick.size,
  });

  return (
    <ChartFigure
      title={title}
      subtitle={
        client
          ? `${client.clientName} em azul; média da carteira em cinza · health 0–100 por período`
          : 'Média da carteira (cinza) · health 0–100 por período · escolha um cliente para destacar'
      }
      summary={summary}
      reloading={reloading}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Média da carteira</TableHead>
              {client ? <TableHead className="text-right">{client.clientName}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.periodEnd}>
                <TableCell>{point.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {point.portfolio === null
                    ? '—'
                    : `${formatInteger(point.portfolio)} · ${healthClassLabel(classifyHealthWith(point.portfolio, thresholds))}`}
                </TableCell>
                {client ? (
                  <TableCell className="text-right tabular-nums">
                    {point.client === null
                      ? '—'
                      : `${formatInteger(point.client)} · ${healthClassLabel(classifyHealthWith(point.client, thresholds))}`}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <div style={{ height: 260 }} className="w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 640, height: 260 }}
        >
          <LineChart
            data={data}
            margin={{ top: 12, right: 132, bottom: 4, left: 0 }}
            style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
          >
            <XAxis
              dataKey="label"
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              tick={{ fill: palette.muted, fontSize: CHART_TYPOGRAPHY.tick.size }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, thresholds.critical, thresholds.risk, thresholds.attention, 100]}
              width={32}
              axisLine={false}
              tickLine={false}
              tick={{ fill: palette.muted, fontSize: CHART_TYPOGRAPHY.tick.size }}
            />
            <ReferenceLine
              y={thresholds.attention}
              stroke={palette.grid}
              label={referenceLabel('Normal', 'insideTopRight')}
            />
            <ReferenceLine
              y={thresholds.risk}
              stroke={palette.grid}
              label={referenceLabel('Atenção', 'insideTopRight')}
            />
            <ReferenceLine
              y={thresholds.critical}
              stroke={palette.grid}
              label={referenceLabel('Risco', 'insideTopRight')}
            />
            <ReferenceLine
              y={thresholds.critical}
              stroke="none"
              label={referenceLabel('Crítico', 'insideBottomRight')}
            />
            <Tooltip
              cursor={{ stroke: palette.grid }}
              content={({ active, payload }) => {
                const datum = payload?.[0]?.payload as Datum | undefined;
                if (!active || !datum) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
                    <p className="font-medium">{datum.label}</p>
                    <p className="text-muted-foreground">
                      Média da carteira:{' '}
                      {datum.portfolio === null
                        ? 'sem dado'
                        : `${formatInteger(datum.portfolio)} — ${healthClassLabel(classifyHealthWith(datum.portfolio, thresholds))}`}
                    </p>
                    {client ? (
                      <p className="text-muted-foreground">
                        {client.clientName}:{' '}
                        {datum.client === null
                          ? 'sem dado'
                          : `${formatInteger(datum.client)} — ${healthClassLabel(classifyHealthWith(datum.client, thresholds))}`}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              name="Média da carteira"
              stroke={palette.neutralStrong}
              strokeWidth={CHART_MARKS.lineWidth}
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: CHART_MARKS.pointDiameter / 2, strokeWidth: CHART_MARKS.pointRing }}
              connectNulls
              isAnimationActive={false}
            >
              <LabelList
                dataKey="portfolio"
                content={renderLastLabel(palette.inkSecondary, 'média')}
              />
            </Line>
            {client ? (
              <Line
                type="monotone"
                dataKey="client"
                name={client.clientName}
                stroke={palette.accent}
                strokeWidth={CHART_MARKS.lineWidth}
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: CHART_MARKS.pointDiameter / 2, strokeWidth: CHART_MARKS.pointRing }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="client"
                  content={renderLastLabel(palette.ink, client.clientName)}
                />
              </Line>
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
