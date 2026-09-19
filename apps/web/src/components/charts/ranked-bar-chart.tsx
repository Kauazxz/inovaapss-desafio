import { BarChart3, TableProperties } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
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

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHART_MARKS, CHART_TYPOGRAPHY, useChartPalette, withOpacity } from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';

export interface RankedBarDatum {
  id: string;
  /** Rótulo direto à esquerda da barra (ex.: "#2 · Beta S.A."). */
  label: string;
  value: number;
  /** Recebe a cor de destaque. Só quem a história aponta; o resto fica cinza. */
  highlighted?: boolean;
  /** Anotação curta (ex.: a principal evidência). Vai para o tooltip e a tabela. */
  note?: string;
}

export interface RankedBarChartProps {
  /** O "e daí?" — a conclusão, não a descrição do eixo (DATAVIZ.md §1.5). */
  title: string;
  /** Janela, fonte, ressalvas ("projeção por tendência — não é modelo preditivo"). */
  subtitle?: string;
  data: readonly RankedBarDatum[];
  /** Nome da medida, para a tabela e o tooltip (ex.: "Prioridade"). */
  valueLabel: string;
  /** Nome da coluna de rótulos na tabela (ex.: "Cliente"). */
  labelHeading?: string;
  /** Nome da coluna de anotações na tabela (ex.: "Principal evidência"). */
  noteHeading?: string;
  /** Escala máxima do eixo (padrão: o maior valor). O eixo sempre começa em zero. */
  maxValue?: number;
  formatValue?: (value: number) => string;
  /** Clique numa barra ou linha da tabela (ex.: abrir /clients/:id). */
  onSelect?: (id: string) => void;
}

/**
 * Barras horizontais ordenadas — o visual padrão para ranking (DATAVIZ.md §1.2).
 * Sem gridlines, sem legenda, cinza por padrão e uma cor de destaque; valor na ponta da barra;
 * "Ver como tabela" como irmão obrigatório (§1.8). Cores só de chart-theme.ts.
 */
export function RankedBarChart({
  title,
  subtitle,
  data,
  valueLabel,
  labelHeading = 'Item',
  noteHeading = 'Observação',
  maxValue,
  formatValue = formatInteger,
  onSelect,
}: RankedBarChartProps) {
  const palette = useChartPalette();
  const titleId = useId();
  const [showTable, setShowTable] = useState(false);

  // Ranking é sempre pelo valor, do maior para o menor (§1.7).
  const rows = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data]);
  const domainMax = maxValue ?? Math.max(0, ...rows.map((row) => row.value));
  const height = Math.max(CHART_MARKS.minHeight, rows.length * (CHART_MARKS.rowHeight + 12) + 16);
  const hasNotes = rows.some((row) => row.note);

  return (
    <figure aria-labelledby={titleId} className="min-w-0">
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-semibold leading-snug">
            {title}
          </h3>
          {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showTable}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? <BarChart3 aria-hidden="true" /> : <TableProperties aria-hidden="true" />}
          {showTable ? 'Ver como gráfico' : 'Ver como tabela'}
        </Button>
      </figcaption>

      {showTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{labelHeading}</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
              {hasNotes ? <TableHead>{noteHeading}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={row.id}
                onClick={onSelect ? () => onSelect(row.id) : undefined}
                className={onSelect ? 'cursor-pointer' : undefined}
              >
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className={row.highlighted ? 'font-medium' : undefined}>
                  {row.label}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatValue(row.value)}</TableCell>
                {hasNotes ? (
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {row.note ?? '—'}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
              barCategoryGap={CHART_MARKS.barGap}
              style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily }}
            >
              <XAxis type="number" domain={[0, domainMax]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={170}
                interval={0}
                axisLine={false}
                tickLine={false}
                tick={{ fill: palette.inkSecondary, fontSize: CHART_TYPOGRAPHY.directLabel.size }}
              />
              <Tooltip
                cursor={{ fill: withOpacity(palette.accent, 0.06) }}
                content={({ active, payload }) => {
                  const datum = payload?.[0]?.payload as RankedBarDatum | undefined;
                  if (!active || !datum) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
                      <p className="font-medium">{datum.label}</p>
                      <p className="text-muted-foreground">
                        {valueLabel}: {formatValue(datum.value)}
                      </p>
                      {datum.note ? <p className="text-muted-foreground">{datum.note}</p> : null}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                barSize={20}
                radius={[0, CHART_MARKS.barRadius, CHART_MARKS.barRadius, 0]}
                isAnimationActive={false}
                onClick={(entry) => {
                  const datum = (entry as unknown as { payload?: RankedBarDatum }).payload;
                  if (datum && onSelect) onSelect(datum.id);
                }}
              >
                {rows.map((row) => (
                  <Cell
                    key={row.id}
                    fill={row.highlighted ? palette.accent : palette.neutral}
                    cursor={onSelect ? 'pointer' : undefined}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  offset={8}
                  formatter={(value: unknown) => formatValue(Number(value))}
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
      )}
    </figure>
  );
}
