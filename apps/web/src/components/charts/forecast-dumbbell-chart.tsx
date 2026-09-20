import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import {
  HEALTH_CLASS_LABELS,
  PRIORITY_CLASS_LABELS,
  PROJECTION_CONFIDENCE_LABELS,
  type ForecastChartData,
  type ForecastRow,
} from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
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
  healthBandsFromThresholds,
  useChartPalette,
  withOpacity,
} from '@/lib/chart-theme';
import { formatCompactCurrency, formatCurrency, formatInteger, formatPercent } from '@/lib/format';

import { ChartFigure } from './chart-figure';
import { forecastSubtitle, forecastSummary, forecastTitle } from './titles';
import { useElementWidth } from './use-element-width';

/*
 * Por que SVG próprio e não Recharts: o Recharts não tem um dumbbell nativo. Montar um com
 * ScatterChart + ErrorBar (ou Bar invisível + Scatter) perde três coisas que DATAVIZ.md §5 exige:
 * a seta apontando para onde o cliente vai, os rótulos diretos nas duas pontas de cada linha
 * (nome + MRR à esquerda, evidência à direita) sem colisão, e a linha inteira como alvo de clique
 * e de foco por teclado (o Recharts só foca o ponto). Com SVG direto o gráfico tem ~200 linhas,
 * usa só os tokens de chart-theme.ts e é mais leve que um chunk extra do Recharts.
 */

const ROW_HEIGHT = 32; // ≥ 24 px de área de clique (DATAVIZ.md §2.3)
const HEADER_HEIGHT = 28; // nomes das faixas
const FOOTER_HEIGHT = 22; // ticks 0 · 40 · 60 · 80 · 100
const EVIDENCE_WIDTH = 224;
const PLOT_PADDING = 14;
const VALUE_GAP = 4;

export interface ForecastDumbbellChartProps {
  data: ForecastChartData;
  /** Clique ou Enter numa linha (ex.: abrir /clients/:id). */
  onSelect?: ((clientId: string) => void) | undefined;
  /** Linhas visíveis de início e máximo antes de mandar para a tabela (DATAVIZ.md §5.1). */
  initialRows?: number | undefined;
  maxRows?: number | undefined;
  reloading?: boolean | undefined;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}

/**
 * Gráfico de forecast priorizado (ajuste A2; DATAVIZ.md §5): dumbbell horizontal, uma linha por
 * cliente ordenado por prioridade; ponto cinza = health atual, seta = projetado; cor só em quem
 * cruza para Risco ou Crítico; rótulo direto dos dois lados; clique leva ao cliente.
 */
