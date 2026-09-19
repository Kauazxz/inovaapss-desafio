import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { HEALTH_CLASS_LABELS, type ClassDistributionItem } from '@inovaapss/shared';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHART_MARKS, CHART_TYPOGRAPHY, useChartPalette, withOpacity } from '@/lib/chart-theme';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';

import { ChartFigure } from './chart-figure';
import { distributionTitle } from './titles';

export interface ClassDistributionChartProps {
  /** As 4 classes, na ordem Crítico → Normal (a API já manda assim). */
  distribution: ClassDistributionItem[];
  reloading?: boolean | undefined;
}

interface Datum extends ClassDistributionItem {
  label: string;
  valueLabel: string;
}

/**
 * Distribuição Normal / Atenção / Risco / Crítico em barra horizontal ordenada, Crítico no topo,
 * contagem e % na ponta, cor da classe sempre com o nome escrito. Nunca pizza (ajuste A1).
 */
export function ClassDistributionChart({ distribution, reloading }: ClassDistributionChartProps) {
  const palette = useChartPalette();
  const total = distribution.reduce((sum, item) => sum + item.count, 0);

  const data: Datum[] = distribution.map((item) => ({
    ...item,
    label: HEALTH_CLASS_LABELS[item.healthClass],
    valueLabel: `${formatInteger(item.count)} · ${formatPercent(Math.round(item.share * 100))}`,
  }));
  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const height = Math.max(CHART_MARKS.minHeight, data.length * (CHART_MARKS.rowHeight + 12) + 16);

  const summary = `${distributionTitle(distribution)}. ${data
    .map((item) => `${item.label}: ${item.valueLabel}`)
    .join('; ')}. Total de ${formatInteger(total)} clientes ativos.`;

  return (
    <ChartFigure
      title={distributionTitle(distribution)}
      subtitle="Clientes ativos por classe de saúde no último período"
      summary={summary}
      reloading={reloading}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Classe</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead className="text-right">Participação</TableHead>
              <TableHead className="text-right">MRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.healthClass}>
                <TableCell>{item.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInteger(item.count)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(Math.round(item.share * 100))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(item.mrr)}
                </TableCell>
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
            margin={{ top: 4, right: 88, bottom: 4, left: 8 }}
            barCategoryGap={CHART_MARKS.barGap}
            style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
          >
            <XAxis type="number" domain={[0, maxCount]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={72}
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={{ fill: palette.ink, fontSize: CHART_TYPOGRAPHY.directLabel.size }}
            />
            <Tooltip
              cursor={{ fill: withOpacity(palette.accent, 0.06) }}
              content={({ active, payload }) => {
                const datum = payload?.[0]?.payload as Datum | undefined;
                if (!active || !datum) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
                    <p className="font-medium">{datum.label}</p>
                    <p className="text-muted-foreground">{datum.valueLabel} dos clientes ativos</p>
                    <p className="text-muted-foreground">MRR: {formatCurrency(datum.mrr)}</p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="count"
              barSize={20}
              radius={[0, CHART_MARKS.barRadius, CHART_MARKS.barRadius, 0]}
              isAnimationActive={false}
            >
              {data.map((item) => (
                <Cell key={item.healthClass} fill={palette.classes[item.healthClass]} />
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
