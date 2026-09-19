import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { type DimensionHealth, type HealthThresholds } from '@inovaapss/shared';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  bandFill,
  CHART_MARKS,
  CHART_TYPOGRAPHY,
  classifyHealthWith,
  healthClassLabel,
  useChartPalette,
  withOpacity,
} from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';

import { ChartFigure } from './chart-figure';
import { dimensionTitle } from './titles';

export interface DimensionHealthChartProps {
  /** Ordenadas da pior para a melhor (a API já manda assim). */
  dimensions: DimensionHealth[];
  /** Faixa-alvo desenhada ao fundo (80–100 por padrão). */
  targetBand: { min: number; max: number };
  thresholds: HealthThresholds;
  reloading?: boolean | undefined;
}

interface Datum extends DimensionHealth {
  /** Valor da barra (0 quando N/A, para a linha existir com o rótulo "N/A"). */
  bar: number;
  valueLabel: string;
  highlighted: boolean;
}

/**
 * Saúde por dimensão (DATAVIZ.md §4.2): barras horizontais cinza, da pior para a melhor, com a
 * faixa-alvo ao fundo; a dimensão abaixo de `thresholds.risk` recebe destaque e anotação.
 */
export function DimensionHealthChart({
  dimensions,
  targetBand,
  thresholds,
  reloading,
}: DimensionHealthChartProps) {
  const palette = useChartPalette();

  const data: Datum[] = dimensions.map((dimension) => {
    const highlighted = dimension.health !== null && dimension.health < thresholds.risk;
    return {
      ...dimension,
      bar: dimension.health ?? 0,
      highlighted,
      valueLabel:
        dimension.health === null
          ? 'N/A — sem dado'
          : highlighted
            ? `${formatInteger(dimension.health)} · abaixo de ${thresholds.risk}`
            : formatInteger(dimension.health),
    };
  });
  const height = Math.max(CHART_MARKS.minHeight, data.length * (CHART_MARKS.rowHeight + 12) + 28);
  const title = dimensionTitle(dimensions, targetBand, thresholds);
  const summary = `${title}. ${data
    .map((item) => `${item.label}: ${item.valueLabel} (${item.clientCount} clientes)`)
    .join('; ')}. Faixa-alvo de ${targetBand.min} a ${targetBand.max}.`;

  return (
    <ChartFigure
      title={title}
      subtitle={`Média dos clientes ativos por dimensão (0–100) · faixa-alvo ${targetBand.min}–${targetBand.max} ao fundo`}
      summary={summary}
      reloading={reloading}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dimensão</TableHead>
              <TableHead className="text-right">Média</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead className="text-right">Clientes com dado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.key}>
                <TableCell>{item.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.health === null ? 'N/A' : formatInteger(item.health)}
                </TableCell>
                <TableCell>
                  {item.health === null
                    ? 'sem dado'
                    : healthClassLabel(classifyHealthWith(item.health, thresholds))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.clientCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 120, bottom: 4, left: 8 }}
            barCategoryGap={CHART_MARKS.barGap}
            style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, thresholds.critical, thresholds.risk, thresholds.attention, 100]}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              tick={{ fill: palette.muted, fontSize: CHART_TYPOGRAPHY.tick.size }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={96}
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={{ fill: palette.ink, fontSize: CHART_TYPOGRAPHY.directLabel.size }}
            />
            <ReferenceArea
              x1={targetBand.min}
              x2={targetBand.max}
              fill={bandFill(palette, 'NORMAL')}
              stroke="none"
              label={{
                value: 'faixa-alvo',
                position: 'insideTop',
                fill: palette.muted,
                fontSize: CHART_TYPOGRAPHY.tick.size,
              }}
            />
            <Tooltip
              cursor={{ fill: withOpacity(palette.accent, 0.06) }}
              content={({ active, payload }) => {
                const datum = payload?.[0]?.payload as Datum | undefined;
                if (!active || !datum) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
                    <p className="font-medium">{datum.label}</p>
                    <p className="text-muted-foreground">
                      {datum.health === null
                        ? 'N/A — nenhuma métrica desta dimensão tem dado'
                        : `Média ${formatInteger(datum.health)} — ${healthClassLabel(classifyHealthWith(datum.health, thresholds))}`}
                    </p>
                    <p className="text-muted-foreground">{datum.clientCount} clientes com dado</p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="bar"
              barSize={20}
              radius={[0, CHART_MARKS.barRadius, CHART_MARKS.barRadius, 0]}
              isAnimationActive={false}
            >
              {data.map((item) => (
                <Cell key={item.key} fill={item.highlighted ? palette.accent : palette.neutral} />
              ))}
              <LabelList
                dataKey="valueLabel"
                position="right"
                offset={8}
                style={{
                  fill: palette.ink,
                  fontSize: CHART_TYPOGRAPHY.directLabel.size,
                  fontWeight: CHART_TYPOGRAPHY.directLabel.weight,
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