export function ForecastDumbbellChart({
  data,
  onSelect,
  initialRows = 10,
  maxRows = 25,
  reloading = false,
}: ForecastDumbbellChartProps) {
  const palette = useChartPalette();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [visibleCount, setVisibleCount] = useState(initialRows);
  const [activeId, setActiveId] = useState<string | null>(null);

  const rows = useMemo(
    () => [...data.rows].sort((a, b) => b.priorityScore - a.priorityScore),
    [data.rows],
  );
  const visible = rows.slice(0, Math.min(visibleCount, maxRows));
  const bands = healthBandsFromThresholds(data.thresholds);

  // Colunas: rótulo à esquerda, área do gráfico, evidência à direita (some em telas estreitas).
  const showEvidence = width >= 760;
  const labelWidth = width < 520 ? 150 : 236;
  const nameChars = width < 520 ? 14 : 24;
  const plotLeft = labelWidth + PLOT_PADDING;
  const plotRight = width - (showEvidence ? EVIDENCE_WIDTH : 0) - PLOT_PADDING - 16;
  const x = (health: number) => plotLeft + (health / 100) * (plotRight - plotLeft);
  const height = HEADER_HEIGHT + visible.length * ROW_HEIGHT + FOOTER_HEIGHT;
  const plotTop = HEADER_HEIGHT - 4;
  const plotBottom = HEADER_HEIGHT + visible.length * ROW_HEIGHT;

  const active = visible.find((row) => row.clientId === activeId) ?? null;
  const activeIndex = active ? visible.indexOf(active) : -1;

  const handleKey = (event: KeyboardEvent<SVGGElement>, clientId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(clientId);
    }
  };

  const actions =
    rows.length > initialRows ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          setVisibleCount((count) =>
            count > initialRows ? initialRows : Math.min(maxRows, rows.length),
          )
        }
      >
        {visibleCount > initialRows
          ? 'Mostrar menos'
          : `Mostrar mais (${Math.min(maxRows, rows.length) - initialRows})`}
      </Button>
    ) : null;

  return (
    <ChartFigure
      title={forecastTitle(data)}
      subtitle={forecastSubtitle(data)}
      summary={forecastSummary(data, visible.length)}
      actions={actions}
      reloading={reloading}
      table={<ForecastTable rows={rows} onSelect={onSelect} />}
    >
      <div ref={containerRef} className="relative w-full">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="list"
          aria-label="Clientes ordenados por prioridade, saúde atual e projetada"
          style={{ fontFamily: CHART_TYPOGRAPHY.fontFamily, display: 'block' }}
        >
          {/* Faixas de classe ao fundo (band.fill) e nomes acima de cada faixa */}
          {bands.map((band) => (
            <g key={band.healthClass}>
              <rect
                x={x(band.from)}
                y={plotTop}
                width={Math.max(0, x(band.to) - x(band.from))}
                height={plotBottom - plotTop}
                fill={bandFill(palette, band.healthClass)}
              />
              <text
                x={(x(band.from) + x(band.to)) / 2}
                y={HEADER_HEIGHT - 12}
                textAnchor="middle"
                fill={palette.muted}
                fontSize={CHART_TYPOGRAPHY.tick.size}
              >
                {HEALTH_CLASS_LABELS[band.healthClass]}
              </text>
            </g>
          ))}
          {/* Linhas de referência nos thresholds vigentes + ticks */}
          {[0, data.thresholds.critical, data.thresholds.risk, data.thresholds.attention, 100].map(
            (value) => (
              <g key={value}>
                <line
                  x1={x(value)}
                  x2={x(value)}
                  y1={plotTop}
                  y2={plotBottom}
                  stroke={palette.grid}
                  strokeWidth={CHART_MARKS.referenceLineWidth}
                />
                <text
                  x={x(value)}
                  y={height - 6}
                  textAnchor="middle"
                  fill={palette.muted}
                  fontSize={CHART_TYPOGRAPHY.tick.size}
                >
                  {value}
                </text>
              </g>
            ),
          )}

          {visible.map((row, index) => {
            const rowTop = HEADER_HEIGHT + index * ROW_HEIGHT;
            const cy = rowTop + ROW_HEIGHT / 2;
            const isActive = row.clientId === activeId;
            const moveColor = row.crossesDown ? palette.accent : palette.neutral;
            const projected = row.healthProjected;
            const label = `#${index + 1} ${row.clientName}, ${formatCompactCurrency(row.mrr)} por ${'mês'}. Saúde atual ${formatInteger(row.healthCurrent)} de 100, ${HEALTH_CLASS_LABELS[row.currentClass]}. ${
              projected === null
                ? 'Sem histórico suficiente para projetar.'
                : `Saúde projetada ${formatInteger(projected)} de 100, ${HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]}, confiança da projeção ${PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}.`
            } ${row.topEvidence}.`;

            return (
              <g
                key={row.clientId}
                role="listitem"
                tabIndex={0}
                aria-label={label}
                data-client-id={row.clientId}
                style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
                onClick={() => onSelect?.(row.clientId)}
                onKeyDown={(event) => handleKey(event, row.clientId)}
                onMouseEnter={() => setActiveId(row.clientId)}
                onMouseLeave={() =>
                  setActiveId((current) => (current === row.clientId ? null : current))
                }
                onFocus={() => setActiveId(row.clientId)}
                onBlur={() => setActiveId((current) => (current === row.clientId ? null : current))}
              >
                {/* Área de clique/hover da linha inteira */}
                <rect
                  x={0}
                  y={rowTop}
                  width={width}
                  height={ROW_HEIGHT}
                  rx={4}
                  fill={isActive ? withOpacity(palette.accent, 0.06) : 'transparent'}
                  stroke={isActive ? palette.accent : 'none'}
                  strokeWidth={1}
                />

                {/* Rótulo direto à esquerda: #posição · Nome · MRR */}
                <text
                  x={8}
                  y={cy}
                  dominantBaseline="middle"
                  fill={palette.ink}
                  fontSize={CHART_TYPOGRAPHY.directLabel.size}
                  fontWeight={CHART_TYPOGRAPHY.directLabel.weight}
                >
                  <tspan fill={palette.muted}>{`#${index + 1}`}</tspan>
                  <tspan dx={6}>{truncate(row.clientName, nameChars)}</tspan>
                  <tspan dx={6} fill={palette.inkSecondary} fontWeight={400}>
                    {formatCompactCurrency(row.mrr)}
                  </tspan>
                </text>

                {/* Deslocamento atual → projetado */}
                {projected !== null && projected !== row.healthCurrent ? (
                  <DumbbellMove
                    from={x(row.healthCurrent)}
                    to={x(projected)}
                    y={cy}
                    color={moveColor}
                  />
                ) : null}

                {/* Ponto do health atual (cinza forte) */}
                <circle
                  cx={x(row.healthCurrent)}
                  cy={cy}
                  r={CHART_MARKS.pointDiameter / 2 + 1}
                  fill={palette.neutralStrong}
                  stroke={palette.surface}
                  strokeWidth={CHART_MARKS.pointRing}
                />
                <text
                  x={x(row.healthCurrent)}
                  y={cy - CHART_MARKS.pointDiameter / 2 - VALUE_GAP}
                  textAnchor="middle"
                  fill={palette.inkSecondary}
                  fontSize={CHART_TYPOGRAPHY.tick.size}
                >
                  {formatInteger(row.healthCurrent)}
                </text>

                {projected === null ? (
                  <text
                    x={x(row.healthCurrent) + CHART_MARKS.pointDiameter + 4}
                    y={cy}
                    dominantBaseline="middle"
                    fill={palette.muted}
                    fontSize={CHART_TYPOGRAPHY.annotation.size}
                    fontStyle="italic"
                  >
                    sem histórico — sem projeção · confiança baixa
                  </text>
                ) : projected !== row.healthCurrent ? (
                  <text
                    x={x(projected)}
                    y={cy + CHART_MARKS.pointDiameter / 2 + VALUE_GAP + CHART_TYPOGRAPHY.tick.size}
                    textAnchor="middle"
                    fill={row.crossesDown ? palette.ink : palette.inkSecondary}
                    fontSize={CHART_TYPOGRAPHY.tick.size}
                    fontWeight={row.crossesDown ? 600 : 400}
                  >
                    {formatInteger(projected)}
                  </text>
                ) : (
                  <text
                    x={x(row.healthCurrent) + CHART_MARKS.pointDiameter + 4}
                    y={cy}
                    dominantBaseline="middle"
                    fill={palette.muted}
                    fontSize={CHART_TYPOGRAPHY.annotation.size}
                  >
                    estável
                  </text>
                )}

                {/* Principal evidência à direita */}
                {showEvidence ? (
                  <text
                    x={width - EVIDENCE_WIDTH + 8}
                    y={cy}
                    dominantBaseline="middle"
                    fill={palette.inkSecondary}
                    fontSize={CHART_TYPOGRAPHY.annotation.size}
                  >
                    {truncate(row.topEvidence, 36)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {active ? (
          <div
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm"
            style={{
              top: HEADER_HEIGHT + (activeIndex + 1) * ROW_HEIGHT + 2,
              left: Math.min(Math.max(0, x(active.healthCurrent) - 80), Math.max(0, width - 288)),
            }}
          >
            <ForecastTooltip row={active} />
          </div>
        ) : null}
      </div>
      {rows.length > maxRows ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Mostrando {visible.length} de {rows.length} clientes — os demais estão na tabela de
          ranking.
        </p>
      ) : null}
    </ChartFigure>
  );
}

/** Segmento atual → projetado com a ponta de seta apontando para onde o cliente vai. */
function DumbbellMove({
  from,
  to,
  y,
  color,
}: {
  from: number;
  to: number;
  y: number;
  color: string;
}) {
  const direction = to >= from ? 1 : -1;
  const size = CHART_MARKS.arrowSize;
  const tip = to;
  const base = to - direction * size;
  return (
    <g>
      <line
        x1={from}
        x2={base}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={CHART_MARKS.dumbbellStroke}
        strokeLinecap="round"
      />
      <polygon
        points={`${tip},${y} ${base},${y - size * 0.8} ${base},${y + size * 0.8}`}
        fill={color}
      />
    </g>
  );
}

/** Tooltip com o contexto do §58: score, classe, tendência, confiança, motivo, ação de análise. */
function ForecastTooltip({ row }: { row: ForecastRow }) {
  return (
    <>
      <p className="font-medium">{row.clientName}</p>
      <p className="text-muted-foreground">
        Saúde atual: {formatInteger(row.healthCurrent)}/100 —{' '}
        {HEALTH_CLASS_LABELS[row.currentClass]}
      </p>
      <p className="text-muted-foreground">
        {row.healthProjected === null
          ? 'Saúde projetada: sem histórico suficiente'
          : `Saúde projetada: ${formatInteger(row.healthProjected)}/100 — ${HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]} (confiança da projeção ${PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]})`}
      </p>
      <p className="text-muted-foreground">
        Prioridade: {formatInteger(row.priorityScore)} — {PRIORITY_CLASS_LABELS[row.priorityClass]}{' '}
        · Confiança dos dados: {formatPercent(row.confidence)} · MRR: {formatCurrency(row.mrr)}
      </p>
      <p className="mt-1">{row.topEvidence}</p>
    </>
  );
}

/** Irmão em tabela: as mesmas linhas com os mesmos números (DATAVIZ.md §5.5). */
function ForecastTable({
  rows,
  onSelect,
}: {
  rows: readonly ForecastRow[];
  onSelect?: ((clientId: string) => void) | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead className="text-right">Valor mensal</TableHead>
          <TableHead className="text-right">Saúde atual</TableHead>
          <TableHead className="text-right">Saúde projetada</TableHead>
          <TableHead>Confiança da projeção</TableHead>
          <TableHead className="text-right">Confiança dos dados</TableHead>
          <TableHead>Principal evidência</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.clientId}
            onClick={onSelect ? () => onSelect(row.clientId) : undefined}
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className={row.crossesDown ? 'font-medium' : undefined}>
              {row.clientName}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(row.mrr)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatInteger(row.healthCurrent)}/100 · {HEALTH_CLASS_LABELS[row.currentClass]}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.healthProjected === null
                ? 'sem projeção'
                : `${formatInteger(row.healthProjected)}/100 · ${HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]}`}
            </TableCell>
            <TableCell>{PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.confidence)}
            </TableCell>
            <TableCell className="whitespace-normal text-muted-foreground">
              {row.topEvidence}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
