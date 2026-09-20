import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import {
  HEALTH_CLASS_LABELS,
  PROJECTION_CONFIDENCE_LABELS,
  type HealthTrend,
  type RankingRow,
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
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

import { HealthPill, PriorityPill } from './HealthPill';

export interface RankingTableProps {
  /** Já ordenado por prioridade pela API; a tabela mostra a lista na ordem recebida. */
  rows: RankingRow[];
  /** CTA "Analisar" → /clients/:id. */
  onSelect: (clientId: string) => void;
}

const COLUMNS: { label: string; numeric?: boolean }[] = [
  { label: 'Prioridade' },
  { label: 'Cliente' },
  { label: 'Health', numeric: true },
  { label: 'Health projetado', numeric: true },
  { label: 'Risco', numeric: true },
  { label: 'Confiança', numeric: true },
  { label: 'Valor mensal', numeric: true },
];

const TREND_TEXT: Readonly<Record<HealthTrend, string>> = {
  up: 'tendência de melhora',
  down: 'tendência de queda',
  stable: 'tendência estável',
  unknown: 'tendência desconhecida',
};

function TrendIcon({ trend }: { trend: HealthTrend }) {
  const Icon = trend === 'down' ? TrendingDown : trend === 'up' ? TrendingUp : Minus;
  return (
    <>
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{TREND_TEXT[trend]}</span>
    </>
  );
}

/** Valor mensal ponderado pelo risco (`mrr × risco / 100`): o quanto da receita está em jogo. */
function revenueAtRisk(row: RankingRow): number {
  return (row.mrr * row.riskScore) / 100;
}

/**
 * Tabela de ranking (§39): Prioridade, Cliente, Health (número + pílula da classe), Health
 * projetado e Confiança da projeção (irmã do gráfico — DATAVIZ.md §5.1), Risco, Confiança,
 * Valor mensal (com a receita em risco), Principal evidência (com a ação sugerida), Ação.
 * Lista fixa, na ordem de prioridade: o representante não reordena nem filtra.
 */
export function RankingTable({ rows, onSelect }: RankingTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead
              key={column.label}
              scope="col"
              className={cn(column.numeric && 'text-right')}
            >
              {column.label}
            </TableHead>
          ))}
          <TableHead scope="col">Principal evidência</TableHead>
          <TableHead scope="col">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={COLUMNS.length + 2}
              className="py-8 text-center text-muted-foreground"
            >
              Nenhum cliente para acompanhar.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.clientId} data-client-id={row.clientId}>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 text-right tabular-nums text-muted-foreground">
                    {row.position}
                  </span>
                  <PriorityPill priorityClass={row.priorityClass} />
                  <span className="sr-only">, prioridade {formatInteger(row.priorityScore)}</span>
                </span>
              </TableCell>
              <TableCell className="font-medium">{row.clientName}</TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  <span className="tabular-nums">{formatInteger(row.healthCurrent)}</span>
                  <HealthPill healthClass={row.currentClass} />
                  <TrendIcon trend={row.trend} />
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.healthProjected === null ? (
                  <span className="text-muted-foreground">sem projeção</span>
                ) : (
                  <span className={cn(row.crossesDown && 'font-semibold')}>
                    {formatInteger(row.healthProjected)}
                    <span className="ml-1 text-muted-foreground">
                      {HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]} · confiança{' '}
                      {PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}
                    </span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInteger(row.riskScore)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.confidence)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatCurrency(row.mrr)}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatCurrency(revenueAtRisk(row))} em risco
                </span>
              </TableCell>
              <TableCell className="max-w-72 whitespace-normal">
                <span className="block">{row.topEvidence}</span>
                <span className="block text-xs text-muted-foreground">→ {row.suggestedAction}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => onSelect(row.clientId)}
                  aria-label={`Analisar ${row.clientName}`}
                >
                  Analisar
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
